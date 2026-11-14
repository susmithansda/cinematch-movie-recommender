import { FALLBACK_MOVIES, type Movie, type MovieCatalog } from "./movies";

type RecordValue = Record<string, unknown>;
export type MovieQuery = { category?: string; genre?: string; q?: string; country?: string };
const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map<string, { expires: number; value: MovieCatalog }>();
const GENRES: Record<string, number> = {
  Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99,
  Drama: 18, Family: 10751, Fantasy: 14, History: 36, Horror: 27, Music: 10402,
  Mystery: 9648, Romance: 10749, "Science Fiction": 878, Thriller: 53, War: 10752, Western: 37,
};
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const object = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const safeUrl = (value: unknown) => { try { const url = new URL(text(value)); return url.protocol === "https:" ? url.href : ""; } catch { return ""; } };
const appleArtwork = (value: unknown) => safeUrl(value).replace(/\/\d+x\d+[^/.]*(\.(?:png|jpe?g|webp))(?=$|\?)/i, "/600x900bb$1");
const image = (value: unknown, size = "w500") => /^\/[a-zA-Z0-9_.-]+$/.test(text(value)) ? `https://image.tmdb.org/t/p/${size}${value}` : "";
const normalizedGenre = (genre?: string) => {
  const value = (genre || "").replace(/[-_]/g, " ").trim().toLowerCase();
  if (["sci fi", "sci-fi", "scifi"].includes(value)) return "Science Fiction";
  return Object.keys(GENRES).find((name) => name.toLowerCase() === value) || "";
};

async function json(url: string, token?: string): Promise<RecordValue> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error("Movie service unavailable");
  return object(await response.json());
}

async function tmdbToken(): Promise<string> {
  try {
    const { env } = await import("cloudflare:workers");
    const value = (env as unknown as Record<string, unknown>).TMDB_READ_ACCESS_TOKEN;
    if (typeof value === "string") return value.trim();
  } catch { /* Standard Node local development uses process.env. */ }
  return typeof process !== "undefined" ? process.env.TMDB_READ_ACCESS_TOKEN?.trim() || "" : "";
}

function fromTmdb(value: unknown): Movie | null {
  const m = object(value);
  const id = number(m.id);
  const title = text(m.title);
  if (!id || !title) return null;
  const releaseDate = /^\d{4}-\d{2}-\d{2}$/.test(text(m.release_date)) ? text(m.release_date) : "";
  const genres = array(m.genres).map((g) => text(object(g).name)).filter(Boolean);
  if (!genres.length) for (const genreId of array(m.genre_ids)) {
    const name = Object.keys(GENRES).find((name) => GENRES[name] === genreId);
    if (name) genres.push(name);
  }
  return {
    id: `tmdb-${id}`, title, year: Number(releaseDate.slice(0, 4)) || 0, releaseDate, genres,
    rating: number(m.vote_count) && number(m.vote_count)! > 0 ? number(m.vote_average) : null,
    duration: number(m.runtime), overview: text(m.overview, "A story waiting to be discovered."),
    poster: image(m.poster_path), backdrop: image(m.backdrop_path, "original") || image(m.poster_path, "original"),
    language: text(m.original_language).toUpperCase(), source: "TMDB",
  };
}

function fromApple(value: unknown): Movie | null {
  const m = object(value);
  const id = number(m.trackId);
  if (!id || text(m.kind) !== "feature-movie" || !text(m.trackName)) return null;
  const releaseDate = text(m.releaseDate).slice(0, 10);
  const art = appleArtwork(m.artworkUrl100);
  return {
    id: `apple-${id}`, title: text(m.trackName), year: Number(releaseDate.slice(0, 4)) || 0,
    releaseDate, genres: [text(m.primaryGenreName)].filter(Boolean), rating: null,
    duration: number(m.trackTimeMillis) ? Math.round(number(m.trackTimeMillis)! / 60000) : null,
    overview: text(m.longDescription) || text(m.shortDescription) || "Discover this movie on Apple TV.",
    poster: art, backdrop: art, trailer: safeUrl(m.previewUrl) || undefined,
    source: "Apple iTunes", storeUrl: safeUrl(m.trackViewUrl) || undefined,
  };
}

