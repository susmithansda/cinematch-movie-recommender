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
const dateAt = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
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
  const result = await provider.getMovieCatalog({ q: "future", genre: "Sci-Fi", country: "IN" });
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
      feed: { entry: [feedEntry(1, "Earlier movie", "2020-03-01"), feedEntry(2, "Newer movie", dateAt(-10))] },
    });
  });
  const result = await provider.getMovieCatalog({ category: "latest", country: "CA" });
  assert.equal(result.live, true);
  assert.deepEqual(result.movies.map((movie) => movie.title), ["Newer movie"], "historical chart entries are excluded from latest");
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
      { id: 10, title: "Future release", release_date: dateAt(30), genre_ids: [878], vote_count: 10, vote_average: 8.2, poster_path: "/movie.jpg", original_language: "en" },
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

test("the Hindi shelf contains twelve real Hindi originals with distinct IDs, posters and trailers", async () => {
  const { BOLLYWOOD_MOVIES, FALLBACK_MOVIES } = await import(movieUrl);
  assert.equal(BOLLYWOOD_MOVIES.length, 12);
  assert.equal(new Set(FALLBACK_MOVIES.map((movie) => movie.id)).size, FALLBACK_MOVIES.length);
  assert.ok(BOLLYWOOD_MOVIES.every((movie) => movie.originalLanguage === "hi" && movie.industry === "bollywood" && movie.language === "Hindi"));
  assert.ok(BOLLYWOOD_MOVIES.every((movie) => movie.poster.startsWith("https://") && movie.trailer?.startsWith("https://") && movie.rating === null));
});

test("Apple Bollywood browsing uses the selected region and excludes Hindi-dubbed Telugu and Marathi originals", async (context) => {
  context.mock.method(globalThis, "fetch", async (url) => {
    assert.ok(String(url).includes("/us/rss/topmovies/limit=100/genre=4431/json"));
    return Response.json({ feed: { entry: [
      feedEntry(101, "Dangal", "2016-12-21"),
      feedEntry(102, "Raees", "2017-01-25"),
      feedEntry(103, "Baahubali - The Beginning (Hindi Version)", "2015-07-10"),
      feedEntry(104, "Sairat", "2016-04-29"),
    ] } });
  });
  const result = await provider.getMovieCatalog({ industry: "bollywood", country: "US" });
  assert.equal(result.live, true);
  assert.deepEqual(result.movies.map((movie) => movie.title), ["Dangal", "Raees"]);
  assert.ok(result.movies.every((movie) => movie.originalLanguage === "hi" && movie.industry === "bollywood"));
});

test("industry, title search, and genre filters work together when Apple's search is empty", async (context) => {
  context.mock.method(globalThis, "fetch", async (url) => Response.json(String(url).includes("/search?") ? { results: [] } : {
    feed: { entry: [feedEntry(201, "Dangal", "2016-12-21"), feedEntry(202, "Pathaan", "2023-01-25")] },
  }));
  const result = await provider.getMovieCatalog({ industry: "bollywood", q: "Dangal", genre: "Drama", country: "GB" });
  assert.equal(result.movies.length, 1);
  assert.equal(result.movies[0].title, "Dangal");
  assert.equal(result.movies[0].originalLanguage, "hi");
});

test("Hollywood does not infer English originals from an Indian or US storefront", async (context) => {
  context.mock.method(globalThis, "fetch", async (url) => {
    assert.ok(String(url).includes("/in/rss/topmovies/"));
    return Response.json({ feed: { entry: [
      feedEntry(301, "Dune: Part Two", "2024-03-01"),
      feedEntry(302, "Parasite", "2019-05-30"),
      feedEntry(303, "Dangal", "2016-12-21"),
      feedEntry(304, "Unknown original language", "2026-01-01"),
    ] } });
  });
  const result = await provider.getMovieCatalog({ industry: "hollywood", country: "IN" });
  assert.deepEqual(result.movies.map((movie) => movie.title), ["Dune: Part Two"]);
  assert.ok(result.movies.every((movie) => movie.originalLanguage === "en" && movie.industry === "hollywood"));
});

test("TMDB Hindi discovery combines original language, region, genre, and real current-release windows", async (context) => {
  fixture.env.TMDB_READ_ACCESS_TOKEN = "test-placeholder-token";
  context.after(() => { delete fixture.env.TMDB_READ_ACCESS_TOKEN; });
  context.mock.method(globalThis, "fetch", async (url) => {
    const request = new URL(url);
    assert.equal(request.pathname, "/3/discover/movie");
    assert.equal(request.searchParams.get("with_original_language"), "hi");
    assert.equal(request.searchParams.get("region"), "CA");
    assert.equal(request.searchParams.get("with_genres"), "28");
    assert.equal(request.searchParams.get("with_release_type"), "2|3");
    assert.equal(request.searchParams.get("release_date.lte"), dateAt(0));
    return Response.json({ results: [
      { id: 401, title: "Current Hindi release", release_date: dateAt(-4), genre_ids: [28], original_language: "hi" },
      { id: 402, title: "Tamil original in Hindi dub", release_date: dateAt(-4), genre_ids: [28], original_language: "ta" },
      { id: 403, title: "Historical Hindi film", release_date: "2010-01-01", genre_ids: [28], original_language: "hi" },
    ] });
  });
  const result = await provider.getMovieCatalog({ industry: "bollywood", country: "CA", category: "latest", genre: "Action" });
  assert.deepEqual(result.movies.map((movie) => movie.title), ["Current Hindi release"]);
  assert.equal(result.movies[0].originalLanguage, "hi");
});

test("TMDB search filters original language rather than response localization or title text", async (context) => {
  fixture.env.TMDB_READ_ACCESS_TOKEN = "test-placeholder-token";
  context.after(() => { delete fixture.env.TMDB_READ_ACCESS_TOKEN; });
  context.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(new URL(url).pathname, "/3/search/movie");
    return Response.json({ results: [
      { id: 501, title: "A translated Hindi title", release_date: "2023-01-01", original_language: "te" },
      { id: 502, title: "Hindi original", release_date: "2023-01-01", original_language: "hi" },
    ] });
  });
  const result = await provider.getMovieCatalog({ industry: "bollywood", q: "fixture original-language search", country: "JP" });
  assert.deepEqual(result.movies.map((movie) => movie.title), ["Hindi original"]);
});

test("an offline Hindi collection preserves industry and search filters", async (context) => {
  context.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  const result = await provider.getMovieCatalog({ industry: "bollywood", q: "Gully", genre: "Music", country: "DE" });
  assert.equal(result.live, false);
  assert.deepEqual(result.movies.map((movie) => movie.title), ["Gully Boy"]);
  assert.equal(result.movies[0].originalLanguage, "hi");
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
