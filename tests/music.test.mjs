import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const source = compile(readFileSync(new URL("../lib/music-provider.ts", import.meta.url), "utf8"));
let fixtureId = 0;
const provider = () => import(moduleUrl(`${source}\n// isolated music fixture ${fixtureId++}`));
const dateAt = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const song = (id, changes = {}) => ({
  kind: "song", trackId: id, trackName: `Song ${id}`, artistName: "Anupam Roy", collectionName: "A Bengali Album",
  primaryGenreName: "Bengali", releaseDate: dateAt(-10), trackTimeMillis: 200000,
  artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/music/cover.jpg/100x100bb.jpg",
  trackViewUrl: "https://music.apple.com/in/song/123", previewUrl: "https://audio-ssl.itunes.apple.com/never-return-this.m4a",
  ...changes,
});
const feedEntry = (id, changes = {}) => ({
  id: { attributes: { "im:id": String(id) } }, "im:name": { label: `Track ${id}` },
  "im:artist": { label: "Anupam Roy" }, "im:collection": { "im:name": { label: "Album" } },
  "im:releaseDate": { label: dateAt(-10) }, "im:image": [{ label: "https://is1-ssl.mzstatic.com/image/thumb/music/cover.jpg/170x170bb.png" }],
  category: { attributes: { "im:id": "100046", label: "Bengali" } }, ...changes,
});
const chart = entries => Response.json({ feed: { entry: entries } });

test("recent Bengali releases use the actual genre, exclude old/future entries, deduplicate and sort by release date", async context => {
  const music = await provider();
  context.mock.method(globalThis, "fetch", async url => {
    assert.equal(url, "https://itunes.apple.com/in/rss/topsongs/limit=100/genre=100046/json");
    return chart([
      feedEntry(1, { "im:releaseDate": { label: dateAt(-50) } }),
      feedEntry(2, { "im:releaseDate": { label: dateAt(-2) } }),
      feedEntry(2), feedEntry(3, { "im:releaseDate": { label: dateAt(-500) } }),
      feedEntry(4, { "im:releaseDate": { label: dateAt(2) } }),
      feedEntry(5, { category: { attributes: { "im:id": "1264", label: "Tamil" } } }),
      feedEntry(6, { "im:name": { label: "A Hindi Version" } }),
    ]);
  });
  const result = await music.getMusicCatalog({ language: "bn" });
  assert.equal(result.live, true);
  assert.equal(result.mode, "recent");
  assert.deepEqual(result.tracks.map(track => track.id), ["apple:2", "apple:1"]);
  assert.ok(result.tracks.every(track => track.language === "bn"));
  assert.equal(result.tracks[0].artwork, "https://is1-ssl.mzstatic.com/image/thumb/music/cover.jpg/400x400bb.png");
  assert.match(result.notice, /365 days/);
});

test("English browsing never treats the US storefront as song-language evidence", async context => {
  const music = await provider();
  context.mock.method(globalThis, "fetch", async () => chart([
    feedEntry(11, { "im:artist": { label: "Sabrina Carpenter" }, category: { attributes: { label: "Pop" } } }),
    feedEntry(12, { "im:artist": { label: "Sabrina Carpenter" }, category: { attributes: { label: "Latin" } } }),
    feedEntry(13, { "im:artist": { label: "Unknown Artist" }, category: { attributes: { label: "Pop" } } }),
    feedEntry(14, { "im:artist": { label: "Ed Sheeran" }, category: { attributes: { label: "Bollywood", "im:id": "1263" } } }),
  ]));
  const result = await music.getMusicCatalog({ language: "en" });
  assert.deepEqual(result.tracks.map(track => track.id), ["apple:11"]);
  assert.match(result.notice, /selection of English-language artists/);
});

