import type { Movie } from "./movies";

export type MovieNightMood = "easygoing" | "edge-of-seat" | "heartfelt" | "mind-bending" | "anything";
export type MovieNightPreferences = {
  mood: MovieNightMood;
  industry: "all" | "hollywood" | "bollywood";
  maxMinutes: number;
  mode: "single" | "double";
  bothWorlds?: boolean;
  preferredGenres?: readonly string[];
  hideWatched?: boolean;
  limit?: number;
};
export type MovieNightSuggestion = {
  films: Movie[];
  /** One explanation per film, in the same order as films. */
  reasons: string[];
  totalMinutes: number;
  breakMinutes: number;
};
export type MovieNightCalendarOptions = {
  /** Caller supplies the creation time and a unique ID; the helper has no clock or random side effects. */
  generatedAt: Date;
  uid: string;
};

export const MOVIE_NIGHT_INTERMISSION = 15;

const MOOD_GENRES: Record<MovieNightMood, readonly string[]> = {
  easygoing: ["Comedy", "Family", "Animation", "Music", "Romance"],
  "edge-of-seat": ["Thriller", "Horror", "Action", "Crime", "Mystery"],
  heartfelt: ["Drama", "Romance", "Family", "Music"],
  "mind-bending": ["Science Fiction", "Mystery", "Fantasy"],
  anything: [],
};
const MOOD_LABELS: Record<MovieNightMood, string> = {
  easygoing: "easygoing", "edge-of-seat": "edge-of-seat", heartfelt: "heartfelt", "mind-bending": "mind-bending", anything: "anything",
};
const isMood = (mood: string): mood is MovieNightMood => Object.prototype.hasOwnProperty.call(MOOD_GENRES, mood);

function normalizedGenre(value: string) {
  const key = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return key === "scifi" || key === "sciencefiction" ? "sciencefiction" : key === "kids" || key === "kidsfamily" ? "family" : key;
}

function movieGenres(movie: Movie): Map<string, string> {
  const genres = new Map<string, string>();
  for (const raw of movie.genres) {
    for (const genre of raw.split(/\s*(?:&|\/)\s*/)) {
      const label = genre.trim();
      if (label) genres.set(normalizedGenre(label), normalizedGenre(label) === "sciencefiction" ? "Science Fiction" : label);
    }
  }
  return genres;
}

/** Compare title and release year across Apple/TMDB/editorial IDs.
 * Common edition labels are ignored so a double feature cannot contain two
 * copies of the same film. Different release years remain different films.
 */
export function canonicalMovieKey(movie: Movie): string {
  const edition = "(?:extended(?:\\s+(?:cut|edition|version))?|director(?:['’]s|s['’]?)?\\s+cut|theatrical(?:\\s+(?:cut|version))?|remaster(?:ed)?(?:\\s+feature)?|unrated|final\\s+cut|imax|[248]k|uhd|digital(?:\\s+edition)?)";
  const title = movie.title
    .replace(new RegExp(`\\([^)]*\\b${edition}\\b[^)]*\\)`, "gi"), "")
    .replace(new RegExp(`\\[[^\\]]*\\b${edition}\\b[^\\]]*\\]`, "gi"), "")
    .replace(/\(\s*\d{4}\s*\)/g, "")
    .replace(new RegExp(`\\s*[-–—:]\\s*${edition}\\s*$`, "i"), "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");
  const releaseYear = Number.isInteger(movie.year) && movie.year > 0 ? movie.year
    : /^\d{4}-/.test(movie.releaseDate) ? Number(movie.releaseDate.slice(0, 4)) : 0;
  return title ? `movie:${title}:${releaseYear || "unknown"}` : `id:${movie.id}`;
}

function originalLanguage(movie: Movie) {
  const language = movie.originalLanguage?.trim().toLowerCase();
  // Explicit original-language metadata wins over a conflicting industry tag.
  if (language) return language;
  if (movie.industry === "bollywood") return "hi";
  if (movie.industry === "hollywood") return "en";
  return "";
}

