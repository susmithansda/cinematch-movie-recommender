import { FALLBACK_MOVIES, type Movie, type MovieCatalog, type MovieIndustry } from "./movies";

type RecordValue = Record<string, unknown>;
export type MovieQuery = { category?: string; genre?: string; q?: string; country?: string; industry?: string };
const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map<string, { expires: number; value: MovieCatalog }>();
const GENRES: Record<string, number> = {
  Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99,
  Drama: 18, Family: 10751, Fantasy: 14, History: 36, Horror: 27, Music: 10402,
  Mystery: 9648, Romance: 10749, "Science Fiction": 878, Thriller: 53, War: 10752, Western: 37,
};
const LANGUAGE_NAMES: Record<string, string> = { en: "English", hi: "Hindi", bn: "Bengali", ko: "Korean", ta: "Tamil", te: "Telugu", ml: "Malayalam", mr: "Marathi", kn: "Kannada", fr: "French", es: "Spanish", ja: "Japanese", zh: "Chinese" };
const industryFor = (language: string): MovieIndustry | undefined => language === "hi" ? "bollywood" : language === "bn" ? "bengali" : language === "en" ? "hollywood" : language ? "international" : undefined;
// Keep Unicode marks: removing Bengali vowel signs collapses distinct titles.
const titleKey = (title: string) => title.toLowerCase().normalize("NFC").replace(/\([^)]*\)/g, "").replace(/[^\p{L}\p{N}\p{M}]/gu, "");

