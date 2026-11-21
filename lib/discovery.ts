import type { Movie } from "./movies";
import type { DiaryEntry } from "./diary-types";
import { canonicalMovieKey, type MovieNightCalendarOptions } from "./movie-night";

export type DiscoveryIndustry = "all" | "hollywood" | "bollywood" | "bengali";
export type TasteLane = "comfort" | "adventure" | "bridge";
export type TasteSuggestion = { movie: Movie; reasons: string[]; sharedGenres: string[]; newGenres: string[] };
export type TasteProfile = {
  ratedFilms: number;
  watchedFilms: number;
  topGenres: { genre: string; weight: number; count: number }[];
  exploredLanguages: string[];
};
export type TasteCompassOptions = { industry: DiscoveryIndustry; lane: TasteLane; limit?: number };
export type TasteCompassResult = { suggestions: TasteSuggestion[]; profile: TasteProfile; coldStart: boolean };
export type FestivalTheme = "bengal-stories" | "mystery-evening" | "world-tour" | "feel-good";
export type FilmFestivalPreferences = { theme: FestivalTheme; maxMinutes: number; count: 3; excludeWatched?: boolean };
export type FilmFestivalPlan = {
  films: Movie[];
  reasons: string[];
  totalMinutes: number;
  /** Total interval time: two 15-minute breaks. */
  breakMinutes: number;
  theme: FestivalTheme;
  title: string;
};
export const FESTIVAL_INTERVAL_MINUTES = 15;

const industryLanguage: Record<Exclude<DiscoveryIndustry, "all">, string> = { hollywood: "en", bollywood: "hi", bengali: "bn" };
const languageName: Record<string, string> = { en: "English", hi: "Hindi", bn: "Bengali", ko: "Korean", ta: "Tamil", te: "Telugu", fr: "French", ja: "Japanese" };
const industryValues = new Set(["all", "hollywood", "bollywood", "bengali"]);
const laneValues = new Set(["comfort", "adventure", "bridge"]);
const titles: Record<FestivalTheme, string> = {
  "bengal-stories": "Three stories from Bengal.",
  "mystery-evening": "A night of mystery.",
  "world-tour": "Around three worlds.",
  "feel-good": "A little lighter.",
};
const themeGenres: Record<FestivalTheme, readonly string[]> = {
  "bengal-stories": [], "world-tour": [],
  "mystery-evening": ["Mystery", "Thriller", "Crime"],
  "feel-good": ["Comedy", "Family", "Animation", "Music"],
};

function originalLanguage(movie: Movie): string {
  const original = movie.originalLanguage?.trim().toLowerCase();
  if (original) return original;
  if (movie.industry && movie.industry in industryLanguage) return industryLanguage[movie.industry as keyof typeof industryLanguage];
  return "";
}

function genres(movie: Movie): string[] {
  return [...new Set(movie.genres.flatMap(value => value.split(/\s*(?:&|\/)\s*/)).map(value => {
    const trimmed = value.trim();
    if (/^sci[ -]?fi$|^sciencefiction$/i.test(trimmed)) return "Science Fiction";
    if (/^kids(?:family)?$/i.test(trimmed)) return "Family";
    return trimmed;
  }).filter(value => value && !["Bollywood", "Bengali", "Hindi", "English"].includes(value)))];
}

function uniqueMovies(movies: readonly Movie[]): Movie[] {
  const unique = new Map<string, Movie>();
  for (const movie of movies) {
    if (!movie.id || !movie.title?.trim()) continue;
    const key = canonicalMovieKey(movie), prior = unique.get(key);
    if (!prior || (!knownRuntime(prior) && knownRuntime(movie)) || (!originalLanguage(prior) && originalLanguage(movie))) unique.set(key, movie);
  }
  return [...unique.values()];
}

function knownRuntime(movie: Movie): movie is Movie & { duration: number } {
  return typeof movie.duration === "number" && Number.isFinite(movie.duration) && movie.duration > 0;
}

function diaryByFilm(diary: readonly DiaryEntry[]): DiaryEntry[] {
  const unique = new Map<string, DiaryEntry>();
  for (const entry of diary) {
    const key = canonicalMovieKey(entry.movie), prior = unique.get(key);
    if (!prior || entry.watchedAt >= prior.watchedAt) unique.set(key, entry);
  }
  return [...unique.values()];
}