function matchesIndustry(movie: Movie, industry: MovieNightPreferences["industry"]) {
  return industry === "all" || originalLanguage(movie) === (industry === "bollywood" ? "hi" : "en");
}

function knownRuntime(movie: Movie): movie is Movie & { duration: number } {
  return typeof movie.duration === "number" && Number.isFinite(movie.duration) && movie.duration > 0;
}

/** Mood matching is an explicit genre heuristic, not an analysis of a film's plot or tone. */
export function movieMatchesMood(movie: Movie, mood: MovieNightMood): boolean {
  if (!isMood(mood)) return false;
  if (mood === "anything") return true;
  const genres = movieGenres(movie);
  return MOOD_GENRES[mood].some((genre) => genres.has(normalizedGenre(genre)));
}

type Candidate = { movie: Movie & { duration: number }; key: string; score: number; reason: string };

/** Returns an empty list when the requested constraints cannot be met.
 * watchedIds accepts provider IDs and/or canonicalMovieKey values. A watched
 * provider ID present in movies also excludes its canonical duplicates.
 */
export function recommendMovieNight(
  movies: readonly Movie[],
  preferences: MovieNightPreferences,
  watchedIds: Iterable<string> = [],
): MovieNightSuggestion[] {
  const { mood, industry, maxMinutes, mode } = preferences;
  if (!isMood(mood) || !["all", "hollywood", "bollywood"].includes(industry)
    || !["single", "double"].includes(mode) || !Number.isFinite(maxMinutes) || maxMinutes <= 0) return [];
  const limit = preferences.limit === undefined ? 6 : Math.min(24, Math.floor(preferences.limit));
  if (!Number.isFinite(limit) || limit < 1) return [];
  const crossIndustry = mode === "double" && preferences.bothWorlds === true;
  if (crossIndustry && industry !== "all") return [];
  const watched = preferences.hideWatched === false ? new Set<string>() : new Set(watchedIds);
  for (const movie of movies) if (watched.has(movie.id)) watched.add(canonicalMovieKey(movie));
  const taste = new Set((preferences.preferredGenres || []).map(normalizedGenre));
  const desired = MOOD_GENRES[mood].map(normalizedGenre);
  const candidates = new Map<string, Candidate>();

  for (const movie of movies) {
    if (!knownRuntime(movie) || movie.duration > maxMinutes || !movie.title.trim()
      || !matchesIndustry(movie, industry) || !movieMatchesMood(movie, mood)) continue;
    const key = canonicalMovieKey(movie);
    if (watched.has(movie.id) || watched.has(key)) continue;
    const genres = movieGenres(movie);
    const moodMatches = desired.filter((genre) => genres.has(genre));
    const tasteMatches = [...genres.keys()].filter((genre) => taste.has(genre));
    const score = moodMatches.length * 100 + tasteMatches.length * 20;
    const moodLabels = moodMatches.map((genre) => genres.get(genre)!);
    const tasteLabels = tasteMatches.map((genre) => genres.get(genre)!);
    const facts = [
      ...(moodLabels.length ? [`${moodLabels.join(" / ")} matches your ${MOOD_LABELS[mood]} mood`] : []),
      ...(tasteLabels.length ? [`${tasteLabels.join(" / ")} appears in your saved genres`] : []),
      `${movie.duration}-minute runtime fits this plan`,
    ];
    const candidate = { movie, key, score, reason: `${facts.join("; ")}.` };
    const previous = candidates.get(key);
    // Retain a known, fitting version with the strongest supplied genre metadata.
    if (!previous || score > previous.score || (score === previous.score && movie.duration < previous.movie.duration)) candidates.set(key, candidate);
  }
  const pool = [...candidates.values()].sort((a, b) => b.score - a.score
    || a.movie.title.localeCompare(b.movie.title, "en") || a.key.localeCompare(b.key, "en"));
  const ranked: { suggestion: MovieNightSuggestion; score: number; key: string }[] = [];
  const add = (films: Candidate[]) => {
    const breakMinutes = films.length === 2 ? MOVIE_NIGHT_INTERMISSION : 0;
    const totalMinutes = films.reduce((sum, candidate) => sum + candidate.movie.duration, breakMinutes);
    if (totalMinutes > maxMinutes) return;
    const score = films.reduce((sum, candidate) => sum + candidate.score, 0);
    const key = films.map((film) => film.key).join("|");
    ranked.push({ score, key, suggestion: { films: films.map((candidate) => candidate.movie), reasons: films.map((candidate) => candidate.reason), totalMinutes, breakMinutes } });
    ranked.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key, "en"));
    if (ranked.length > limit) ranked.pop();
  };
  if (mode === "single") for (const candidate of pool) add([candidate]);
  else for (let first = 0; first < pool.length; first++) {
    for (let second = first + 1; second < pool.length; second++) {
      const a = pool[first], b = pool[second];
      if (a.movie.id === b.movie.id || a.key === b.key) continue;
      if (crossIndustry && !([originalLanguage(a.movie), originalLanguage(b.movie)].includes("hi") && [originalLanguage(a.movie), originalLanguage(b.movie)].includes("en"))) continue;
      add([a, b]);
    }
  }
  return ranked.map((entry) => entry.suggestion);
}