// Apple does not include original language in its Search/RSS schema. These
// unambiguous title/year pairs supply editorial language metadata; a storefront
// or the broad "Bollywood" genre alone never determines a film's language.
const APPLE_LANGUAGE_REGISTRY: [string, number, string, string[]][] = [
  ["Dilwale Dulhania Le Jayenge", 1995, "hi", ["Romance", "Drama"]],
  ["Raees", 2017, "hi", ["Action", "Crime", "Thriller"]],
  ["Gangs of Wasseypur", 2012, "hi", ["Crime", "Drama"]],
  ["Gangs of Wasseypur II", 2012, "hi", ["Crime", "Drama"]],
  ["Bajirao Mastani", 2015, "hi", ["History", "Romance", "Drama"]],
  ["Rocket Singh - Salesman of the Year", 2009, "hi", ["Comedy", "Drama"]],
  ["Vicky Donor", 2012, "hi", ["Comedy", "Romance"]],
  ["Love Aaj Kal", 2009, "hi", ["Romance", "Drama"]],
  ["Detective Byomkesh Bakshy", 2015, "hi", ["Mystery", "Thriller"]],
  ["Veer-Zaara", 2004, "hi", ["Romance", "Drama"]],
  ["Stanley Ka Dabba", 2011, "hi", ["Comedy", "Drama", "Family"]],
  ["Piku", 2015, "hi", ["Comedy", "Drama"]],
  ["Sultan", 2016, "hi", ["Action", "Drama", "Romance"]],
  ["Fukrey", 2013, "hi", ["Comedy"]],
  ["Fukrey", 2014, "hi", ["Comedy"]],
  ["Rab Ne Bana Di Jodi", 2008, "hi", ["Romance", "Comedy", "Drama"]],
  ["Dhoom", 2004, "hi", ["Action", "Crime", "Thriller"]],
  ["Andaz Apna Apna", 1994, "hi", ["Comedy"]],
  ["Jab Tak Hai Jaan", 2012, "hi", ["Romance", "Drama"]],
  ["Devdas", 2002, "hi", ["Romance", "Drama"]],
  ["Dum Laga Ke Haisha", 2015, "hi", ["Romance", "Comedy", "Drama"]],
  ["Yeh Jawaani Hai Deewani", 2013, "hi", ["Romance", "Comedy", "Drama"]],
  ["Neerja", 2016, "hi", ["Drama", "Thriller"]],
  ["Dil Dhadakne Do", 2015, "hi", ["Drama", "Comedy", "Romance"]],
  ["Dil Chahta Hai", 2001, "hi", ["Drama", "Comedy", "Romance"]],
  ["Rockstar", 2011, "hi", ["Drama", "Music", "Romance"]],
  ["Bhaag Milkha Bhaag", 2013, "hi", ["Drama", "History"]],
  ["Ae Dil Hai Mushkil", 2016, "hi", ["Romance", "Drama", "Music"]],
  ["Befikre", 2016, "hi", ["Romance", "Comedy"]],
  ["Kapoor and Sons", 2016, "hi", ["Drama", "Comedy"]],
  ["Raazi", 2018, "hi", ["Thriller", "Drama"]],
  ["Sui Dhaaga - Made In India", 2018, "hi", ["Drama", "Comedy"]],
  ["Fukrey Returns", 2017, "hi", ["Comedy"]],
  ["Jolly LLB 2", 2017, "hi", ["Comedy", "Drama"]],
  ["English Vinglish", 2012, "hi", ["Comedy", "Drama", "Family"]],
  ["Hichki", 2018, "hi", ["Drama", "Comedy"]],
  ["Chak De India", 2007, "hi", ["Drama", "Family"]],
  ["Tiger Zinda Hai", 2017, "hi", ["Action", "Thriller"]],
  ["Fan", 2016, "hi", ["Thriller", "Drama"]],
  ["Badrinath Ki Dulhania", 2017, "hi", ["Romance", "Comedy"]],
  ["Ek Tha Tiger", 2012, "hi", ["Action", "Thriller", "Romance"]],
  ["Padmaavat", 2018, "hi", ["History", "Romance", "Drama"]],
  ["Cocktail", 2012, "hi", ["Romance", "Comedy", "Drama"]],
  ["Mohabbatein", 2000, "hi", ["Romance", "Drama"]],
  ["Dhoom:2", 2006, "hi", ["Action", "Crime", "Thriller"]],
  ["Bodyguard", 2011, "hi", ["Action", "Romance"]],
  ["Drishyam", 2015, "hi", ["Mystery", "Thriller", "Drama"]],
  ["Dear Zindagi", 2016, "hi", ["Drama", "Romance"]],
  ["Tiger 3", 2023, "hi", ["Action", "Thriller"]],
  ["Swades", 2004, "hi", ["Drama"]],
  ["Kabhi Khushi Kabhie Gham", 2001, "hi", ["Drama", "Romance"]],
  ["Kal Ho Naa Ho", 2003, "hi", ["Drama", "Romance", "Comedy"]],
  ["Band Baaja Baaraat", 2010, "hi", ["Romance", "Comedy"]],
  ["Heart of the Beast", 2026, "en", ["Action", "Adventure", "Thriller"]],
  ["Spider-Man: Brand New Day", 2026, "en", ["Action", "Adventure"]],
  ["Project Hail Mary", 2026, "en", ["Science Fiction", "Adventure"]],
  ["Supergirl", 2026, "en", ["Science Fiction", "Action"]],
  ["The End of Oak Street", 2026, "en", ["Science Fiction", "Thriller"]],
  ["Sense and Sensibility", 2026, "en", ["Romance", "Drama"]],
  ["Eternal Sunshine of the Spotless Mind", 2004, "en", ["Romance", "Drama", "Science Fiction"]],
  ["Seven", 1995, "en", ["Crime", "Thriller"]],
  ["The Nice Guys", 2016, "en", ["Crime", "Comedy"]],
  ["The Wolf of Wall Street", 2013, "en", ["Crime", "Drama", "Comedy"]],
  ["Me Before You", 2016, "en", ["Romance", "Drama"]],
  ["Goodfellas", 1990, "en", ["Crime", "Drama"]],
  ["Goodfellas", 2015, "en", ["Crime", "Drama"]],
  ["Nightcrawler", 2014, "en", ["Crime", "Thriller", "Drama"]],
  ["Rocky", 1976, "en", ["Drama"]],
  ["Fury", 2014, "en", ["Action", "Drama", "War"]],
  ["The Exorcist", 1973, "en", ["Horror"]],
  ["The Autopsy of Jane Doe", 2016, "en", ["Horror", "Mystery"]],
  ["The Pursuit of Happyness", 2006, "en", ["Drama"]],
  ["The Pursuit of Happyness", 2007, "en", ["Drama"]],
  ["Spider-Man: No Way Home", 2021, "en", ["Action", "Adventure"]],
  ["The Hateful Eight", 2015, "en", ["Crime", "Western"]],
  ["Jurassic World Rebirth", 2025, "en", ["Action", "Adventure", "Science Fiction"]],
  ["Rear Window", 1954, "en", ["Mystery", "Thriller"]],
  ["The Hunger Games", 2012, "en", ["Action", "Adventure", "Science Fiction"]],
  ["Harry Potter and the Philosopher's Stone", 2001, "en", ["Family", "Fantasy", "Adventure"]],
  ["Harry Potter and the Sorcerer's Stone", 2001, "en", ["Family", "Fantasy", "Adventure"]],
  ["The Shawshank Redemption", 1994, "en", ["Drama", "Crime"]],
  ["The Shawshank Redemption", 1995, "en", ["Drama", "Crime"]],
  ["North By Northwest", 1959, "en", ["Mystery", "Thriller"]],
  ["The Intern", 2015, "en", ["Comedy", "Drama"]],
  ["The Intern", 2016, "en", ["Comedy", "Drama"]],
  ["Anyone But You", 2023, "en", ["Romance", "Comedy"]],
  ["Anyone But You", 2024, "en", ["Romance", "Comedy"]],
  ["There Will Be Blood", 2007, "en", ["Drama"]],
  ["There Will Be Blood", 2008, "en", ["Drama"]],
  ["The Social Network", 2010, "en", ["Drama"]],
  ["Contact", 1997, "en", ["Science Fiction", "Drama"]],
  ["Catch Me If You Can", 2002, "en", ["Crime", "Drama"]],
  ["Reservoir Dogs", 1992, "en", ["Crime", "Thriller"]],
];

