import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

// Execute the actual provider code; replace only its platform secret binding.
// Fixture responses represent the two distinct upstream schemas.
const fixture = { env: {} };
globalThis.__frameMovieTest = fixture;
const compile = (source) => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const movieUrl = moduleUrl(compile(readFileSync(new URL("../lib/movies.ts", import.meta.url), "utf8")));
const source = readFileSync(new URL("../lib/movie-provider.ts", import.meta.url), "utf8")
  .replace('"./movies"', JSON.stringify(movieUrl))
  .replace('await import("cloudflare:workers")', "{ env: globalThis.__frameMovieTest.env }");
const provider = await import(moduleUrl(compile(source)));
const appleMovie = {
  kind: "feature-movie", trackId: 12345, trackName: "A Future Film", releaseDate: "2026-05-01T00:00:00Z",
  primaryGenreName: "Sci-Fi & Fantasy", trackTimeMillis: 7200000,
  artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/movie/Film_EN_2000x3000.jpg/100x100bb.jpg",
  trackViewUrl: "https://tv.apple.com/movie/test", previewUrl: "https://video.apple.com/trailer.mp4",
  longDescription: "A film about a journey through space.",
};
const feedEntry = (id, title, date) => ({
  id: { attributes: { "im:id": String(id) }, label: `https://tv.apple.com/movie/${id}` },
  "im:name": { label: title }, "im:releaseDate": { label: date },
  "im:image": [{ label: "https://is1-ssl.mzstatic.com/image/thumb/movie/UNI_Title_600x900bb.png/115x170bb.png" }],
  link: [{ attributes: { type: "video/x-m4v", rel: "enclosure", href: "https://video.apple.com/preview.m4v" } }],
  category: { attributes: { label: "Action & Adventure" } }, summary: { label: "A movie story." },
});

test("Apple results preserve unavailable ratings and normalize artwork, duration, and the sci-fi genre", async (context) => {
  context.mock.method(globalThis, "fetch", async (url) => {
    const request = new URL(url);
    assert.equal(request.origin, "https://itunes.apple.com");
    assert.equal(request.searchParams.get("country"), "in");
    return Response.json({ results: [appleMovie, { ...appleMovie, kind: "song", trackId: 678 }] });
  });
  const result = await provider.getMovieCatalog({ q: "fixture-schema", genre: "Sci-Fi", country: "IN" });
  assert.equal(result.live, true);
  assert.equal(result.source, "Apple iTunes");
  assert.equal(result.movies.length, 1);
  assert.equal(result.movies[0].rating, null);
  assert.equal(result.movies[0].duration, 120);
  assert.ok(result.movies[0].poster.endsWith("600x900bb.jpg"));
  assert.ok(result.movies[0].poster.includes("/Film_EN_2000x3000.jpg/"), "original filenames with dimensions remain intact");
  assert.equal(result.movies[0].trailer, appleMovie.previewUrl);
  assert.equal(result.movies[0].storeUrl, appleMovie.trackViewUrl);
});

test("a live chart keeps the latest tab useful when Apple's current-year search is empty", async (context) => {
  const calls = [];
  context.mock.method(globalThis, "fetch", async (url) => {
    calls.push(url);
    return Response.json(String(url).includes("/search?") ? { resultCount: 0, results: [] } : {
      feed: { entry: [feedEntry(1, "Earlier movie", "2025-03-01"), feedEntry(2, "Newer movie", "2026-06-01")] },
    });
  });
  const result = await provider.getMovieCatalog({ category: "latest", country: "CA" });
  assert.equal(result.live, true);
  assert.deepEqual(result.movies.map((movie) => movie.title), ["Newer movie", "Earlier movie"]);
  assert.equal(result.movies[0].poster, "https://is1-ssl.mzstatic.com/image/thumb/movie/UNI_Title_600x900bb.png/600x900bb.png");
  assert.equal(result.movies[0].trailer, "https://video.apple.com/preview.m4v");
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes("/ca/rss/topmovies/"));
  const cached = await provider.getMovieCatalog({ category: "latest", country: "CA" });
  assert.deepEqual(cached, result);
  assert.equal(calls.length, 2, "repeated filter requests use the provider cache");
});

