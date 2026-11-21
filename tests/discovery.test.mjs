import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(compile(source)).toString("base64")}`;
const nightUrl = moduleUrl(readFileSync(new URL("../lib/movie-night.ts", import.meta.url), "utf8"));
const source = readFileSync(new URL("../lib/discovery.ts", import.meta.url), "utf8").replace('"./movie-night"', JSON.stringify(nightUrl));
const { buildTasteCompass, buildFilmFestival, createFestivalCalendar } = await import(moduleUrl(source));

const movie = (id, title, extras = {}) => ({ id, title, year: 2024, releaseDate: "2024-01-01", duration: 100, genres: ["Drama"],
  rating: null, overview: "A fictional test story.", poster: "", backdrop: "", originalLanguage: "en", industry: "hollywood", ...extras });
const bengali = (id, title, extras = {}) => movie(id, title, { originalLanguage: "bn", industry: "bengali", ...extras });
const entry = (film, rating, extras = {}) => ({ movie: film, rating, watchedAt: "2026-11-01", note: "", ...extras });
const compass = extras => ({ industry: "all", lane: "comfort", limit: 6, ...extras });
const festival = extras => ({ theme: "bengal-stories", maxMinutes: 480, count: 3, ...extras });

test("a cold-start Bengali bridge is explicit, original-language based and never invents preference percentages", () => {
  const original = bengali("bn", "A Bengali Original");
  const dubbed = movie("dubbed", "A Hindi Original", { originalLanguage: "hi", industry: "bengali" });
  const result = buildTasteCompass([movie("en", "An English Film"), dubbed, original], [], [], compass({ lane: "bridge" }));
  assert.equal(result.coldStart, true);
  assert.equal(result.profile.ratedFilms, 0);
  assert.equal(result.profile.watchedFilms, 0);
  assert.deepEqual(result.suggestions.map(suggestion => suggestion.movie.id), ["bn"]);
  assert.match(result.suggestions[0].reasons[0], /starting point.*rate or save/i);
  assert.ok(result.suggestions[0].reasons.every(reason => !/%|\bAI\b|guaranteed/i.test(reason)));
});

test("personal ratings outweigh saves, low-rated genres are penalized, and watched provider duplicates stay out", () => {
  const loved = movie("loved", "Loved Drama"), disliked = movie("disliked", "Disliked Horror", { genres: ["Horror"] });
  const saved = movie("saved", "Saved Comedy", { genres: ["Comedy"] });
  const nextDrama = movie("new-drama", "Another Drama"), nextHorror = movie("new-horror", "Another Horror", { genres: ["Horror"] });
  const result = buildTasteCompass([nextHorror, nextDrama, saved, { ...loved, id: "other-provider", title: "Loved Drama (Extended Cut)" }], [entry(loved, 5), entry(disliked, 1)], [saved, disliked], compass());
  assert.equal(result.coldStart, false);
  assert.deepEqual(result.suggestions.map(suggestion => suggestion.movie.id), ["new-drama", "saved", "new-horror"]);
  assert.deepEqual(result.suggestions[0].sharedGenres, ["Drama"]);
  assert.equal(result.profile.topGenres.find(genre => genre.genre === "Drama").weight, 3);
  assert.equal(result.profile.topGenres.find(genre => genre.genre === "Comedy").weight, 0.5);
  assert.equal(result.profile.topGenres.find(genre => genre.genre === "Horror").weight, -3, "saving a watched, disliked film must not undo the rating");
});

test("adventure offers actual new diary genres and the bridge respects an explicitly selected cinema", () => {
  const diary = [entry(movie("old", "Old Drama"), 5)];
  const candidates = [movie("drama", "More Drama"), movie("space", "A New World", { genres: ["Sci-Fi & Fantasy"] }), bengali("bn", "Bengal Drama")];
  const adventure = buildTasteCompass(candidates, diary, [], compass({ lane: "adventure", industry: "hollywood" }));
  assert.equal(adventure.suggestions[0].movie.id, "space");
  assert.deepEqual(adventure.suggestions[0].newGenres, ["Science Fiction", "Fantasy"]);
  assert.match(adventure.suggestions[0].reasons.join(" "), /would add.*diary/i);
  const bridge = buildTasteCompass(candidates, diary, [], compass({ lane: "bridge", industry: "hollywood" }));
  assert.ok(bridge.suggestions.every(suggestion => suggestion.movie.originalLanguage === "en"));
  assert.deepEqual(bridge.profile.exploredLanguages, ["en"]);
});

test("profile evidence deduplicates editions, uses the most recent diary entry, and never mutates caller collections", () => {
  const first = movie("first", "A Film", { genres: ["Drama", "Drama"] });
  const latest = { ...first, id: "latest", title: "A Film (Director's Cut)" };
  const catalog = Object.freeze([movie("candidate", "A Candidate"), first]);
  const diary = Object.freeze([entry(latest, 1, { watchedAt: "2026-11-10" }), entry(first, 5, { watchedAt: "2026-10-01" })]);
  const snapshot = JSON.stringify({ catalog, diary });
  const result = buildTasteCompass(catalog, diary, [], compass());
  assert.equal(result.profile.watchedFilms, 1);
  assert.equal(result.profile.ratedFilms, 1);
  assert.deepEqual(result.profile.topGenres, [{ genre: "Drama", weight: -3, count: 1 }]);
  assert.equal(JSON.stringify({ catalog, diary }), snapshot);
  assert.deepEqual(buildTasteCompass(catalog, diary, [], compass({ limit: 0 })).suggestions, []);
});

test("a three-film Bengali festival includes both intervals and respects the exact budget boundary", () => {
  const candidates = [bengali("one", "First", { duration: 90, year: 1955 }), bengali("two", "Second", { duration: 95, year: 1980 }), bengali("three", "Third", { duration: 100, year: 2023 })];
  const plan = buildFilmFestival(candidates, festival({ maxMinutes: 315 }));
  assert.ok(plan);
  assert.equal(plan.films.length, 3);
  assert.equal(plan.breakMinutes, 30);
  assert.equal(plan.totalMinutes, 315);
  assert.ok(plan.films.every(film => film.originalLanguage === "bn"));
  assert.deepEqual(plan.films.map(film => film.year), [1955, 1980, 2023]);
  assert.equal(buildFilmFestival(candidates, festival({ maxMinutes: 314 })), null);
});

test("world tour requires an English, Hindi and Bengali original and rejects an incorrectly tagged dub", () => {
  const english = movie("en", "English"), hindi = movie("hi", "Hindi", { originalLanguage: "hi", industry: "bollywood" });
  const dubbed = movie("ta", "Tamil Original", { originalLanguage: "ta", industry: "bengali" });
  assert.equal(buildFilmFestival([english, hindi, dubbed], festival({ theme: "world-tour" })), null);
  const plan = buildFilmFestival([english, hindi, dubbed, bengali("bn", "Bengali")], festival({ theme: "world-tour" }));
  assert.ok(plan);
  assert.deepEqual(new Set(plan.films.map(film => film.originalLanguage)), new Set(["en", "hi", "bn"]));
  assert.ok(plan.reasons.every(reason => /English–Hindi–Bengali/.test(reason)));
});

test("festival themes, known runtimes, watched exclusions and canonical identities remain strict", () => {
  const mystery = [movie("a", "Mystery A", { genres: ["Mystery"], duration: 80 }), movie("b", "Mystery B", { genres: ["Crime"], duration: 85 }), movie("c", "Mystery C", { genres: ["Thriller"], duration: 90 })];
  const extras = [movie("drama", "A Drama", { genres: ["Drama"] }), movie("unknown", "Unknown Thriller", { duration: null, genres: ["Thriller"] }), { ...mystery[0], id: "duplicate", title: "Mystery A (Extended Cut)" }];
  const plan = buildFilmFestival([...mystery, ...extras], festival({ theme: "mystery-evening", maxMinutes: 285 }));
  assert.ok(plan);
  assert.deepEqual(new Set(plan.films.map(film => film.id)), new Set(["a", "b", "c"]));
  assert.equal(buildFilmFestival([...mystery, ...extras], festival({ theme: "mystery-evening" }), ["a"]), null);
  assert.ok(buildFilmFestival(mystery, festival({ theme: "mystery-evening", excludeWatched: false }), ["a"]));
  assert.equal(buildFilmFestival(mystery, festival({ theme: "feel-good" })), null);
});

test("bounded festival search retains the only feasible short programme in a large library", () => {
  const long = Array.from({ length: 70 }, (_, index) => bengali(`long-${index}`, `Long ${index}`, { duration: 170, genres: ["Drama", "Comedy", "Mystery", "Adventure"] }));
  const short = [bengali("s1", "Short One", { duration: 60 }), bengali("s2", "Short Two", { duration: 61 }), bengali("s3", "Short Three", { duration: 62 })];
  const snapshot = JSON.stringify([...long, ...short]);
  const plan = buildFilmFestival([...long, ...short], festival({ maxMinutes: 213 }));
  assert.ok(plan);
  assert.equal(plan.totalMinutes, 213);
  assert.deepEqual(new Set(plan.films.map(film => film.id)), new Set(["s1", "s2", "s3"]));
  assert.equal(JSON.stringify([...long, ...short]), snapshot);
});

test("festival calendar creates five sequential UTC events and safely folds Bengali and injected text", () => {
  const films = [bengali("a", "পথের পাঁচালী, a story;\nBEGIN:VEVENT", { duration: 90, year: 1955, overview: "বাংলা ".repeat(80) }), bengali("b", "Second", { duration: 95, year: 1964 }), bengali("c", "Third", { duration: 100, year: 2023 })];
  const plan = buildFilmFestival(films, festival({ maxMinutes: 315 }));
  const calendar = createFestivalCalendar(plan, new Date("2026-11-20T20:00:00+05:30"), { generatedAt: new Date("2026-11-15T00:00:00Z"), uid: "festival-test-1" });
  assert.equal((calendar.match(/BEGIN:VEVENT\r\n/g) || []).length, 5);
  assert.equal((calendar.match(/END:VEVENT\r\n/g) || []).length, 5);
  const unfolded = calendar.replace(/\r\n /g, "");
  assert.match(unfolded, /DTSTART:20261120T143000Z/);
  assert.match(unfolded, /DTSTART:20261120T160000Z\r\nDTEND:20261120T161500Z/);
  assert.match(unfolded, /DTEND:20261120T194500Z/);
  assert.ok(unfolded.includes("পথের পাঁচালী\\, a story\\;\\nBEGIN:VEVENT"));
  assert.ok(calendar.split("\r\n").every(line => Buffer.byteLength(line, "utf8") <= 75));
  assert.equal(new Set([...calendar.matchAll(/^UID:(.+)$/gm)].map(match => match[1])).size, 5);
});

test("calendar generation rejects mismatched totals, duplicate films, invalid dates and identifier injection", () => {
  const plan = buildFilmFestival([bengali("a", "A"), bengali("b", "B"), bengali("c", "C")], festival());
  const start = new Date("2026-11-20T20:00:00+05:30"), options = { generatedAt: start, uid: "valid-id" };
  assert.throws(() => createFestivalCalendar({ ...plan, totalMinutes: plan.totalMinutes - 1 }, start, options), /must agree/);
  assert.throws(() => createFestivalCalendar({ ...plan, films: [plan.films[0], plan.films[0], plan.films[2]] }, start, options), /must agree/);
  assert.throws(() => createFestivalCalendar(plan, new Date("invalid"), options), /valid calendar/);
  assert.throws(() => createFestivalCalendar(plan, start, { ...options, uid: "bad\r\nBEGIN:VEVENT" }), /identifier/);
});