function calendarText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

function calendarDate(date: Date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) throw new RangeError("Choose a valid calendar date and time.");
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** RFC 5545 folds physical lines at 75 UTF-8 octets without splitting code points. */
function foldedCalendarLine(line: string) {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "", bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).byteLength;
    if (bytes + size > 75) { parts.push(current); current = " "; bytes = 1; }
    current += character; bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n");
}

/** Produces calendar text only. Callers initiate any file download themselves.
 * Film blocks and the 15-minute double-feature intermission are separate events.
 */
export function createMovieNightCalendar(
  plan: MovieNightSuggestion,
  start: Date,
  options: MovieNightCalendarOptions,
): string {
  const stamp = calendarDate(options.generatedAt);
  calendarDate(start);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._@-]{0,200}$/.test(options.uid)) throw new RangeError("Supply a unique calendar identifier.");
  if (![1, 2].includes(plan.films.length) || !plan.films.every(knownRuntime)) throw new RangeError("A calendar plan needs one or two films with known runtimes.");
  const expectedBreak = plan.films.length === 2 ? MOVIE_NIGHT_INTERMISSION : 0;
  const expectedTotal = plan.films.reduce((sum, movie) => sum + movie.duration!, expectedBreak);
  if (plan.breakMinutes !== expectedBreak || plan.totalMinutes !== expectedTotal
    || new Set(plan.films.map(canonicalMovieKey)).size !== plan.films.length
    || new Set(plan.films.map((movie) => movie.id)).size !== plan.films.length) throw new RangeError("The calendar plan's films, break, and total must agree.");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FRAME//Movie Night Planner//EN", "CALSCALE:GREGORIAN"];
  let cursor = start.getTime();
  const event = (key: string, summary: string, description: string, minutes: number) => {
    const ends = cursor + minutes * 60000;
    lines.push("BEGIN:VEVENT", `UID:${options.uid}-${key}@frame.movie-night`, `DTSTAMP:${stamp}`,
      `DTSTART:${calendarDate(new Date(cursor))}`, `DTEND:${calendarDate(new Date(ends))}`,
      `SUMMARY:${calendarText(summary)}`, `DESCRIPTION:${calendarText(description)}`, "TRANSP:OPAQUE", "END:VEVENT");
    cursor = ends;
  };
  plan.films.forEach((movie, index) => {
    event(`film-${index + 1}`, `FRAME Movie Night: ${movie.title}`, [
      `${movie.title}${movie.year ? ` (${movie.year})` : ""} — ${movie.duration} minutes.`,
      plan.reasons[index] || "", movie.overview,
    ].filter(Boolean).join("\n"), movie.duration!);
    if (index < plan.films.length - 1) event(`break-${index + 1}`, "FRAME intermission", "A 15-minute break between the two films.", MOVIE_NIGHT_INTERMISSION);
  });
  lines.push("END:VCALENDAR");
  return `${lines.map(foldedCalendarLine).join("\r\n")}\r\n`;
}