test("an outage is visibly curated and never relabels historical films as upcoming", async (context) => {
  context.mock.method(globalThis, "fetch", async () => { throw new Error("Provider unavailable"); });
  const result = await provider.getMovieCatalog({ category: "latest", genre: "Drama", country: "GB" });
  assert.equal(result.live, false);
  assert.equal(result.source, "Curated collection");
  assert.ok(result.notice.includes("unavailable"));
  assert.ok(result.movies.length > 0);
  assert.ok(result.movies.every((movie) => movie.genres.includes("Drama") && movie.rating === null));
  const upcoming = await provider.getMovieCatalog({ category: "upcoming", country: "FR" });
  assert.equal(upcoming.live, false);
  assert.deepEqual(upcoming.movies, []);
});

test("TMDB supplies real ratings and excludes already released titles from upcoming", async (context) => {
  fixture.env.TMDB_READ_ACCESS_TOKEN = "test-placeholder-token";
  context.after(() => { delete fixture.env.TMDB_READ_ACCESS_TOKEN; });
  context.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer test-placeholder-token");
    assert.equal(new URL(url).searchParams.get("region"), "AU");
    return Response.json({ results: [
      { id: 10, title: "Future release", release_date: "2099-01-01", genre_ids: [878], vote_count: 10, vote_average: 8.2, poster_path: "/movie.jpg" },
      { id: 11, title: "Historical release", release_date: "2000-01-01", genre_ids: [878], vote_count: 0, vote_average: 0 },
    ] });
  });
  const result = await provider.getMovieCatalog({ category: "upcoming", genre: "Science Fiction", country: "AU" });
  assert.equal(result.live, true);
  assert.equal(result.source, "TMDB");
  assert.equal(result.movies.length, 1);
  assert.equal(result.movies[0].rating, 8.2);
  assert.deepEqual(result.movies[0].genres, ["Science Fiction"]);
});

test("movie details reject unexpected IDs without contacting an external URL", async (context) => {
  context.mock.method(globalThis, "fetch", async () => { assert.fail("Invalid and editorial IDs must not fetch externally"); });
  assert.equal(await provider.getMovieDetail("tmdb-1/../../private"), null);
  assert.equal(await provider.getMovieDetail("https://example.com/movie"), null);
  const dune = await provider.getMovieDetail("seed-693134");
  assert.equal(dune.title, "Dune: Part Two");
  assert.equal(dune.backdrop, "/arrakis-hero.jpg");
});

test("TMDB detail trailers choose an official YouTube trailer and reject malformed IDs", async (context) => {
  fixture.env.TMDB_READ_ACCESS_TOKEN = "test-placeholder-token";
  context.after(() => { delete fixture.env.TMDB_READ_ACCESS_TOKEN; });
  context.mock.method(globalThis, "fetch", async () => Response.json({
    id: 55, title: "Fixture Film", release_date: "2025-01-01", runtime: 120, genres: [{ name: "Action" }],
    videos: { results: [
      { site: "YouTube", type: "Trailer", official: true, key: "<script>" },
      { site: "YouTube", type: "Teaser", official: true, key: "abcdefghijk" },
      { site: "YouTube", type: "Trailer", official: false, key: "aaaaaaaaaaa" },
      { site: "YouTube", type: "Trailer", official: true, key: "AbcdEF12-_3" },
    ] },
  }));
  const movie = await provider.getMovieDetail("tmdb-55");
  assert.equal(movie.trailer, "https://www.youtube.com/watch?v=AbcdEF12-_3");
  assert.equal(movie.duration, 120);
  assert.deepEqual(movie.genres, ["Action"]);
});
