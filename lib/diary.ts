import { ApiError, body, database, json, rateLimit, requireUser, sameOrigin } from "@/lib/auth";
import type { DiaryEntry } from "@/lib/diary-types";
import type { Movie, MovieIndustry } from "@/lib/movies";

type DiaryRow = { movie_json: string; personal_rating: number | null; note: string; watched_at: string };

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function mediaUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2000 || /[\u0000-\u0020\\]/.test(value)) return "";
  try {
    if (value.startsWith("/") && !value.startsWith("//")) {
      return new URL(value, "https://frame.local").origin === "https://frame.local" ? value : "";
    }
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? value : "";
  } catch { return ""; }
}

function movieId(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 150) throw new ApiError(400, "Choose a valid movie for your passport.");
  return value.trim();
}

function sanitizedMovie(value: unknown): Movie {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "Choose a movie to add to your passport.");
  const movie = value as Record<string, unknown>;
  const id = movieId(movie.id);
  if (typeof movie.title !== "string" || !movie.title.trim() || movie.title.length > 250) throw new ApiError(400, "A movie title is required.");
  const industry: MovieIndustry | undefined = movie.industry === "hollywood" || movie.industry === "bollywood" || movie.industry === "international" ? movie.industry : undefined;
  const originalLanguage = typeof movie.originalLanguage === "string" && /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})?$/.test(movie.originalLanguage) ? movie.originalLanguage.slice(0, 12) : "";
  return {
    id,
    title: movie.title.trim(),
    year: typeof movie.year === "number" && Number.isInteger(movie.year) && movie.year >= 0 && movie.year <= 9999 ? movie.year : 0,
    releaseDate: text(movie.releaseDate, 40),
    genres: Array.isArray(movie.genres) ? movie.genres.filter((genre): genre is string => typeof genre === "string").slice(0, 10).map(genre => genre.slice(0, 50)) : [],
    rating: typeof movie.rating === "number" && Number.isFinite(movie.rating) ? Math.max(0, Math.min(10, movie.rating)) : null,
    duration: typeof movie.duration === "number" && Number.isFinite(movie.duration) ? Math.max(0, Math.min(2000, movie.duration)) : null,
    overview: text(movie.overview, 5000),
    poster: mediaUrl(movie.poster),
    backdrop: mediaUrl(movie.backdrop),
    trailer: mediaUrl(movie.trailer),
    storeUrl: mediaUrl(movie.storeUrl),
    language: text(movie.language, 20),
    originalLanguage,
    industry,
    source: text(movie.source, 50),
  };
}

function validatedEntry(data: Record<string, unknown>): DiaryEntry {
  const movie = sanitizedMovie(data.movie);
  const rating = data.rating === undefined || data.rating === null ? null : data.rating;
  if (rating !== null && (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5)) throw new ApiError(400, "Choose a personal rating from 1 to 5 stars, or leave it unrated.");
  const note = data.note === undefined ? "" : data.note;
  if (typeof note !== "string" || note.length > 1000) throw new ApiError(400, "Keep your note to 1,000 characters or fewer.");
  const watchedAt = data.watchedAt;
  if (typeof watchedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(watchedAt)) throw new ApiError(400, "Enter the watched date as YYYY-MM-DD.");
  const date = new Date(`${watchedAt}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== watchedAt) throw new ApiError(400, "Enter a real calendar date.");
  return { movie, rating, note, watchedAt };
}

function entryFromRow(row: DiaryRow): DiaryEntry {
  return { movie: JSON.parse(row.movie_json) as Movie, rating: row.personal_rating, note: row.note, watchedAt: row.watched_at };
}

export async function listDiary(request: Request): Promise<Response> {
  const user = await requireUser(request);
  const rows = await database().prepare(`SELECT movie_json, personal_rating, note, watched_at FROM movie_diary
    WHERE owner_id = ? ORDER BY watched_at DESC, updated_at DESC, movie_id ASC LIMIT 500`)
    .bind(user.id).all<DiaryRow>();
  const entries = rows.results.flatMap(row => {
    try { return [entryFromRow(row)]; } catch { return []; }
  });
  return json({ entries });
}

export async function putDiary(request: Request): Promise<Response> {
  const data = await body(request);
  const user = await requireUser(request);
  await rateLimit(request, "diary-write", user.id, 100);
  const entry = validatedEntry(data);
  const now = Date.now();
  // The capacity check belongs to the same statement as the write, so concurrent
  // requests cannot bypass the 500-entry limit. Existing entries remain editable.
  const saved = await database().prepare(`INSERT INTO movie_diary
    (owner_id, movie_id, movie_json, personal_rating, note, watched_at, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE
      (SELECT COUNT(*) FROM movie_diary WHERE owner_id = ?) < 500 OR
      EXISTS (SELECT 1 FROM movie_diary WHERE owner_id = ? AND movie_id = ?)
    ON CONFLICT(owner_id, movie_id) DO UPDATE SET movie_json = excluded.movie_json,
      personal_rating = excluded.personal_rating, note = excluded.note,
      watched_at = excluded.watched_at, updated_at = excluded.updated_at
    RETURNING movie_json, personal_rating, note, watched_at`)
    .bind(user.id, entry.movie.id, JSON.stringify(entry.movie), entry.rating, entry.note, entry.watchedAt, now, now, user.id, user.id, entry.movie.id)
    .first<DiaryRow>();
  if (!saved) throw new ApiError(400, "Your passport holds up to 500 movies. Remove an entry before adding another.");
  return json({ entry: entryFromRow(saved) });
}

export async function deleteDiary(request: Request): Promise<Response> {
  sameOrigin(request);
  const user = await requireUser(request);
  await rateLimit(request, "diary-write", user.id, 100);
  const id = movieId(new URL(request.url).searchParams.get("id"));
  await database().prepare("DELETE FROM movie_diary WHERE owner_id = ? AND movie_id = ?").bind(user.id, id).run();
  return json({ ok: true });
}