function appleOriginalMetadata(title: string, year: number) {
  const key = titleKey(title);
  // Apple does not distinguish audio versions. A dubbed label is insufficient
  // evidence for original language, even when its base title matches a seed.
  const versionLabel = /\b(?:dubbed|dubbing|dub)\b|\((?:hindi|bengali|bangla|tamil|telugu|english)(?:\s+(?:version|audio))?\)/i.test(title);
  const seed = versionLabel ? undefined : FALLBACK_MOVIES.find((movie) => movie.year === year
    && [movie.title, ...(movie.searchAliases || [])].some((name) => titleKey(name) === key));
  const entry = versionLabel ? undefined : APPLE_LANGUAGE_REGISTRY.find(([name, releaseYear]) => titleKey(name) === key && releaseYear === year);
  const originalLanguage = seed?.originalLanguage || entry?.[2];
  return {
    originalLanguage,
    industry: originalLanguage ? industryFor(originalLanguage) : undefined,
    language: originalLanguage ? LANGUAGE_NAMES[originalLanguage] || originalLanguage.toUpperCase() : undefined,
    genres: seed?.genres || entry?.[3] || [],
    searchAliases: seed ? [seed.title, ...(seed.searchAliases || [])].filter((name) => name !== title) : undefined,
  };
}
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
  const originalLanguage = text(m.original_language).toLowerCase();
  return {
    id: `tmdb-${id}`, title, year: Number(releaseDate.slice(0, 4)) || 0, releaseDate, genres,
    searchAliases: text(m.original_title) && text(m.original_title) !== title ? [text(m.original_title)] : undefined,
    rating: number(m.vote_count) && number(m.vote_count)! > 0 ? number(m.vote_average) : null,
    duration: number(m.runtime), overview: text(m.overview, "A story waiting to be discovered."),
    poster: image(m.poster_path), backdrop: image(m.backdrop_path, "original") || image(m.poster_path, "original"),
    originalLanguage, industry: industryFor(originalLanguage),
    language: LANGUAGE_NAMES[originalLanguage] || originalLanguage.toUpperCase(), source: "TMDB",
  };
}

