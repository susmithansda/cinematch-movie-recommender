import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../lib/movie-night.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { canonicalMovieKey, movieMatchesMood, recommendMovieNight, createMovieNightCalendar } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const movie = (id, title, duration, genres = ["Drama"], extras = {}) => ({
  id, title, duration, genres, year: 2024, releaseDate: "2024-01-01", rating: null,
  overview: "A fictional test fixture.", poster: "", backdrop: "", originalLanguage: "en", industry: "hollywood", ...extras,
});
const preferences = (extras = {}) => ({ mood: "anything", industry: "all", maxMinutes: 180, mode: "single", ...extras });

test("single features require a positive, known runtime and never exceed the selected budget", () => {
  const candidates = [
    movie("unknown", "Unknown runtime", null), movie("zero", "Zero runtime", 0), movie("negative", "Negative runtime", -5),
    movie("nan", "Not a number", NaN), movie("infinity", "Infinity", Infinity),
    movie("long", "Too long", 91), movie("fits", "Exact fit", 90),
  ];
  const plans = recommendMovieNight(candidates, preferences({ maxMinutes: 90 }));
  assert.equal(plans.length, 1);
  assert.equal(plans[0].films[0].id, "fits");
  assert.equal(plans[0].totalMinutes, 90);
  assert.equal(plans[0].breakMinutes, 0);
  assert.deepEqual(recommendMovieNight(candidates.slice(0, 5), preferences()), []);
});

test("double features include the entire 15-minute intermission, even at an exact time boundary", () => {
  const candidates = [movie("a", "First", 90), movie("b", "Second", 95)];
  const exact = recommendMovieNight(candidates, preferences({ mode: "double", maxMinutes: 200 }));
  assert.equal(exact.length, 1);
  assert.equal(exact[0].totalMinutes, 200);
  assert.equal(exact[0].breakMinutes, 15);
  assert.deepEqual(recommendMovieNight(candidates, preferences({ mode: "double", maxMinutes: 199 })), []);
});

test("canonical identity deduplicates providers, years in parentheses, accents and common edition labels", () => {
  const original = movie("seed", "Amélie", 120);
  for (const title of ["Amelie (2024)", "Amelie (Extended Cut)", "Amelie [Remastered]", "Amelie - Director's Cut", "Amelie (Director's Cut)"]) {
    assert.equal(canonicalMovieKey(movie("apple", title, 120)), canonicalMovieKey(original), title);
  }
  assert.notEqual(canonicalMovieKey(movie("remake", "Amelie", 120, ["Drama"], { year: 1990 })), canonicalMovieKey(original));
  assert.notEqual(canonicalMovieKey(movie("hi1", "कला", 90)), canonicalMovieKey(movie("hi2", "किला", 90)), "Hindi vowel marks remain part of identity");
  const duplicateOnly = [original, movie("apple", "Amelie (Extended Cut)", 120)];
  assert.equal(recommendMovieNight(duplicateOnly, preferences({ maxMinutes: 180 })).length, 1);
  assert.deepEqual(recommendMovieNight(duplicateOnly, preferences({ mode: "double", maxMinutes: 300 })), []);
});

test("deduplication retains a known fitting version when live chart metadata has no runtime", () => {
  const candidates = [movie("apple", "Same Movie", null), movie("seed", "Same Movie", 100), movie("tmdb", "Same Movie (Extended Cut)", 130)];
  const plans = recommendMovieNight(candidates, preferences({ maxMinutes: 120 }));
  assert.equal(plans.length, 1);
  assert.equal(plans[0].films[0].id, "seed");
  assert.equal(plans[0].totalMinutes, 100);
});

test("watched IDs exclude cross-provider copies by canonical identity and can be explicitly included again", () => {
  const alpha = movie("seed-alpha", "Alpha", 90);
  const candidates = [alpha, movie("apple-alpha", "Alpha (2024)", 90), movie("beta", "Beta", 85)];
  const plans = recommendMovieNight(candidates, preferences(), ["seed-alpha"]);
  assert.deepEqual(plans.map((plan) => plan.films[0].title), ["Beta"]);
  assert.equal(recommendMovieNight(candidates, preferences({ hideWatched: false }), ["seed-alpha"]).length, 2);
  assert.deepEqual(recommendMovieNight(candidates, preferences(), [canonicalMovieKey(alpha)]).map((plan) => plan.films[0].title), ["Beta"]);
});