/** Uses only supplied ratings, saves and metadata; it does not infer plot tone or make AI confidence claims. */
export function buildTasteCompass(
  catalog: readonly Movie[], diary: readonly DiaryEntry[], saved: readonly Movie[], options: TasteCompassOptions,
): TasteCompassResult {
  const entries = diaryByFilm(diary);
  const watched = new Set(entries.map(entry => canonicalMovieKey(entry.movie)));
  const savedFilms = uniqueMovies(saved).filter(movie => !watched.has(canonicalMovieKey(movie)));
  const weights = new Map<string, { weight: number; count: number }>();
  const exploredGenres = new Set<string>();
  const exploredLanguages = new Set<string>();
  let ratedFilms = 0;
  const add = (genre: string, weight: number) => {
    const previous = weights.get(genre) || { weight: 0, count: 0 };
    weights.set(genre, { weight: previous.weight + weight, count: previous.count + 1 });
  };
  for (const entry of entries) {
    const personal = entry.rating;
    const rated = typeof personal === "number" && Number.isInteger(personal) && personal >= 1 && personal <= 5;
    if (rated) ratedFilms++;
    const weight = rated ? ({ 1: -3, 2: -1.5, 3: 0.25, 4: 2, 5: 3 }[personal] ?? 0) : 0;
    for (const genre of genres(entry.movie)) { exploredGenres.add(genre); add(genre, weight); }
    const language = originalLanguage(entry.movie); if (language) exploredLanguages.add(language);
  }
  for (const movie of savedFilms) for (const genre of genres(movie)) add(genre, 0.5);
  const profile: TasteProfile = {
    ratedFilms, watchedFilms: entries.length,
    topGenres: [...weights].map(([genre, value]) => ({ genre, weight: Math.round(value.weight * 100) / 100, count: value.count }))
      .sort((a, b) => b.weight - a.weight || b.count - a.count || a.genre.localeCompare(b.genre, "en")),
    exploredLanguages: [...exploredLanguages].sort(),
  };
  const coldStart = ratedFilms === 0 && savedFilms.length === 0;
  const limit = options.limit === undefined ? 6 : Math.min(24, Math.floor(options.limit));
  if (!industryValues.has(options.industry) || !laneValues.has(options.lane) || !Number.isFinite(limit) || limit < 1) return { suggestions: [], profile, coldStart };
  const selectedLanguage = options.industry === "all" ? options.lane === "bridge" ? "bn" : "" : industryLanguage[options.industry];
  const ranked = uniqueMovies(catalog).filter(movie => !watched.has(canonicalMovieKey(movie)) && (!selectedLanguage || originalLanguage(movie) === selectedLanguage)).map(movie => {
    const movieGenres = genres(movie);
    const sharedGenres = movieGenres.filter(genre => (weights.get(genre)?.weight || 0) > 0);
    const newGenres = movieGenres.filter(genre => !exploredGenres.has(genre));
    const positive = movieGenres.reduce((total, genre) => total + Math.max(0, weights.get(genre)?.weight || 0), 0);
    const negative = movieGenres.reduce((total, genre) => total + Math.min(0, weights.get(genre)?.weight || 0), 0);
    const movieLanguage = originalLanguage(movie);
    const newLanguage = movieLanguage && !exploredLanguages.has(movieLanguage);
    const score = options.lane === "adventure"
      ? newGenres.length * 3 + (newLanguage ? 1.5 : 0) + positive * 0.35 + negative * 4
      : positive * (options.lane === "bridge" ? 5 : 4) + negative * 5 + (options.lane === "bridge" && newLanguage ? 1 : 0);
    const reasons: string[] = [];
    if (coldStart) reasons.push("A starting point from the catalog. Rate or save a few films to make this personal.");
    if (sharedGenres.length) reasons.push(`${sharedGenres.join(" / ")} connects to your diary ratings or saved films.`);
    if (options.lane === "adventure" && newGenres.length && entries.length) reasons.push(`Would add ${newGenres.join(" / ")} to the genres in your diary.`);
    if (options.lane === "bridge" && movieLanguage) reasons.push(sharedGenres.length
      ? `A ${languageName[movieLanguage] || movieLanguage.toUpperCase()} original, using familiar genres as a bridge.`
      : `A ${languageName[movieLanguage] || movieLanguage.toUpperCase()} original to explore while your taste profile develops.`);
    if (entries.length && newLanguage) reasons.push(`A film language not yet represented in your diary.`);
    if (!reasons.length) reasons.push("Not yet in your film diary; a fresh title to explore.");
    return { movie, reasons, sharedGenres, newGenres, score };
  }).sort((a, b) => b.score - a.score || canonicalMovieKey(a.movie).localeCompare(canonicalMovieKey(b.movie), "en"));
  return { suggestions: ranked.slice(0, limit).map(({ movie, reasons, sharedGenres, newGenres }) => ({ movie, reasons, sharedGenres, newGenres })), profile, coldStart };
}

