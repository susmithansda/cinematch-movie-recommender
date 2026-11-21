import type { MusicCatalog, MusicLanguage, MusicTrack } from "./music-types";

export type MusicQuery = { language?: string; q?: string };
type JsonObject = Record<string, unknown>;
type CacheEntry<T> = { expires: number; value: T };
type Candidate = {
  id: unknown; title: unknown; artist: unknown; album: unknown; artwork: unknown;
  releaseDate: unknown; durationMs: unknown; genre: unknown; genreId?: unknown;
};

const DAY = 86_400_000;
const TTL = 10 * 60_000;
const MAX_CACHE = 80;
const MAX_INFLIGHT = 32;
const catalogs = new Map<string, CacheEntry<MusicCatalog>>();
const pending = new Map<string, Promise<MusicCatalog>>();
const charts = new Map<MusicLanguage, CacheEntry<Candidate[]>>();
const pendingCharts = new Map<MusicLanguage, Promise<Candidate[]>>();
const languageNames: Record<MusicLanguage, string> = { en: "English", hi: "Hindi", bn: "Bengali" };
const genreIds = { hi: "1263", bn: "100046" };

// Apple supplies genres, not a sung-language field. These deliberately narrow
// artist selections supplement catalog genres; the UI explains that this is
// language discovery, not an exhaustive or automatic language transcription.
const ENGLISH_ARTISTS = [
  "Taylor Swift", "Sabrina Carpenter", "Billie Eilish", "Olivia Rodrigo", "Dua Lipa",
  "Adele", "Ed Sheeran", "Harry Styles", "Bruno Mars", "Lady Gaga", "Miley Cyrus",
  "Ariana Grande", "Chappell Roan", "Gracie Abrams", "Tate McRae", "Lola Young",
  "Benson Boone", "Teddy Swims", "Alex Warren", "The Weeknd", "Justin Bieber",
  "Post Malone", "Kendrick Lamar", "SZA", "Doja Cat", "Hozier", "Lorde",
  "Lana Del Rey", "Coldplay", "Imagine Dragons", "Linkin Park", "The Marías",
  "Lainey Wilson", "Ella Langley", "Megan Moroney", "Kacey Musgraves", "Luke Combs",
  "Morgan Wallen", "Chris Stapleton", "Zach Bryan", "Noah Kahan", "Shaboozey",
  "The Red Clay Strays", "Stephen Wilson Jr.", "Riley Green", "Thomas Rhett",
  "Tame Impala", "Hot Chip", "Don Toliver", "Offset", "Quavo", "Labrinth", "Tove Lo",
  "Sam Fender", "RAYE", "Charli xcx", "Sam Smith", "Lewis Capaldi", "Niall Horan",
  "Maroon 5", "OneRepublic", "Beyoncé", "Rihanna", "P!nk", "Kelly Clarkson",
  "Katy Perry", "Shawn Mendes", "Conan Gray", "The 1975", "Halsey", "Paramore",
];
const BENGALI_ARTISTS = [
  "Anupam Roy", "Rupam Islam", "Iman Chakraborty", "Lagnajita Chakraborty",
  "Anjan Dutt", "Nachiketa Chakraborty", "Somlata Acharyya Chowdhury",
  "Somlata Acharyya Choudhury", "Rupankar Bagchi", "Prithibi", "Fossils",
  "Ankita Bhattacharyya", "Anirban Bhattacharya", "Ishaan", "Ankan Kumar",
];
const HINDI_ARTISTS = ["Jubin Nautiyal", "Darshan Raval", "Anuv Jain", "Prateek Kuhad", "Ritviz", "Rito Riba", "Faheem Abdullah"];
const OTHER_LANGUAGE_GENRES = /(?:tamil|telugu|punjabi|marathi|gujarati|kannada|malayalam|bhojpuri|assamese|odia|rajasthani|haryanvi|urdu|latin|spanish|french|german|k-pop|j-pop|korean|japanese|mandopop|cantopop|arabic|turkish)/i;
const LANGUAGE_TAG = /\b(bengali|bangla|hindi|english|tamil|telugu|punjabi|marathi|kannada|malayalam|spanish|korean|japanese)\b/gi;