function fromApple(value: unknown): Movie | null {
  const m = object(value);
  const id = number(m.trackId);
  if (!id || text(m.kind) !== "feature-movie" || !text(m.trackName)) return null;
  const releaseDate = text(m.releaseDate).slice(0, 10);
  const art = appleArtwork(m.artworkUrl100);
  const metadata = appleOriginalMetadata(text(m.trackName), Number(releaseDate.slice(0, 4)) || 0);
  return {
    id: `apple-${id}`, title: text(m.trackName), year: Number(releaseDate.slice(0, 4)) || 0,
    releaseDate, genres: [...new Set([...metadata.genres, text(m.primaryGenreName)].filter(Boolean))], rating: null,
    duration: number(m.trackTimeMillis) ? Math.round(number(m.trackTimeMillis)! / 60000) : null,
    overview: text(m.longDescription) || text(m.shortDescription) || "Discover this movie on Apple TV.",
    poster: art, backdrop: art, trailer: safeUrl(m.previewUrl) || undefined,
    source: "Apple iTunes", storeUrl: safeUrl(m.trackViewUrl) || undefined,
    language: metadata.language, originalLanguage: metadata.originalLanguage, industry: metadata.industry,
    searchAliases: metadata.searchAliases,
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
  const metadata = appleOriginalMetadata(title, Number(releaseDate.slice(0, 4)) || 0);
  return {
    id: `apple-${id}`, title, year: Number(releaseDate.slice(0, 4)) || 0, releaseDate,
    genres: [...new Set([...metadata.genres, text(object(object(m.category).attributes).label)].filter(Boolean))],
    rating: null, duration: null, overview: text(object(m.summary).label, "Discover this movie on Apple TV."),
    poster: art, backdrop: art, source: "Apple iTunes", storeUrl: safeUrl(object(m.id).label) || undefined,
    trailer: safeUrl(object(preview?.attributes).href) || undefined,
    language: metadata.language, originalLanguage: metadata.originalLanguage, industry: metadata.industry,
    searchAliases: metadata.searchAliases,
  };
}

function filtered(movies: Movie[], genre: string, query: string, industry = "all") {
  const needle = titleKey(query);
  return movies.filter((movie) => (!genre || movie.genres.some((item) => item.toLowerCase().includes(genre.toLowerCase()) || (genre === "Science Fiction" && /sci.fi/i.test(item))))
    && (industry === "all" || (movie.originalLanguage ? industryFor(movie.originalLanguage) : movie.industry) === industry)
    && (!query || (needle && titleKey(`${movie.title} ${(movie.searchAliases || []).join(" ")} ${movie.genres.join(" ")} ${movie.overview}`).includes(needle))));
}

async function tmdbCatalog(query: Required<MovieQuery>, token: string): Promise<MovieCatalog> {
  const params = new URLSearchParams({ language: "en-US", page: "1", region: query.country, include_adult: "false" });
  const genreId = GENRES[query.genre];
  const originalLanguage = query.industry === "bollywood" ? "hi" : query.industry === "bengali" ? "bn" : query.industry === "hollywood" ? "en" : "";
  const dateAt = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const today = dateAt(0);
  let path = "trending/movie/week";
  if (query.q) { path = "search/movie"; params.set("query", query.q); }
  else if (originalLanguage || genreId || query.category === "discover") path = "discover/movie";
  else if (query.category === "latest") path = "movie/now_playing";
  else if (query.category === "upcoming") path = "movie/upcoming";
  else if (query.category === "top-rated") path = "movie/top_rated";
  if (path === "discover/movie") {
    if (genreId) params.set("with_genres", String(genreId));
    if (originalLanguage) params.set("with_original_language", originalLanguage);
    params.set("include_video", "false");
    params.set("sort_by", query.category === "top-rated" ? "vote_average.desc" : "popularity.desc");
    if (query.category === "top-rated") params.set("vote_count.gte", "100");
    if (query.category === "latest" || query.category === "upcoming") {
      params.set("with_release_type", "2|3");
      params.set("release_date.gte", query.category === "latest" ? dateAt(-45) : today);
      params.set("release_date.lte", query.category === "latest" ? today : dateAt(120));
    }
  }
  const data = await json(`https://api.themoviedb.org/3/${path}?${params}`, token);
  let movies = array(data.results).map(fromTmdb).filter((m): m is Movie => Boolean(m));
  movies = filtered(movies, query.genre, "", query.industry);
  if (query.category === "upcoming") movies = movies.filter((m) => m.releaseDate >= today && m.releaseDate <= dateAt(120));
  if (query.category === "latest") movies = movies.filter((m) => m.releaseDate >= dateAt(-45) && m.releaseDate <= today).sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
  return {
    movies, source: "TMDB", live: true, updatedAt: new Date().toISOString(),
    ...(query.industry === "hollywood" ? { notice: "English-language originals from TMDB. Release region and original language are separate filters." }
      : query.industry === "bengali" ? { notice: "Bengali-language originals from TMDB. Release region is independent of original language; dubbed non-Bengali originals are excluded." }
      : query.industry === "bollywood" ? { notice: "Hindi-language originals from TMDB. Dubbed Tamil, Telugu, and other regional originals are excluded." } : {}),
  };
}

async function appleCatalog(query: Required<MovieQuery>): Promise<MovieCatalog> {
  const updatedAt = new Date().toISOString();
  if (query.category === "upcoming") return {
    movies: [], source: "Curated collection", live: false, updatedAt,
    notice: "Upcoming theatrical releases need a TMDB connection. Explore the curated collection while it is being connected.",
  };
  async function chart() {
    const data = await json(`https://itunes.apple.com/${query.country.toLowerCase()}/rss/topmovies/limit=100/${query.industry === "bollywood" ? "genre=4431/" : ""}json`);
    return array(object(data.feed).entry).map(fromAppleFeed).filter((m): m is Movie => Boolean(m));
  }
  let movies: Movie[];
  if (query.industry !== "all" && !query.q) {
    movies = await chart();
  } else if (query.q || query.genre || query.category === "latest") {
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
      movies = filtered(await chart(), query.genre, query.q, query.industry);
      if (!movies.length && (query.q || query.genre)) {
        const editorial = filtered(FALLBACK_MOVIES, query.genre, query.q, query.industry);
        if (editorial.length) return {
          movies: editorial, source: "Curated collection", live: false, updatedAt,
          notice: "No matching titles in the live store catalog. Showing matching picks from our curated collection.",
        };
      }
    }
  } else {
    movies = await chart();
  }
  movies = filtered(movies, query.genre, query.q, query.industry);
  if (!movies.length && query.category !== "latest" && query.industry !== "all") {
    return {
      movies: filtered(FALLBACK_MOVIES, query.genre, query.q, query.industry), source: "Curated collection", live: false, updatedAt,
      notice: query.industry === "bollywood" ? "A curated collection of Hindi originals. The live store chart has no verified matching titles in this region."
        : query.industry === "bengali" ? "A curated collection of Bengali originals, from Ray classics to modern Kolkata stories. The live store chart has no verified matching titles in this region."
        : "A curated collection of English-language originals. The live store chart has no verified matching titles in this region.",
    };
  }
  if (!movies.length && !query.q && !query.genre && query.industry === "all") throw new Error("No current movie catalog");
  if (query.category === "latest") {
    const today = new Date().toISOString().slice(0, 10);
    const recent = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
    movies = movies.filter((movie) => movie.releaseDate >= recent && movie.releaseDate <= today).sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
  }
  if (!movies.length && query.industry === "bengali") return {
    movies: filtered(FALLBACK_MOVIES, query.genre, query.q, query.industry), source: "Curated collection", live: false, updatedAt,
    notice: "No verified recent Bengali originals are available in this store feed. These editorial picks are a curated collection, not a current theatrical release feed.",
  };
  const scope = query.industry === "bollywood" ? " Only verified Hindi originals are included; Apple's broader Bollywood genre also contains dubs, which are excluded."
    : query.industry === "bengali" ? " Only verified Bengali-language originals are included; storefront country and dubbed audio do not determine original language."
    : query.industry === "hollywood" ? " Limited to verified English-language originals; the storefront country does not determine a film's original language." : "";
  return {
    movies, source: "Apple iTunes", live: true, updatedAt,
    notice: query.category === "latest"
      ? `Live store-chart films released in the last 180 days, sorted by release date. This is not a complete theatrical release feed.${scope}`
      : query.category === "top-rated"
        ? `Showing Apple's current movie chart. Review scores are not provided by Apple.${scope}`
        : `Live Apple movie catalog. Availability varies by country.${scope}`,
  };
}

export async function getMovieCatalog(input: MovieQuery = {}): Promise<MovieCatalog> {
  const query: Required<MovieQuery> = {
    category: ["trending", "latest", "upcoming", "top-rated", "discover"].includes(input.category || "") ? input.category! : "trending",
    genre: normalizedGenre(input.genre), q: (input.q || "").trim().slice(0, 120),
    country: ["US", "IN", "GB", "CA", "AU", "FR", "DE", "JP", "KR"].includes((input.country || "").toUpperCase()) ? input.country!.toUpperCase() : "US",
    industry: ["hollywood", "bollywood", "bengali"].includes((input.industry || "").toLowerCase()) ? input.industry!.toLowerCase() : "all",
  };
  const token = await tmdbToken();
  const key = `${token ? "tmdb" : "apple"}:${JSON.stringify(query)}`;
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.value;
  let value: MovieCatalog;
  try { value = token ? await tmdbCatalog(query, token) : await appleCatalog(query); }
  catch {
    // A short outage must never turn historical editorial picks into a "live" feed.
    const movies = query.category === "upcoming" ? [] : filtered(FALLBACK_MOVIES, query.genre, query.q, query.industry);
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