function themeEligible(movie: Movie, theme: FestivalTheme): boolean {
  const language = originalLanguage(movie);
  if (theme === "bengal-stories") return language === "bn";
  if (theme === "world-tour") return ["en", "hi", "bn"].includes(language);
  return genres(movie).some(genre => themeGenres[theme].includes(genre));
}

function themeScore(movie: Movie, theme: FestivalTheme): number {
  const labels = genres(movie);
  return themeGenres[theme].length ? labels.filter(genre => themeGenres[theme].includes(genre)).length * 10 : Math.min(labels.length, 4);
}

/** A three-film programme with two real intervals. No runtime, language or theme constraints are relaxed. */
export function buildFilmFestival(
  catalog: readonly Movie[], preferences: FilmFestivalPreferences, watchedKeys: Iterable<string> = [],
): FilmFestivalPlan | null {
  const { theme, maxMinutes } = preferences;
  if (!Object.prototype.hasOwnProperty.call(titles, theme) || preferences.count !== 3 || !Number.isFinite(maxMinutes) || maxMinutes <= 0) return null;
  const watched = preferences.excludeWatched === false ? new Set<string>() : new Set(watchedKeys);
  for (const movie of catalog) if (watched.has(movie.id)) watched.add(canonicalMovieKey(movie));
  const eligible = uniqueMovies(catalog).filter((movie): movie is Movie & { duration: number } => knownRuntime(movie)
    && movie.duration + 2 * FESTIVAL_INTERVAL_MINUTES < maxMinutes && !watched.has(canonicalMovieKey(movie)) && themeEligible(movie, theme));
  if (eligible.length < 3) return null;
  const sorted = [...eligible].sort((a, b) => themeScore(b, theme) - themeScore(a, theme) || a.duration - b.duration || canonicalMovieKey(a).localeCompare(canonicalMovieKey(b), "en"));
  // Keep the search inexpensive for large personal libraries. Include the three
  // shortest eligible films (per language for a world tour), so pruning cannot
  // discard the only feasible programme under a hard budget.
  const shortest = [...eligible].sort((a, b) => a.duration - b.duration || canonicalMovieKey(a).localeCompare(canonicalMovieKey(b), "en"));
  const poolMap = new Map(sorted.slice(0, 48).map(movie => [canonicalMovieKey(movie), movie]));
  const requiredShortest = theme === "world-tour" ? ["en", "hi", "bn"].flatMap(language => shortest.filter(movie => originalLanguage(movie) === language).slice(0, 3)) : shortest.slice(0, 3);
  for (const movie of requiredShortest) poolMap.set(canonicalMovieKey(movie), movie);
  const pool = [...poolMap.values()];
  let best: { films: Movie[]; total: number; score: number; key: string } | null = null;
  for (let a = 0; a < pool.length - 2; a++) for (let b = a + 1; b < pool.length - 1; b++) for (let c = b + 1; c < pool.length; c++) {
    const films = [pool[a], pool[b], pool[c]];
    if (theme === "world-tour" && new Set(films.map(originalLanguage)).size !== 3) continue;
    const total = films.reduce((sum, movie) => sum + movie.duration!, 2 * FESTIVAL_INTERVAL_MINUTES);
    if (total > maxMinutes) continue;
    const allGenres = new Set(films.flatMap(genres));
    const decades = new Set(films.map(movie => Math.floor(movie.year / 10)));
    const years = films.map(movie => movie.year).filter(year => year > 0);
    const span = years.length ? Math.min(60, Math.max(...years) - Math.min(...years)) : 0;
    const score = films.reduce((sum, movie) => sum + themeScore(movie, theme), 0) + allGenres.size
      + (theme === "bengal-stories" ? decades.size * 3 + span / 10 : 0);
    const key = films.map(canonicalMovieKey).sort().join("|");
    if (!best || score > best.score || (score === best.score && (total < best.total || (total === best.total && key < best.key)))) best = { films, total, score, key };
  }
  if (!best) return null;
  const films = [...best.films].sort((a, b) => theme === "bengal-stories" ? a.year - b.year || canonicalMovieKey(a).localeCompare(canonicalMovieKey(b), "en") : canonicalMovieKey(a).localeCompare(canonicalMovieKey(b), "en"));
  return {
    films,
    reasons: films.map(movie => theme === "bengal-stories" ? `A Bengali original from ${movie.year || "the catalog"}, with ${genres(movie).join(" / ") || "its own story"} in the programme.`
      : theme === "world-tour" ? `The ${languageName[originalLanguage(movie)]} chapter of an English–Hindi–Bengali programme.`
        : `${genres(movie).filter(genre => themeGenres[theme].includes(genre)).join(" / ")} fits this ${theme === "mystery-evening" ? "mystery evening" : "feel-good programme"}.`),
    totalMinutes: best.total, breakMinutes: 2 * FESTIVAL_INTERVAL_MINUTES, theme, title: titles[theme],
  };
}