function fromAppleFeed(value: unknown): Movie | null {
  const m = object(value);
  const id = text(object(object(m.id).attributes)["im:id"]);
  const title = text(object(m["im:name"]).label);
  if (!/^\d+$/.test(id) || !title) return null;
  const releaseDate = text(object(m["im:releaseDate"]).label).slice(0, 10);
  const images = array(m["im:image"]);
  const art = appleArtwork(object(images[images.length - 1]).label);
  const preview = array(m.link).map(object).find((link) => text(object(link.attributes).type).startsWith("video/") && object(link.attributes).rel === "enclosure");
  return {
    id: `apple-${id}`, title, year: Number(releaseDate.slice(0, 4)) || 0, releaseDate,
    genres: [text(object(object(m.category).attributes).label)].filter(Boolean),
    rating: null, duration: null, overview: text(object(m.summary).label, "Discover this movie on Apple TV."),
    poster: art, backdrop: art, source: "Apple iTunes", storeUrl: safeUrl(object(m.id).label) || undefined,
    trailer: safeUrl(object(preview?.attributes).href) || undefined,
  };
}

function filtered(movies: Movie[], genre: string, query: string) {
  return movies.filter((movie) => (!genre || movie.genres.some((item) => item.toLowerCase().includes(genre.toLowerCase()) || (genre === "Science Fiction" && /sci.fi/i.test(item))))
    && (!query || `${movie.title} ${movie.genres.join(" ")} ${movie.overview}`.toLowerCase().includes(query.toLowerCase())));
}

async function tmdbCatalog(query: Required<MovieQuery>, token: string): Promise<MovieCatalog> {
  const params = new URLSearchParams({ language: "en-US", page: "1", region: query.country, include_adult: "false" });
  const genreId = GENRES[query.genre];
  let path = "trending/movie/week";
  if (query.q) { path = "search/movie"; params.set("query", query.q); }
  else if (query.category === "latest") path = "movie/now_playing";
  else if (query.category === "upcoming") path = "movie/upcoming";
  else if (query.category === "top-rated") path = "movie/top_rated";
  else if (query.category === "discover" || genreId) path = "discover/movie";
  if (genreId && path === "discover/movie") params.set("with_genres", String(genreId));
  const data = await json(`https://api.themoviedb.org/3/${path}?${params}`, token);
  let movies = array(data.results).map(fromTmdb).filter((m): m is Movie => Boolean(m));
  if (genreId && path !== "discover/movie") movies = filtered(movies, query.genre, "");
  if (query.category === "upcoming") movies = movies.filter((m) => m.releaseDate >= new Date().toISOString().slice(0, 10));
  if (query.category === "latest") movies.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
  return { movies, source: "TMDB", live: true, updatedAt: new Date().toISOString() };
}

