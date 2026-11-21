"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Disc3, ExternalLink, Headphones, LoaderCircle, Music2, Play, RefreshCw, Search, X } from "lucide-react";
import type { MusicCatalog, MusicLanguage, MusicTrack } from "../lib/music-types";
import "./music-room.css";

const LANGUAGES: { value: MusicLanguage; name: string; native: string; note: string }[] = [
  { value: "en", name: "English", native: "EN", note: "A new favorite, waiting to happen." },
  { value: "hi", name: "Hindi", native: "हिन्दी", note: "For every mood, a little melody." },
  { value: "bn", name: "Bengali", native: "বাংলা", note: "A familiar language. A fresh soundtrack." },
];

function providerUrl(value: string, hosts: string[]): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && hosts.includes(url.hostname) ? url.href : "";
  } catch { return ""; }
}

function artworkUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "mzstatic.com" || url.hostname.endsWith(".mzstatic.com")) ? url.href : "";
  } catch { return ""; }
}

function releaseDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Release date unavailable";
}

function trackDuration(milliseconds: number | null): string {
  if (!milliseconds || !Number.isFinite(milliseconds)) return "";
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function Cover({ track, className = "" }: { track: MusicTrack; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = artworkUrl(track.artwork);
  useEffect(() => setFailed(false), [src]);
  return !src || failed
    ? <span className={`listening-cover-fallback ${className}`} aria-hidden="true"><Music2 size={25} /></span>
    : <img className={className} src={src} alt={`${track.title} artwork`} loading="lazy" onError={() => setFailed(true)} />;
}

export default function MusicRoom({ onPlaybackStart }: { onPlaybackStart?: () => void }) {
  const [language, setLanguage] = useState<MusicLanguage>("en");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<MusicCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<MusicTrack | null>(null);
  const [playerLoaded, setPlayerLoaded] = useState(false);
  const [playerFocusRequest, setPlayerFocusRequest] = useState(0);
  const playerRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const currentLanguage = LANGUAGES.find(item => item.value === language)!;
  const tracks = catalog?.tracks || [];
  const selectedIndex = selected ? tracks.findIndex(track => track.id === selected.id) : -1;
  const embedUrl = selected ? providerUrl(selected.embedUrl, ["embed.music.apple.com"]) : "";
  const appleUrl = selected ? providerUrl(selected.storeUrl, ["music.apple.com", "itunes.apple.com"]) : "";
  const youtubeUrl = selected ? providerUrl(selected.youtubeUrl, ["music.youtube.com"]) : "";

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setCatalog(null);
    const params = new URLSearchParams({ language });
    if (query) params.set("q", query);
    void fetch(`/api/music?${params}`, { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async response => {
        const data = await response.json() as MusicCatalog & { error?: string };
        if (!response.ok || !Array.isArray(data.tracks)) throw new Error(data.error || "The music catalog could not be opened. Please try again.");
        if (!data.live && !data.tracks.length) throw new Error(data.notice || "The music provider is taking a moment. Please try again.");
        if (!controller.signal.aborted) setCatalog(data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "The music catalog could not be opened. Please try again.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [language, query, retry]);

  useEffect(() => {
    if (!selected || !playerFocusRequest) return;
    // React has committed .has-song before the formerly hidden mobile player
    // receives focus or scrolls into view. Only an explicit song choice requests it.
    const player = playerRef.current;
    player?.focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 800px)").matches) {
      player?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }
  }, [selected, playerFocusRequest]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = draft.trim().normalize("NFC");
    if (next === query) setRetry(value => value + 1);
    else setQuery(next);
  }

  function choose(track: MusicTrack) {
    const invoker = document.activeElement;
    if (invoker instanceof HTMLElement && !playerRef.current?.contains(invoker)) returnFocusRef.current = invoker;
    if (track.id !== selected?.id) {
      onPlaybackStart?.();
      setPlayerLoaded(false);
      setSelected(track);
    }
    setPlayerFocusRequest(value => value + 1);
  }

  function closePlayer() {
    setSelected(null);
    setPlayerLoaded(false);
    const invoker = returnFocusRef.current;
    if (invoker?.isConnected) invoker.focus();
    else document.getElementById("music-search")?.focus();
  }

  function clearSearch() { setDraft(""); setQuery(""); }

  return <section id="listen" className="listening-room" aria-label="Listen to music" data-testid="music-room">
    <header className="listening-hero">
      <div className="listening-hero-copy">
        <span className="listening-kicker"><Headphones size={16} /> THE FRAME LISTENING ROOM</span>
        <h1>Every evening<br />has a <em>soundtrack.</em></h1>
        <p>New discoveries in English, Hindi, and Bengali. Find a song you love, then let the evening play.</p>
        <div className="listening-hero-note"><span>ENGLISH</span><i /><span>हिन्दी</span><i /><span>বাংলা</span></div>
      </div>
      <div className="listening-record-art" aria-hidden="true"><div className="listening-record-sleeve"><span>FRAME<br /><small>THE LISTENING ROOM</small></span><div className="listening-record"><div><Music2 size={24} /><i /></div></div><span className="listening-record-caption">A GOOD EVENING, ON REPEAT.</span></div></div>
    </header>

    <div className="listening-toolbar">
      <div className="listening-languages" role="group" aria-label="Choose song language">
        {LANGUAGES.map(item => <button key={item.value} type="button" aria-pressed={language === item.value} data-testid={`music-language-${item.value}`} className={language === item.value ? "selected" : ""} onClick={() => setLanguage(item.value)}>{item.name}<span lang={item.value === "hi" ? "hi" : item.value === "bn" ? "bn" : undefined}>{item.native}</span></button>)}
      </div>
      <form className="listening-search" onSubmit={search} role="search" aria-label="Search music">
        <label htmlFor="music-search" className="listening-sr-only">Search songs or artists</label>
        <Search size={19} aria-hidden="true" />
        <input id="music-search" name="music-search" data-testid="song-search" type="search" value={draft} maxLength={120} placeholder="Search songs or artists" autoComplete="off" onChange={event => setDraft(event.target.value)} />
        {draft && <button className="listening-search-clear" type="button" aria-label="Clear song search" onClick={clearSearch}><X size={17} /></button>}
        <button className="listening-search-submit" type="submit">Search</button>
      </form>
    </div>

    <div className="listening-layout">
      <div className="listening-catalog">
        <div className="listening-section-heading"><div><span className="listening-kicker">{currentLanguage.name.toUpperCase()} · {query ? "THE SONG SEARCH" : "FRESH FROM THE CATALOG"}</span><h2>{query ? <>Songs for <em>“{query}”</em></> : <>Recent <em>releases.</em></>}</h2><p>{query ? "Search by song title or artist in your chosen language." : currentLanguage.note}</p></div><button className="listening-refresh" type="button" disabled={loading} aria-label="Refresh songs" onClick={() => setRetry(value => value + 1)}><RefreshCw size={17} className={loading ? "spin" : ""} /><span>Refresh</span></button></div>

        {catalog?.notice && !loading && <p className="listening-catalog-note">{catalog.notice}</p>}

        {loading ? <div className="listening-loading" role="status"><LoaderCircle className="spin" size={25} /><p>{query ? "Finding your songs…" : "Finding fresh releases…"}</p><span>Opening the Apple music catalog</span></div>
          : error ? <div className="listening-empty" role="alert"><Disc3 size={32} /><h3>The music is taking a moment.</h3><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}><RefreshCw size={16} />Try again</button></div>
          : !tracks.length ? <div className="listening-empty"><Search size={30} /><h3>No songs in this search.</h3><p>Try another title, an artist name, or a different language. Hindi and Bengali script work too.</p>{query && <button type="button" onClick={clearSearch}>Browse recent releases</button>}</div>
          : <><div className="listening-list-label" aria-hidden="true"><span>THE SONG</span><span>RELEASED</span><span>LISTEN</span></div><ol className="listening-track-list" aria-label={`${currentLanguage.name} songs`}>
            {tracks.map((track, index) => {
              const active = selected?.id === track.id;
              const fullSongUrl = providerUrl(track.storeUrl, ["music.apple.com", "itunes.apple.com"]);
              return <li key={track.id} className={`listening-track ${active ? "selected" : ""}`} data-testid={`music-track-${track.id}`} data-language={track.language}>
                <span className="listening-track-number" aria-hidden="true">{active ? <Music2 size={15} /> : String(index + 1).padStart(2, "0")}</span>
                <button className="listening-track-art" type="button" aria-label={`Load ${track.title} in the music player`} aria-pressed={active} onClick={() => choose(track)}><Cover track={track} /><span><Play size={18} fill="currentColor" /></span></button>
                <div className="listening-track-copy"><button type="button" onClick={() => choose(track)}>{track.title}</button><p>{track.artist}</p><span>{track.album}{trackDuration(track.durationMs) && <> · {trackDuration(track.durationMs)}</>}</span>{fullSongUrl && <a className="listening-track-mobile-link" href={fullSongUrl} target="_blank" rel="noopener noreferrer">Apple Music <ExternalLink size={12} /></a>}</div>
                <time className="listening-track-date" dateTime={track.releaseDate}>{releaseDate(track.releaseDate)}</time>
                <button className="listening-track-play" type="button" aria-label={`Load ${track.title} by ${track.artist} in the music player`} aria-pressed={active} onClick={() => choose(track)}>{active ? <Music2 size={18} /> : <Play size={17} fill="currentColor" />}</button>
              </li>;
            })}
          </ol><p className="listening-source">{tracks.length} {tracks.length === 1 ? "song" : "songs"} · {catalog?.source || "Apple music catalog"}{catalog?.updatedAt && Number.isFinite(Date.parse(catalog.updatedAt)) && <> · Updated {new Date(catalog.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</>}</p></>}
      </div>

      <aside ref={playerRef} tabIndex={-1} className={`listening-player ${selected ? "has-song" : ""}`} aria-label="Music player" data-testid="music-player">
        <div className="listening-player-heading"><span className="listening-kicker"><Headphones size={15} />{selected ? "ON YOUR TURNTABLE" : "MAKE YOURSELF AT HOME"}</span>{selected && <button type="button" className="listening-player-close" data-testid="close-music-player" aria-label="Close music player and stop playback" onClick={closePlayer}><X size={18} /></button>}</div>
        {selected ? <>
          <div className="listening-selected-art"><Cover track={selected} /><span>{LANGUAGES.find(item => item.value === selected.language)?.name || "Music"}</span></div>
          <div className="listening-selected-copy" aria-live="polite"><h3>{selected.title}</h3><p>{selected.artist}</p><span>{selected.album}</span></div>
          <div className="listening-embed" aria-busy={Boolean(embedUrl) && !playerLoaded}>
            {embedUrl ? <>{!playerLoaded && <span className="listening-embed-loading" role="status"><LoaderCircle size={20} className="spin" />Opening Apple Music…</span>}<iframe key={selected.id} src={embedUrl} title={`Apple Music player: ${selected.title} by ${selected.artist}`} height="175" allow="autoplay; encrypted-media" loading="eager" referrerPolicy="strict-origin-when-cross-origin" onLoad={() => setPlayerLoaded(true)} /></> : <p>The embedded player is unavailable for this song. Open it using a music service below.</p>}
          </div>
          <div className="listening-player-navigation"><button type="button" disabled={!tracks.length || selectedIndex === 0} aria-label="Load previous song" onClick={() => { const index = selectedIndex < 0 ? 0 : selectedIndex - 1; if (tracks[index]) choose(tracks[index]); }}><ChevronLeft size={18} />Previous</button><span>CHOOSE A SONG</span><button type="button" disabled={!tracks.length || selectedIndex === tracks.length - 1} aria-label="Load next song" onClick={() => { const index = selectedIndex < 0 ? 0 : selectedIndex + 1; if (tracks[index]) choose(tracks[index]); }}>Next<ChevronRight size={18} /></button></div>
          <div className="listening-service-links">{appleUrl && <a href={appleUrl} target="_blank" rel="noopener noreferrer">Listen on Apple Music<ExternalLink size={15} /></a>}{youtubeUrl && <a href={youtubeUrl} target="_blank" rel="noopener noreferrer">Find on YouTube Music<ExternalLink size={15} /></a>}</div>
        </> : <div className="listening-player-empty"><div className="listening-idle-record"><Disc3 size={69} strokeWidth={.8} /></div><h3>A little music<br /><em>for your evening.</em></h3><p>Choose a song to open the Apple Music player here.</p><span>YOUR NEXT FAVORITE IS ONE PLAY AWAY</span></div>}
        <p className="listening-player-note">Apple Music plays previews when signed out. Full songs require an eligible Apple Music subscription. You can also find songs on YouTube Music.</p>
      </aside>
    </div>
  </section>;
}