const calendarText = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
function calendarDate(date: Date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) throw new RangeError("Choose a valid calendar date and time.");
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
function fold(line: string) {
  const encoder = new TextEncoder(), parts: string[] = [];
  let current = "", bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).byteLength;
    if (bytes + size > 75) { parts.push(current); current = " "; bytes = 1; }
    current += character; bytes += size;
  }
  parts.push(current); return parts.join("\r\n");
}

/** Creates a downloadable five-event calendar; it never connects to or sends anything to a calendar service. */
export function createFestivalCalendar(plan: FilmFestivalPlan, start: Date, options: MovieNightCalendarOptions): string {
  const stamp = calendarDate(options.generatedAt); calendarDate(start);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._@-]{0,200}$/.test(options.uid)) throw new RangeError("Supply a unique calendar identifier.");
  if (!Object.prototype.hasOwnProperty.call(titles, plan.theme) || plan.films.length !== 3 || !plan.films.every(knownRuntime)
    || plan.reasons.length !== 3 || !plan.reasons.every(reason => typeof reason === "string")
    || !plan.films.every(movie => themeEligible(movie, plan.theme)) || new Set(plan.films.map(canonicalMovieKey)).size !== 3 || new Set(plan.films.map(movie => movie.id)).size !== 3
    || (plan.theme === "world-tour" && new Set(plan.films.map(originalLanguage)).size !== 3)
    || plan.breakMinutes !== 2 * FESTIVAL_INTERVAL_MINUTES || plan.totalMinutes !== plan.films.reduce((sum, movie) => sum + movie.duration!, plan.breakMinutes)) throw new RangeError("The festival films, theme, intervals, and total must agree.");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FRAME//Film Festival//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${calendarText(`FRAME: ${plan.title}`)}`];
  let cursor = start.getTime();
  const event = (key: string, summary: string, description: string, minutes: number) => {
    const end = cursor + minutes * 60000;
    lines.push("BEGIN:VEVENT", `UID:${options.uid}-${key}@frame.festival`, `DTSTAMP:${stamp}`, `DTSTART:${calendarDate(new Date(cursor))}`, `DTEND:${calendarDate(new Date(end))}`, `SUMMARY:${calendarText(summary)}`, `DESCRIPTION:${calendarText(description)}`, "TRANSP:OPAQUE", "END:VEVENT");
    cursor = end;
  };
  plan.films.forEach((movie, index) => {
    event(`film-${index + 1}`, `FRAME Festival: ${movie.title}`, [`${movie.title}${movie.year ? ` (${movie.year})` : ""} — ${movie.duration} minutes.`, plan.reasons[index], movie.overview].filter(Boolean).join("\n"), movie.duration!);
    if (index < 2) event(`interval-${index + 1}`, "FRAME festival interval", "A 15-minute break before the next film.", FESTIVAL_INTERVAL_MINUTES);
  });
  lines.push("END:VCALENDAR"); return `${lines.map(fold).join("\r\n")}\r\n`;
}