async function appleCatalog(query: Required<MovieQuery>): Promise<MovieCatalog> {
  const updatedAt = new Date().toISOString();
  if (query.category === "upcoming") return {
    movies: [], source: "Curated collection", live: false, updatedAt,
    notice: "Upcoming theatrical releases need a TMDB connection. Explore the curated collection while it is being connected.",
  };
  async function chart() {
    const data = await json(`https://itunes.apple.com/${query.country.toLowerCase()}/rss/topmovies/limit=100/json`);
    return array(object(data.feed).entry).map(fromAppleFeed).filter((m): m is Movie => Boolean(m));
  }
  let movies: Movie[];
  if (query.q || query.genre || query.category === "latest") {
    const params = new URLSearchParams({
      term: query.q || (query.category === "latest" ? String(new Date().getUTCFullYear()) : query.genre),
      country: query.country.toLowerCase(), media: "movie", entity: "movie", limit: "100", explicit: "No",
    });
    if (!query.q && query.category === "latest") params.set("attribute", "releaseYearTerm");
    const data = await json(`https://itunes.apple.com/search?${params}`);
    movies = array(data.results).map(fromApple).filter((m): m is Movie => Boolean(m));
    // Some Apple storefronts return empty movie search results while the chart
    // remains healthy. Keep browsing useful without claiming exhaustive search.
    if (!movies.length) {
      movies = filtered(await chart(), query.genre, query.q);
      if (!movies.length && (query.q || query.genre)) {
        const editorial = filtered(FALLBACK_MOVIES, query.genre, query.q);
        if (editorial.length) return {
          movies: editorial, source: "Curated collection", live: false, updatedAt,
          notice: "No matching titles in the live store catalog. Showing matching picks from our curated collection.",
        };
      }
    }
  } else {
    movies = await chart();
  }
  movies = filtered(movies, query.genre, "");
  if (!movies.length && !query.q && !query.genre) throw new Error("No current movie catalog");
  if (query.category === "latest") movies.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
  return {
    movies, source: "Apple iTunes", live: true, updatedAt,
    notice: query.category === "latest"
      ? "Live Apple movie catalog, sorted by release date. Theatrical release coverage is available with TMDB."
      : query.category === "top-rated"
        ? "Showing Apple's current movie chart. Review scores are not provided by Apple."
        : "Live Apple movie catalog. Availability varies by country.",
  };
}

export async function getMovieCatalog(input: MovieQuery = {}): Promise<MovieCatalog> {
  const query: Required<MovieQuery> = {
    category: ["trending", "latest", "upcoming", "top-rated", "discover"].includes(input.category || "") ? input.category! : "trending",
    genre: normalizedGenre(input.genre), q: (input.q || "").trim().slice(0, 120),
    country: ["US", "IN", "GB", "CA", "AU", "FR", "DE", "JP", "KR"].includes((input.country || "").toUpperCase()) ? input.country!.toUpperCase() : "US",
  };
  const token = await tmdbToken();
  const key = `${token ? "tmdb" : "apple"}:${JSON.stringify(query)}`;
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.value;
  let value: MovieCatalog;
  try { value = token ? await tmdbCatalog(query, token) : await appleCatalog(query); }
  catch {
    // A short outage must never turn historical editorial picks into a "live" feed.
    const movies = query.category === "upcoming" ? [] : filtered(FALLBACK_MOVIES, query.genre, query.q);
    if (query.category === "latest") movies.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
    value = {
      movies, source: "Curated collection", live: false, updatedAt: new Date().toISOString(),
      notice: query.category === "upcoming"
        ? "The live release service is unavailable. Upcoming releases will return when the connection is restored."
        : "The live movie service is unavailable. Enjoy our curated collection and try refreshing in a moment.",
    };
  }
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(key, { expires: Date.now() + (value.live ? CACHE_TTL : 30000), value });
  return value;
}

export async function getMovieDetail(id: string): Promise<Movie | null> {
  if (/^seed-\d+$/.test(id)) return FALLBACK_MOVIES.find((movie) => movie.id === id) || null;
  if (/^tmdb-\d+$/.test(id)) {
    const token = await tmdbToken();
    if (!token) return null;
    const data = await json(`https://api.themoviedb.org/3/movie/${id.slice(5)}?append_to_response=videos&language=en-US`, token);
    const movie = fromTmdb(data);
    if (!movie) return null;
    const videos = array(object(data.videos).results).map(object).filter((v) => v.site === "YouTube" && /^[\w-]{11}$/.test(text(v.key)));
    const trailer = videos.find((v) => v.type === "Trailer" && v.official === true) || videos.find((v) => v.type === "Trailer");
    if (trailer) movie.trailer = `https://www.youtube.com/watch?v=${text(trailer.key)}`;
    return movie;
  }
  if (/^apple-\d+$/.test(id)) {
    const data = await json(`https://itunes.apple.com/lookup?id=${id.slice(6)}&entity=movie`);
    return fromApple(array(data.results)[0]);
  }
  return null;
}
