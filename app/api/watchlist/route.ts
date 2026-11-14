import { ApiError, body, database, endpoint, json, rateLimit, requireUser, sameOrigin } from "@/lib/auth";

export const dynamic = "force-dynamic";

function text(value: unknown, max: number, fallback = ""): string {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

function mediaUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2000) return "";
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try { return new URL(value).protocol === "https:" ? value : ""; } catch { return ""; }
}

function sanitizedMovie(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "Choose a movie to save.");
  const movie = value as Record<string, unknown>;
  const id = text(movie.id, 150);
  const title = text(movie.title, 250).trim();
  if (!id || !title) throw new ApiError(400, "A movie id and title are required.");
  return {
    id, title,
    year: typeof movie.year === "number" && Number.isInteger(movie.year) ? movie.year : 0,
    releaseDate: text(movie.releaseDate, 40),
    genres: Array.isArray(movie.genres) ? movie.genres.filter((v): v is string => typeof v === "string").slice(0, 10).map(v => v.slice(0, 50)) : [],
    rating: typeof movie.rating === "number" && Number.isFinite(movie.rating) ? Math.max(0, Math.min(10, movie.rating)) : null,
    duration: typeof movie.duration === "number" && Number.isFinite(movie.duration) ? Math.max(0, Math.min(2000, movie.duration)) : null,
    overview: text(movie.overview, 5000),
    poster: mediaUrl(movie.poster),
    backdrop: mediaUrl(movie.backdrop),
    trailer: mediaUrl(movie.trailer),
    language: text(movie.language, 20),
    source: text(movie.source, 50),
    storeUrl: mediaUrl(movie.storeUrl),
    industry: ["hollywood", "bollywood", "international"].includes(String(movie.industry)) ? movie.industry : undefined,
    originalLanguage: text(movie.originalLanguage, 12),
  };
}

export const GET = endpoint(async request => {
  const user = await requireUser(request);
  const rows = await database().prepare("SELECT movie_json FROM watchlist WHERE owner_id = ? ORDER BY created_at DESC LIMIT 500")
    .bind(user.id).all<{ movie_json: string }>();
  const movies = rows.results.flatMap(row => {
    try { return [JSON.parse(row.movie_json)]; } catch { return []; }
  });
  return json({ movies });
});

export const PUT = endpoint(async request => {
  const data = await body(request);
  const user = await requireUser(request);
  await rateLimit(request, "watchlist-write", user.id, 100);
  const movie = sanitizedMovie(data.movie);
  const db = database();
  const count = await db.prepare("SELECT COUNT(*) AS count FROM watchlist WHERE owner_id = ?").bind(user.id).first<{ count: number }>();
  const existing = await db.prepare("SELECT movie_id FROM watchlist WHERE owner_id = ? AND movie_id = ?").bind(user.id, movie.id).first();
  if ((count?.count ?? 0) >= 500 && !existing) throw new ApiError(400, "Your watchlist holds up to 500 movies. Remove one before adding another.");
  await db.prepare(`INSERT INTO watchlist (owner_id, movie_id, movie_json, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(owner_id, movie_id) DO UPDATE SET movie_json = excluded.movie_json`)
    .bind(user.id, movie.id, JSON.stringify(movie), Date.now()).run();
  return json({ movie });
});

export const DELETE = endpoint(async request => {
  sameOrigin(request);
  const user = await requireUser(request);
  await rateLimit(request, "watchlist-write", user.id, 100);
  const id = new URL(request.url).searchParams.get("id");
  if (!id || id.length > 150) throw new ApiError(400, "Choose a movie to remove.");
  await database().prepare("DELETE FROM watchlist WHERE owner_id = ? AND movie_id = ?").bind(user.id, id).run();
  return json({ ok: true });
});