function object(value: unknown): JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value.slice(0, 200) : []; }
function text(value: unknown, max = 300): string { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function label(value: unknown): string { return text(object(value).label); }
function country(language: MusicLanguage): string { return language === "en" ? "us" : "in"; }
function artistMatches(artist: string, registry: string[]): boolean {
  const names = artist.toLocaleLowerCase("en").split(/\s*(?:,|&|\bfeat\.?|\bfeaturing\b|\band\b)\s*/);
  return registry.some(value => names.includes(value.toLocaleLowerCase("en")));
}

export function normalizeMusicQuery(input: MusicQuery = {}): { language: MusicLanguage; q: string } {
  const language = input.language === "hi" || input.language === "bn" ? input.language : "en";
  const q = Array.from((typeof input.q === "string" ? input.q : "").normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").trim()).slice(0, 120).join("");
  return { language, q };
}

function songLanguage(row: Candidate): MusicLanguage | null {
  const genre = text(row.genre);
  const title = text(row.title);
  const album = text(row.album);
  const artist = text(row.artist);
  if (OTHER_LANGUAGE_GENRES.test(genre)) return null;
  const tags = [...`${title} ${album}`.matchAll(LANGUAGE_TAG)].map(match => match[1].toLowerCase());
  const tagged = tags.map(tag => tag === "bengali" || tag === "bangla" ? "bn" : tag === "hindi" ? "hi" : tag === "english" ? "en" : "other");
  const distinct = new Set(tagged);
  if (distinct.size > 1 || distinct.has("other")) return null;
  const explicit = distinct.size === 1 ? tagged[0] as MusicLanguage : null;
  const catalog = String(row.genreId) === genreIds.bn || /\b(?:bengali|bangla)\b/i.test(genre) ? "bn"
    : String(row.genreId) === genreIds.hi || /\b(?:bollywood|hindi)\b/i.test(genre) ? "hi" : null;
  if (catalog && explicit && catalog !== explicit) return null;
  if (catalog) return catalog;
  if (explicit) return explicit;
  if (/[\u0900-\u097f]/.test(title) && /[\u0980-\u09ff]/.test(title)) return null;
  if (/\b(?:regional indian|soundtrack|indian folk)\b/i.test(genre) && artistMatches(artist, BENGALI_ARTISTS)
    && !/[\u0900-\u097f]/.test(title)) return "bn";
  if (/\b(?:indian pop|indian folk|pop|soundtrack)\b/i.test(genre) && artistMatches(artist, HINDI_ARTISTS)
    && !/[\u0980-\u09ff]/.test(title)) return "hi";
  if (!/[\u0900-\u09ff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(title)
    && !/\b(?:indian|worldwide|classical|devotional|spiritual)\b/i.test(genre)
    && artistMatches(artist, ENGLISH_ARTISTS)) return "en";
  return null;
}

function artwork(value: unknown): string {
  try {
    const url = new URL(text(value, 2000));
    if (url.protocol !== "https:" || url.username || url.password || url.port || !/^(?:[a-z0-9-]+\.)*mzstatic\.com$/i.test(url.hostname)) return "";
    return url.href.replace(/\/\d+x\d+bb(?=\.)/, "/400x400bb");
  } catch { return ""; }
}

function releaseDate(value: unknown): string {
  const day = text(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const timestamp = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === day ? day : "";
}

function track(row: Candidate, language: MusicLanguage, recent: boolean): MusicTrack | null {
  const id = typeof row.id === "string" || typeof row.id === "number" ? String(row.id) : "";
  const title = text(row.title), artist = text(row.artist), date = releaseDate(row.releaseDate);
  if ((typeof row.id === "number" && !Number.isSafeInteger(row.id)) || !/^[1-9]\d{0,19}$/.test(id) || !title || !artist || !date || songLanguage(row) !== language) return null;
  const today = Math.floor(Date.now() / DAY), day = Math.floor(Date.parse(date) / DAY);
  if (day > today || (recent && day < today - 365)) return null;
  const storefront = country(language);
  const durationMs = typeof row.durationMs === "number" && Number.isFinite(row.durationMs) && row.durationMs > 0 ? row.durationMs : null;
  // Numeric IDs and fixed provider hosts prevent upstream URLs becoming links
  // or embed sources. No raw audio URLs or credentials are exposed to clients.
  return {
    id: `apple:${id}`, title, artist, album: text(row.album), artwork: artwork(row.artwork),
    storeUrl: `https://music.apple.com/${storefront}/song/${id}`,
    embedUrl: `https://embed.music.apple.com/${storefront}/song/${id}?theme=dark`,
    youtubeUrl: `https://music.youtube.com/search?q=${encodeURIComponent(`${title} ${artist}`)}`,
    releaseDate: date, durationMs, language,
  };
}

async function upstream(url: URL): Promise<JsonObject> {
  const signal = AbortSignal.timeout(8000);
  let destination = url;
  for (let hop = 0; hop < 3; hop++) {
    const response = await fetch(destination.href, {
      headers: { Accept: "application/json" }, redirect: "manual", signal,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Missing music catalog redirect");
      const next = new URL(location, destination);
      if (next.protocol !== "https:" || next.hostname !== "itunes.apple.com" || next.username || next.password || next.port) throw new Error("Unsafe music catalog redirect");
      destination = next;
      continue;
    }
    if (!response.ok) throw new Error("Music catalog is unavailable");
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid music catalog response");
    return data as JsonObject;
  }
  throw new Error("Too many music catalog redirects");
}

async function loadChart(language: MusicLanguage): Promise<Candidate[]> {
  const genre = language === "en" ? "" : `/genre=${genreIds[language]}`;
  const data = await upstream(new URL(`https://itunes.apple.com/${country(language)}/rss/topsongs/limit=100${genre}/json`));
  if (!data.feed || typeof data.feed !== "object") throw new Error("Invalid music chart response");
  return array(object(data.feed).entry).map(item => {
    const row = object(item), category = object(object(row.category).attributes);
    const images = array(row["im:image"]);
    return {
      id: object(object(row.id).attributes)["im:id"], title: label(row["im:name"]), artist: label(row["im:artist"]),
      album: label(object(row["im:collection"])["im:name"]), artwork: label(images[images.length - 1]),
      releaseDate: label(row["im:releaseDate"]), durationMs: null, genre: category.label, genreId: category["im:id"],
    };
  });
}

async function chart(language: MusicLanguage): Promise<Candidate[]> {
  const saved = charts.get(language);
  if (saved && saved.expires > Date.now()) return saved.value;
  const loading = pendingCharts.get(language);
  if (loading) return loading;
  const promise = loadChart(language).then(value => { charts.set(language, { value, expires: Date.now() + TTL }); return value; });
  pendingCharts.set(language, promise);
  try { return await promise; } finally { pendingCharts.delete(language); }
}

async function search(q: string, language: MusicLanguage): Promise<Candidate[]> {
  const url = new URL("https://itunes.apple.com/search");
  url.search = new URLSearchParams({ term: q, media: "music", entity: "song", country: country(language), limit: "100" }).toString();
  const data = await upstream(url);
  if (!Array.isArray(data.results)) throw new Error("Invalid music search response");
  return array(data.results).flatMap(item => {
    const row = object(item);
    if (row.kind !== "song") return [];
    return [{ id: row.trackId, title: row.trackName, artist: row.artistName, album: row.collectionName,
      artwork: row.artworkUrl100, releaseDate: row.releaseDate, durationMs: row.trackTimeMillis,
      genre: row.primaryGenreName }];
  });
}

function empty(language: MusicLanguage, q: string, notice: string): MusicCatalog {
  return { tracks: [], language, mode: q ? "search" : "recent", source: "Apple iTunes", notice, updatedAt: new Date().toISOString(), live: false };
}

async function loadCatalog(language: MusicLanguage, q: string): Promise<MusicCatalog> {
  const recent = !q;
  const results = await Promise.allSettled(q ? [search(q, language), chart(language)] : [chart(language)]);
  const primary = results[0];
  if (primary.status === "rejected") return empty(language, q, "The music catalog is temporarily unavailable. Please try again shortly.");
  // Genre-chart membership helps classify songs whose search result only gives
  // a generic soundtrack genre. A storefront never establishes sung language.
  const verified = new Set<string>();
  const secondary = results[1];
  if (secondary?.status === "fulfilled" && language !== "en") {
    for (const row of secondary.value) if (songLanguage(row) === language) verified.add(String(row.id));
  }
  const candidates = primary.value.map(row => verified.has(String(row.id)) ? { ...row, genreId: genreIds[language as "hi" | "bn"] } : row);
  const seen = new Set<string>();
  const tracks = candidates.flatMap(row => {
    const value = track(row, language, recent);
    if (!value || seen.has(value.id)) return [];
    seen.add(value.id);
    return [value];
  }).sort((left, right) => right.releaseDate.localeCompare(left.releaseDate) || left.title.localeCompare(right.title)).slice(0, 40);
  const selection = language === "en"
    ? "English discovery uses a selection of English-language artists and available catalog metadata."
    : `${languageNames[language]} discovery uses catalog genres and selected artists; some matching songs may be omitted when language is unclear.`;
  const notice = recent
    ? `Releases from the last 365 days found in the current iTunes charts, newest first. ${selection}${tracks.length ? "" : " No matching recent releases are available right now; try a song or artist search."}`
    : `${tracks.length ? "Results from the music catalog, newest first." : `No matching ${languageNames[language]} songs were found. Try another spelling, artist, or language.`} ${selection}${secondary?.status === "rejected" ? " Extra genre matching is temporarily unavailable." : ""}`;
  return { tracks, language, mode: recent ? "recent" : "search", source: "Apple iTunes", notice, updatedAt: new Date().toISOString(), live: true };
}

export async function getMusicCatalog(input: MusicQuery = {}): Promise<MusicCatalog> {
  const { language, q } = normalizeMusicQuery(input);
  const key = JSON.stringify([language, q.toLocaleLowerCase("en")]);
  const saved = catalogs.get(key);
  if (saved && saved.expires > Date.now()) return saved.value;
  const loading = pending.get(key);
  if (loading) return loading;
  if (pending.size >= MAX_INFLIGHT) return empty(language, q, "The music catalog is busy. Please try again in a moment.");
  const promise = loadCatalog(language, q).catch(() => empty(language, q, "The music catalog is temporarily unavailable. Please try again shortly."));
  pending.set(key, promise);
  try {
    const value = await promise;
    for (const [storedKey, entry] of catalogs) if (entry.expires <= Date.now()) catalogs.delete(storedKey);
    if (catalogs.size >= MAX_CACHE) catalogs.delete(catalogs.keys().next().value!);
    catalogs.set(key, { value, expires: Date.now() + (value.live ? TTL : 20_000) });
    return value;
  } finally { pending.delete(key); }
}