test("moods use actual genres, rank overlap, and never silently relax an unmatched mood", () => {
  const laugh = movie("comedy", "A laugh", 90, ["Comedy"]);
  const romance = movie("romcom", "A warm laugh", 95, ["Comedy", "Romance"]);
  const thriller = movie("thriller", "A tense night", 90, ["Crime", "Thriller"]);
  const plans = recommendMovieNight([laugh, romance, thriller], preferences({ mood: "easygoing" }));
  assert.equal(plans[0].films[0].id, "romcom");
  assert.equal(plans.length, 2);
  assert.ok(plans[0].reasons[0].includes("Comedy / Romance"));
  assert.deepEqual(recommendMovieNight([thriller], preferences({ mood: "heartfelt" })), []);
  assert.equal(movieMatchesMood(movie("scifi", "Space", 90, ["Sci-Fi & Fantasy"]), "mind-bending"), true);
});

test("saved genre preferences rank equally suitable films and explanations contain only supplied facts", () => {
  const comedy = movie("comedy", "A comedy", 90, ["Comedy"]);
  const drama = movie("drama", "A drama", 90, ["Drama"]);
  const plans = recommendMovieNight([comedy, drama], preferences({ preferredGenres: ["Drama"] }));
  assert.equal(plans[0].films[0].id, "drama");
  assert.ok(plans[0].reasons[0].includes("Drama appears in your saved genres"));
  assert.ok(plans[0].reasons[0].includes("90-minute runtime"));
  assert.ok(!plans[0].reasons[0].includes("%"));
  assert.ok(!/AI|guarantee|perfect match/i.test(plans[0].reasons[0]));
});

test("both worlds requires one Hindi and one English original without treating a Hindi dub as an original", () => {
  const hindi = movie("hi", "Hindi original", 90, ["Comedy"], { originalLanguage: "hi", industry: "bollywood" });
  const english = movie("en", "English original", 90, ["Comedy"]);
  const tamil = movie("ta", "Tamil original in Hindi dub", 80, ["Comedy"], { originalLanguage: "ta", industry: "bollywood" });
  const unknown = movie("unknown", "Unknown language", 75, ["Comedy"], { originalLanguage: undefined, industry: undefined });
  const plans = recommendMovieNight([hindi, english, tamil, unknown], preferences({ mode: "double", bothWorlds: true, maxMinutes: 200 }));
  assert.equal(plans.length, 1);
  assert.deepEqual(new Set(plans[0].films.map((film) => film.originalLanguage)), new Set(["hi", "en"]));
  assert.equal(plans[0].totalMinutes, 195);
  assert.deepEqual(recommendMovieNight([hindi, tamil], preferences({ mode: "double", bothWorlds: true, maxMinutes: 300 })), []);
  assert.deepEqual(recommendMovieNight([hindi, english], preferences({ industry: "bollywood", mode: "double", bothWorlds: true, maxMinutes: 300 })), []);
});

test("single-industry selection respects explicit language and uses only known industry metadata as a fallback", () => {
  const taggedHindi = movie("hi", "Tagged Hindi", 90, ["Drama"], { originalLanguage: undefined, industry: "bollywood" });
  const wrongTag = movie("wrong", "Conflicting metadata", 90, ["Drama"], { originalLanguage: "te", industry: "bollywood" });
  const unknown = movie("unknown", "Unknown metadata", 90, ["Drama"], { originalLanguage: undefined, industry: undefined });
  assert.deepEqual(recommendMovieNight([taggedHindi, wrongTag, unknown], preferences({ industry: "bollywood" })).map((plan) => plan.films[0].id), ["hi"]);
});