test("Unicode song searches are encoded unchanged and generic genres can use verified chart membership", async context => {
  const music = await provider();
  const query = "ভালোবাসার মরশুম";
  const calls = [];
  context.mock.method(globalThis, "fetch", async url => {
    calls.push(url);
    if (url.includes("/search?")) {
      const search = new URL(url);
      assert.equal(search.searchParams.get("term"), query);
      assert.equal(search.searchParams.get("entity"), "song");
      assert.equal(search.searchParams.get("country"), "in");
      return Response.json({ results: [
        song(21, { trackName: query, artistName: "Arijit Singh", primaryGenreName: "Soundtrack", collectionName: "X=Prem" }),
        song(22, { primaryGenreName: "Tamil", collectionName: "Other Album" }),
        song(23, { kind: "music-video" }),
      ] });
    }
    return chart([feedEntry(21)]);
  });
  const result = await music.getMusicCatalog({ language: "bn", q: query });
  assert.equal(result.mode, "search");
  assert.deepEqual(result.tracks.map(track => track.id), ["apple:21"]);
  assert.equal(result.tracks[0].durationMs, 200000);
  assert.ok(calls[0].includes("%E0%A6"));
  assert.ok(!JSON.stringify(result).includes("previewUrl"));
});

test("Hindi search excludes Bengali and other regional-language genres even for multilingual singers", async context => {
  const music = await provider();
  context.mock.method(globalThis, "fetch", async url => url.includes("/search?")
    ? Response.json({ results: [
      song(31, { artistName: "Arijit Singh", primaryGenreName: "Bollywood", collectionName: "Movie" }),
      song(32, { artistName: "Arijit Singh", primaryGenreName: "Bengali" }),
      song(33, { artistName: "Arijit Singh", primaryGenreName: "Tamil", collectionName: "Movie" }),
      song(34, { artistName: "Jubin Nautiyal", primaryGenreName: "Indian Pop", collectionName: "New Album" }),
    ] }) : chart([]));
  const result = await music.getMusicCatalog({ language: "hi", q: "Arijit" });
  assert.deepEqual(result.tracks.map(track => track.id).sort(), ["apple:31", "apple:34"]);
});

test("provider links are constructed from validated IDs and unsafe artwork URLs are discarded", async context => {
  const music = await provider();
  context.mock.method(globalThis, "fetch", async url => url.includes("/search?")
    ? Response.json({ results: [
      song(41, { trackViewUrl: "javascript:alert(1)", artworkUrl100: "https://mzstatic.com.evil.example/cover.jpg", trackTimeMillis: -1 }),
      song("42/../../bad"), song(43, { artworkUrl100: "https://user:pass@is1-ssl.mzstatic.com/private.jpg" }),
      song(44, { artworkUrl100: "http://is1-ssl.mzstatic.com/cover.jpg" }), song(45, { releaseDate: "2025-02-31" }),
      song(1e20),
    ] }) : chart([]));
  const result = await music.getMusicCatalog({ language: "bn", q: "unsafe fixture" });
  assert.deepEqual(result.tracks.map(track => track.id), ["apple:41", "apple:43", "apple:44"]);
  for (const track of result.tracks) {
    assert.equal(track.artwork, "");
    assert.equal(new URL(track.storeUrl).host, "music.apple.com");
    assert.equal(new URL(track.embedUrl).host, "embed.music.apple.com");
    assert.equal(new URL(track.youtubeUrl).host, "music.youtube.com");
  }
  assert.equal(result.tracks[0].durationMs, null);
});

test("catalog caching coalesces concurrent requests, expires after ten minutes and stays bounded", async context => {
  const music = await provider();
  const originalNow = Date.now;
  let now = originalNow(), searches = 0, chartCalls = 0;
  context.mock.method(Date, "now", () => now);
  context.mock.method(globalThis, "fetch", async url => {
    if (url.includes("/search?")) { searches++; return Response.json({ results: [song(51)] }); }
    chartCalls++; return chart([]);
  });
  const [first, second] = await Promise.all([
    music.getMusicCatalog({ language: "bn", q: "cache" }), music.getMusicCatalog({ language: "bn", q: "cache" }),
  ]);
  assert.deepEqual(first, second);
  await music.getMusicCatalog({ language: "bn", q: "CACHE" });
  assert.equal(searches, 1);
  assert.equal(chartCalls, 1);
  now += 10 * 60 * 1000 + 1;
  await music.getMusicCatalog({ language: "bn", q: "cache" });
  assert.equal(searches, 2);
  assert.equal(chartCalls, 2);
  for (let i = 0; i < 81; i++) await music.getMusicCatalog({ language: "bn", q: `entry ${i}` });
  await music.getMusicCatalog({ language: "bn", q: "cache" });
  assert.equal(searches, 84, "the oldest catalog entry was evicted after the eighty-entry limit");
});