test("pairs use distinct IDs and remain deterministic without mutating the input collection", () => {
  const candidates = [movie("b", "Beta", 70), movie("a", "Alpha", 60), movie("c", "Charlie", 65)];
  const before = structuredClone(candidates);
  const first = recommendMovieNight(candidates, preferences({ mode: "double", maxMinutes: 180 }));
  const second = recommendMovieNight(candidates, preferences({ mode: "double", maxMinutes: 180 }));
  assert.deepEqual(first, second);
  assert.deepEqual(candidates, before);
  assert.equal(first.length, 3);
  assert.ok(first.every((plan) => plan.films[0].id !== plan.films[1].id));
  assert.deepEqual(recommendMovieNight([movie("same-id", "Alpha", 60), movie("same-id", "Beta", 65)], preferences({ mode: "double" })), []);
  assert.deepEqual(recommendMovieNight(candidates, preferences({ maxMinutes: NaN })), []);
  assert.deepEqual(recommendMovieNight(candidates, preferences({ mood: "__proto__" })), []);
  assert.deepEqual(recommendMovieNight(candidates, preferences({ limit: 0 })), []);
});

function events(calendar) {
  return calendar.replace(/\r\n[ \t]/g, "").split("BEGIN:VEVENT\r\n").slice(1).map((block) => {
    const result = {};
    for (const line of block.split("END:VEVENT")[0].split("\r\n")) {
      const colon = line.indexOf(":");
      if (colon >= 0) result[line.slice(0, colon)] = line.slice(colon + 1);
    }
    return result;
  });
}

test("calendar export schedules sequential UTC film blocks and a real fifteen-minute intermission", () => {
  const plan = recommendMovieNight([movie("a", "First", 90), movie("b", "Second", 95)], preferences({ mode: "double", maxMinutes: 200 }))[0];
  const calendar = createMovieNightCalendar(plan, new Date("2026-11-15T20:00:00+05:30"), { generatedAt: new Date("2026-11-15T10:00:00+05:30"), uid: "fixture-unique-id" });
  const blocks = events(calendar);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].DTSTART, "20261115T143000Z");
  assert.equal(blocks[0].DTEND, "20261115T160000Z");
  assert.equal(blocks[1].DTSTART, "20261115T160000Z");
  assert.equal(blocks[1].DTEND, "20261115T161500Z");
  assert.equal(blocks[2].DTSTART, "20261115T161500Z");
  assert.equal(blocks[2].DTEND, "20261115T175000Z");
  assert.equal(blocks[0].DTSTAMP, "20261115T043000Z");
  assert.equal(new Set(blocks.map((block) => block.UID)).size, 3);
  assert.ok(calendar.endsWith("END:VCALENDAR\r\n"));
});

test("calendar escaping prevents extra properties or events and folds Unicode by UTF-8 octets", () => {
  const title = `रात🎬${"की कहानी ".repeat(12)}, a film; with \\ characters\nBEGIN:VEVENT\r\nATTENDEE:injected`;
  const plan = recommendMovieNight([movie("unicode", title, 90)], preferences())[0];
  const calendar = createMovieNightCalendar(plan, new Date("2026-11-15T14:00:00Z"), { generatedAt: new Date("2026-11-15T10:00:00Z"), uid: "unicode-id" });
  const blocks = events(calendar);
  assert.equal(blocks.length, 1);
  assert.ok(blocks[0].SUMMARY.includes("\\, a film\\; with \\\\ characters\\nBEGIN:VEVENT\\nATTENDEE:injected"));
  assert.equal(blocks[0].ATTENDEE, undefined);
  assert.ok(calendar.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75));
  assert.ok(calendar.includes("\r\n "));
  assert.ok(!calendar.includes("�"));
  assert.ok(!/(^|[^\r])\n/.test(calendar), "all physical newlines are CRLF");
});

test("calendar export rejects invalid dates, injected identifiers and stale or duplicate plan metadata", () => {
  const start = new Date("2026-11-15T14:00:00Z"), options = { generatedAt: new Date("2026-11-15T10:00:00Z"), uid: "valid-id" };
  const plan = recommendMovieNight([movie("a", "Alpha", 90)], preferences())[0];
  assert.throws(() => createMovieNightCalendar(plan, new Date("invalid"), options), RangeError);
  assert.throws(() => createMovieNightCalendar(plan, start, { ...options, uid: "bad\r\nBEGIN:VEVENT" }), RangeError);
  assert.throws(() => createMovieNightCalendar({ ...plan, totalMinutes: 91 }, start, options), RangeError);
  assert.throws(() => createMovieNightCalendar({ films: [plan.films[0], plan.films[0]], reasons: [], totalMinutes: 195, breakMinutes: 15 }, start, options), RangeError);
});