test("upstream errors and malformed JSON return an honest empty catalog without fake fallback songs", async context => {
  const music = await provider();
  context.mock.method(globalThis, "fetch", async () => { throw new Error("network down"); });
  const offline = await music.getMusicCatalog({ language: "hi" });
  assert.equal(offline.live, false);
  assert.deepEqual(offline.tracks, []);
  assert.match(offline.notice, /temporarily unavailable/);
  const malformed = await provider();
  context.mock.method(globalThis, "fetch", async () => Response.json({ unexpected: true }));
  assert.equal((await malformed.getMusicCatalog({ language: "bn", q: "broken response" })).live, false);
});

test("a failed supplementary chart keeps valid search results and reports the reduced matching", async context => {
  const music = await provider();
  context.mock.method(globalThis, "fetch", async url => {
    if (url.includes("/search?")) return Response.json({ results: [song(61)] });
    return new Response(null, { status: 503 });
  });
  const result = await music.getMusicCatalog({ language: "bn", q: "partial" });
  assert.equal(result.live, true);
  assert.equal(result.tracks.length, 1);
  assert.match(result.notice, /Extra genre matching is temporarily unavailable/);
});

test("upstream uses the Workers-compatible manual redirect mode and only follows bounded Apple redirects", async context => {
  const music = await provider();
  const calls = [];
  context.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, "manual", "Workers rejects the error redirect mode");
    return calls.length === 1 ? new Response(null, { status: 302, headers: { Location: "/redirected-chart" } }) : chart([feedEntry(71)]);
  });
  const result = await music.getMusicCatalog({ language: "bn" });
  assert.equal(result.live, true);
  assert.equal(calls[1], "https://itunes.apple.com/redirected-chart");
  const malicious = await provider();
  let redirects = 0;
  context.mock.method(globalThis, "fetch", async () => {
    redirects++;
    return new Response(null, { status: 302, headers: { Location: "https://unrelated.example/music" } });
  });
  assert.equal((await malicious.getMusicCatalog({ language: "bn" })).live, false);
  assert.equal(redirects, 1, "an untrusted host is never requested");
});

test("API enforces a Unicode-aware query limit and disables caching on provider outages", async context => {
  const musicUrl = moduleUrl(`${source}\n// route fixture ${fixtureId++}`);
  const routeSource = readFileSync(new URL("../app/api/music/route.ts", import.meta.url), "utf8")
    .replace('"../../../lib/music-provider"', JSON.stringify(musicUrl));
  const route = await import(moduleUrl(compile(routeSource)));
  let calls = 0;
  context.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("offline"); });
  const tooLong = await route.GET(new Request(`https://frame.example/api/music?q=${encodeURIComponent("🎵".repeat(121))}`));
  assert.equal(tooLong.status, 400);
  assert.equal(calls, 0);
  const accepted = await route.GET(new Request(`https://frame.example/api/music?language=bn&q=${encodeURIComponent("🎵".repeat(120))}`));
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get("cache-control"), "no-store");
  assert.equal((await accepted.json()).live, false);
  assert.equal(calls, 2);
  const normalized = (await provider()).normalizeMusicQuery({ language: "wrong", q: ` ${"🎵".repeat(130)} ` });
  assert.equal(normalized.language, "en");
  assert.equal(Array.from(normalized.q).length, 120);
});
