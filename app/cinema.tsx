"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowRight, Bookmark, Check, ChevronLeft, ChevronRight, Clapperboard, Compass, Eye, EyeOff, Film, Flame, Globe2, Headphones, Heart, LoaderCircle, LogOut, Menu, Music2, Pause, Play, Plus, Search, Shuffle, SlidersHorizontal, Sparkles, Star, Volume2, X, Zap } from "lucide-react";
import { FALLBACK_MOVIES, type Movie, type MovieCatalog } from "../lib/movies";

type Account = { id: string; name: string; email: string; provider: "email" | "chatgpt" };
type View = "discover" | "trending" | "latest" | "upcoming" | "top-rated" | "watchlist";
type AuthMode = "login" | "register" | "forgot-password" | "reset-password";
type ApiResponse = { error?: string; user: Account | null; movies: Movie[]; movie?: Movie; message?: string };
const GENRES = ["All movies", "Action", "Adventure", "Sci-Fi", "Comedy", "Thriller", "Romance", "Animation", "Horror", "Drama"];
const MOODS = [{ label: "On the edge", genre: "Thriller", icon: "⚡" }, { label: "A good laugh", genre: "Comedy", icon: "☀" }, { label: "In my feels", genre: "Romance", icon: "♡" }, { label: "Another world", genre: "Sci-Fi", icon: "✧" }];
const VIEW_LABELS: Record<View, string> = { discover: "Discover", trending: "Trending", latest: "New releases", upcoming: "Coming soon", "top-rated": "Top rated", watchlist: "My watchlist" };
const HERO_IDS = ["dune", "interstellar", "spider"];

async function api(path: string, options?: RequestInit) {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const data = await response.json() as ApiResponse;
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

function Modal({ children, label, onClose, wide = false }: { children: ReactNode; label: string; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const elements = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, [tabindex="0"]');
      if (!elements?.length) return;
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", onKey); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-shade" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className={`modal ${wide ? "modal-wide" : ""}`}><button className="icon-btn modal-close" aria-label="Close dialog" onClick={onClose}><X size={20} /></button>{children}</div></div>;
}

function Poster({ movie, className = "" }: { movie: Movie; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [movie.poster]);
  return failed || !movie.poster ? <div className={`poster-fallback ${className}`}><Film size={30} /><span>{movie.title}</span></div> : <img className={className} src={movie.poster} alt={`${movie.title} poster`} loading="lazy" onError={() => setFailed(true)} />;
}

function MovieCard({ movie, saved, onOpen, onSave, index }: { movie: Movie; saved: boolean; onOpen: () => void; onSave: () => void; index: number }) {
  return <article className="movie-card" style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}>
    <div className="poster-wrap"><button className="poster-link" onClick={onOpen} aria-label={`View ${movie.title}`}><Poster movie={movie} /><span className="poster-vignette" /><span className="poster-play"><Play size={22} fill="currentColor" /></span></button>
      {movie.rating != null && movie.rating > 0 && <span className="rating"><Star size={11} fill="currentColor" /> {movie.rating.toFixed(1)}</span>}
      <button className={`save-movie ${saved ? "is-saved" : ""}`} aria-label={`${saved ? "Remove" : "Save"} ${movie.title}${saved ? " from" : " to"} watchlist`} aria-pressed={saved} onClick={onSave}>{saved ? <Check size={17} /> : <Plus size={17} />}</button>
      <span className="poster-genre">{movie.genres[0] || "Movie"}</span>
    </div>
    <button className="movie-title" onClick={onOpen}>{movie.title}</button><p className="movie-meta">{movie.year || "TBA"}<span>•</span>{movie.genres.slice(0, 2).join(" / ") || "Cinema"}</p>
  </article>;
}

function MusicLounge({ onClose }: { onClose: () => void }) {
  const [playing, setPlaying] = useState(false), [mode, setMode] = useState("Cinematic"), [volume, setVolume] = useState(35), [error, setError] = useState("");
  const engine = useRef<{ context: AudioContext; gain: GainNode; timer: ReturnType<typeof setInterval> } | null>(null);
  const stop = useCallback(() => { if (engine.current) { clearInterval(engine.current.timer); void engine.current.context.close(); engine.current = null; } setPlaying(false); }, []);
  useEffect(() => () => { if (engine.current) { clearInterval(engine.current.timer); void engine.current.context.close(); } }, []);
  useEffect(() => { if (engine.current) engine.current.gain.gain.setTargetAtTime(volume / 100 * 0.13, engine.current.context.currentTime, 0.15); }, [volume]);
  function start(selected = mode) {
    stop(); setError("");
    try {
      const context = new AudioContext(), gain = context.createGain();
      gain.gain.value = volume / 100 * 0.13; gain.connect(context.destination);
      const chords: Record<string, number[]> = { Cinematic: [130.81, 196, 261.63, 329.63, 392, 523.25], "Lo-fi": [146.83, 174.61, 220, 293.66, 349.23, 440], Ambient: [110, 164.81, 220, 277.18, 329.63, 440] };
      const notes = chords[selected];
      [0, 1, 2].forEach((n) => { const osc = context.createOscillator(), pad = context.createGain(); osc.type = "sine"; osc.frequency.value = notes[n]; osc.detune.value = n * 3; pad.gain.value = 0.14; osc.connect(pad); pad.connect(gain); osc.start(); });
      let step = 0;
      function tick() { const t = context.currentTime, osc = context.createOscillator(), envelope = context.createGain(); osc.type = selected === "Lo-fi" ? "triangle" : "sine"; osc.frequency.value = notes[[0, 2, 4, 3, 5, 2, 1, 4][step++ % 8]] * 2; envelope.gain.setValueAtTime(0, t); envelope.gain.linearRampToValueAtTime(0.21, t + 0.06); envelope.gain.exponentialRampToValueAtTime(0.001, t + 2.4); osc.connect(envelope); envelope.connect(gain); osc.start(t); osc.stop(t + 2.5); }
      tick(); const timer = setInterval(tick, selected === "Lo-fi" ? 650 : selected === "Ambient" ? 1500 : 1050);
      engine.current = { context, gain, timer }; void context.resume(); setPlaying(true);
    } catch { setError("Audio is unavailable in this browser. Try a current browser."); }
  }
  return <div className="music-panel"><div className="music-panel-top"><span className="eyebrow"><Headphones size={14} /> THE LISTENING ROOM</span><button className="icon-btn" aria-label="Close music lounge" onClick={onClose}><X size={17} /></button></div><div className={`vinyl ${playing ? "spinning" : ""}`}><div><Music2 size={25} /></div></div><h3>Set the soundtrack.</h3><p>A little atmosphere for your next great find.</p><div className="music-modes">{["Cinematic", "Lo-fi", "Ambient"].map(item => <button key={item} className={item === mode ? "selected" : ""} onClick={() => { setMode(item); if (playing) start(item); }}>{item}</button>)}</div><div className="music-controls"><Volume2 size={16} /><input aria-label="Music volume" type="range" min="0" max="100" value={volume} onChange={e => setVolume(Number(e.target.value))} /><button className="music-play" aria-label={playing ? "Pause music" : "Play music"} onClick={() => playing ? stop() : start()}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button></div><small>Original, procedurally composed soundscapes</small>{error && <p role="alert" className="form-error">{error}</p>}</div>;
}

export default function Cinema() {
  const [view, setView] = useState<View>("discover"), [genre, setGenre] = useState("All movies"), [query, setQuery] = useState(""), [search, setSearch] = useState(""), [country, setCountry] = useState("US");
  const [movies, setMovies] = useState<Movie[]>(FALLBACK_MOVIES), [saved, setSaved] = useState<Movie[]>([]), [user, setUser] = useState<Account | null>(null), [loading, setLoading] = useState(true), [live, setLive] = useState(false), [source, setSource] = useState("Curated collection"), [notice, setNotice] = useState(""), [refresh, setRefresh] = useState(0), [updated, setUpdated] = useState("");
  const [heroIndex, setHeroIndex] = useState(0), [selected, setSelected] = useState<Movie | null>(null), [trailer, setTrailer] = useState(false), [detailLoading, setDetailLoading] = useState(false), [auth, setAuth] = useState<AuthMode | null>(null), [authBusy, setAuthBusy] = useState(false), [authError, setAuthError] = useState(""), [authMessage, setAuthMessage] = useState(""), [showPassword, setShowPassword] = useState(false), [resetToken, setResetToken] = useState("");
  const [toast, setToast] = useState(""), [mobileNav, setMobileNav] = useState(false), [music, setMusic] = useState(false), [sort, setSort] = useState("recommended"), [saving, setSaving] = useState<string[]>([]), [visibleCount, setVisibleCount] = useState(12);
  const searchRef = useRef<HTMLInputElement>(null), gridRef = useRef<HTMLElement>(null), toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null), detailRequest = useRef(0);
  const heroes = HERO_IDS.map(key => FALLBACK_MOVIES.find(movie => movie.title.toLowerCase().includes(key)) || FALLBACK_MOVIES[0]);
  const hero = heroes[heroIndex];
  const notify = useCallback((message: string) => { setToast(message); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 4200); }, []);
  const closeDetails = useCallback(() => { detailRequest.current++; setSelected(null); setTrailer(false); }, []);
  const closeAuth = useCallback(() => { setAuth(null); setAuthError(""); setAuthMessage(""); }, []);
  function openAuth(mode: AuthMode) { setAuth(mode); setAuthError(""); setAuthMessage(""); setShowPassword(false); }
  useEffect(() => { const timer = setTimeout(() => setSearch(query.trim()), 400); return () => clearTimeout(timer); }, [query]);
  useEffect(() => { setVisibleCount(12); }, [view, genre, search, country]);
  useEffect(() => {
    void api("/api/auth/me").then(async data => { setUser(data.user); if (data.user) { const list = await api("/api/watchlist"); setSaved(list.movies); } }).catch(() => {});
    const token = new URLSearchParams(window.location.search).get("reset_token") || new URLSearchParams(window.location.search).get("reset");
    if (token) { setResetToken(token); setAuth("reset-password"); window.history.replaceState({}, "", window.location.pathname); }
    function onKey(e: KeyboardEvent) { if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); searchRef.current?.focus(); } }
    document.addEventListener("keydown", onKey); return () => { document.removeEventListener("keydown", onKey); if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);
  useEffect(() => { const id = setInterval(() => { if (document.visibilityState === "visible") setRefresh(n => n + 1); }, 600000); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (view === "watchlist") { setLoading(false); return; }
    const controller = new AbortController(); setLoading(true);
    const params = new URLSearchParams({ category: view === "discover" ? "trending" : view, country });
    if (genre !== "All movies") params.set("genre", genre);
    if (search) params.set("q", search);
    fetch(`/api/movies?${params}`, { signal: controller.signal }).then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<MovieCatalog>; }).then(data => { setMovies(data.movies); setLive(data.live); setSource(data.source); setNotice(data.notice || ""); setUpdated(data.updatedAt || ""); }).catch(error => { if (error.name !== "AbortError") { setMovies((view === "upcoming" ? [] : FALLBACK_MOVIES).filter(m => (!search || m.title.toLowerCase().includes(search.toLowerCase())) && (genre === "All movies" || m.genres.includes(genre === "Sci-Fi" ? "Science Fiction" : genre)))); setLive(false); setSource("Curated collection"); setNotice("Live discovery is temporarily unavailable. Explore our curated collection."); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [view, genre, country, search, refresh]);
  async function openMovie(movie: Movie, play = false) {
    const requestId = ++detailRequest.current; setSelected(movie); setTrailer(play); setDetailLoading(true);
    try { const data = await api(`/api/movies/${encodeURIComponent(movie.id)}`); if (requestId === detailRequest.current) setSelected(data.movie || movie); } catch { /* The catalog details remain available. */ } finally { if (requestId === detailRequest.current) setDetailLoading(false); }
  }
  async function toggleSave(movie: Movie) {
    if (!user) { closeDetails(); openAuth("login"); return; }
    if (saving.includes(movie.id)) return;
    const exists = saved.some(m => m.id === movie.id); setSaving(ids => [...ids, movie.id]);
    try { await api(`/api/watchlist${exists ? `?id=${encodeURIComponent(movie.id)}` : ""}`, { method: exists ? "DELETE" : "PUT", ...(exists ? {} : { body: JSON.stringify({ movie }) }) }); setSaved(items => exists ? items.filter(m => m.id !== movie.id) : [...items, movie]); notify(exists ? "Removed from your watchlist" : "Added to your next movie night"); } catch (error) { notify((error as Error).message); } finally { setSaving(ids => ids.filter(id => id !== movie.id)); }
  }
  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!auth) return; setAuthBusy(true); setAuthError(""); setAuthMessage("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    if (auth === "reset-password") payload.token = resetToken;
    try { const data = await api(`/api/auth/${auth}`, { method: "POST", body: JSON.stringify(payload) });
      if (auth === "forgot-password") setAuthMessage(data.message || "If an account exists, a reset link is on its way. Check your inbox.");
      else if (auth === "reset-password") { setResetToken(""); setAuth("login"); setAuthMessage("Password updated. Sign in with your new password."); }
      else { setUser(data.user); closeAuth(); notify(auth === "register" ? "Welcome to FRAME. Your next obsession awaits." : "Welcome back to FRAME"); const list = await api("/api/watchlist"); setSaved(list.movies); }
    } catch (error) { setAuthError((error as Error).message); } finally { setAuthBusy(false); }
  }
  async function logout() { try { await api("/api/auth/logout", { method: "POST", body: "{}" }); setUser(null); setSaved([]); window.location.assign("/signout-with-chatgpt?return_to=%2F"); } catch (error) { notify((error as Error).message); } }
  function navigate(next: View) { setView(next); setGenre("All movies"); setQuery(""); setMobileNav(false); }
  function chooseGenre(next: string) { setGenre(next); if (view === "watchlist") setView("discover"); requestAnimationFrame(() => gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); }
  const preferredGenres = saved.reduce<Record<string, number>>((scores, movie) => { movie.genres.forEach(g => { scores[g] = (scores[g] || 0) + 1; }); return scores; }, {});
  const tasteScore = (movie: Movie) => movie.genres.reduce((total, g) => total + (preferredGenres[g] || 0), 0) - (saved.some(m => m.id === movie.id) ? 100 : 0);
  const shown = [...(view === "watchlist" ? saved.filter(m => (!search || m.title.toLowerCase().includes(search.toLowerCase())) && (genre === "All movies" || m.genres.includes(genre === "Sci-Fi" ? "Science Fiction" : genre))) : movies)].sort((a, b) => sort === "rating" ? (b.rating || 0) - (a.rating || 0) : sort === "newest" ? b.releaseDate.localeCompare(a.releaseDate) : sort === "title" ? a.title.localeCompare(b.title) : view === "discover" && saved.length ? tasteScore(b) - tasteScore(a) : 0);
  const gridTitle = search ? `Results for “${search}”` : view === "watchlist" ? "Your kind of cinema." : genre !== "All movies" ? `${genre}. Your way.` : view === "latest" ? live && source === "TMDB" ? "Fresh off the big screen." : live ? "New to your radar." : "From the collection." : view === "upcoming" ? "The next big things." : view === "top-rated" ? live && source === "TMDB" ? "Worth every minute." : live ? "On the charts." : "From the collection." : saved.length ? "More your kind of movie." : "In the spotlight";
  const authTitles: Record<AuthMode, string> = { login: "Welcome to your next obsession.", register: "Great stories start here.", "forgot-password": "Let’s get you back in.", "reset-password": "A fresh start." };
  let trailerUrl = "", directVideo = false;
  if (selected?.trailer) { try { const url = new URL(selected.trailer); if (["youtube.com", "www.youtube.com", "youtu.be", "www.youtube-nocookie.com"].includes(url.hostname)) { const id = url.hostname === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v") || url.pathname.split("/").pop(); if (id && /^[\w-]{11}$/.test(id)) trailerUrl = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`; } else if (url.protocol === "https:" && /\.(mp4|m4v|mov)(\?|$)/i.test(selected.trailer)) { trailerUrl = selected.trailer; directVideo = true; } } catch {} }

  return <div className="app-shell">
    {mobileNav && <button className="mobile-shade" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <a className="brand" href="/" aria-label="FRAME home"><span className="brand-icon"><Clapperboard size={23} strokeWidth={1.8} /></span>FRAME<span className="brand-dot">.</span></a>
      <div className="sidebar-section-label">YOUR CINEMA, CURATED</div>
      <nav aria-label="Main navigation">
        {([{ id: "discover", icon: Compass }, { id: "trending", icon: Flame }, { id: "latest", icon: Clapperboard }, { id: "upcoming", icon: Film }, { id: "top-rated", icon: Star }] as const).map(({ id, icon: Icon }) => <button key={id} className={`nav-item ${view === id ? "active" : ""}`} onClick={() => navigate(id)}><Icon size={18} /><span>{VIEW_LABELS[id]}</span>{id === "latest" && <span className="nav-new">NEW</span>}{view === id && <span className="nav-active-dot" />}</button>)}
      </nav>
      <div className="sidebar-section-label library-label">YOUR CORNER</div>
      <button className={`nav-item ${view === "watchlist" ? "active" : ""}`} onClick={() => navigate("watchlist")}><Bookmark size={18} /><span>My watchlist</span><span className="count-badge">{saved.length}</span></button>
      <button className={`nav-item ${music ? "music-active" : ""}`} onClick={() => { setMusic(!music); setMobileNav(false); }}><Headphones size={18} /><span>Music lounge</span><span className="tiny-bars"><i /><i /><i /></span></button>
      <div className="sidebar-spacer" />
      <div className="sidebar-note"><div className="note-orbit"><Sparkles size={19} /></div><h4>Less scrolling.<br />More <em>“that’s the one.”</em></h4><p>Your next favorite is<br />just a frame away.</p></div>
      <div className="sidebar-bottom">{user ? <><div className="user-avatar">{user.name.charAt(0).toUpperCase()}</div><div className="user-info"><strong>{user.name}</strong><span>Your front-row seat</span></div><button className="icon-btn" aria-label="Sign out" onClick={logout}><LogOut size={16} /></button></> : <><div className="guest-avatar"><Film size={19} /></div><div className="user-info"><strong>Your front-row seat</strong><button onClick={() => openAuth("login")}>Sign in to make it yours <ArrowRight size={11} /></button></div></>}</div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="topbar-left"><button className="icon-btn mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={22} /></button><span className="page-breadcrumb">Explore <ChevronRight size={13} /><strong>{VIEW_LABELS[view]}</strong></span></div><div className="topbar-right"><label className="search-box"><Search size={17} /><input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Find your next favorite" aria-label="Search movies" />{query ? <button aria-label="Clear search" onClick={() => setQuery("")}><X size={14} /></button> : <kbd>⌘ K</kbd>}</label><label className="country-select"><Globe2 size={15} /><select aria-label="Movie region" value={country} onChange={e => setCountry(e.target.value)}><option value="US">US</option><option value="IN">IN</option><option value="GB">UK</option><option value="CA">CA</option><option value="AU">AU</option></select></label><div className="topbar-divider" />{user ? <button className="top-avatar" aria-label={`Signed in as ${user.name}. Click to view watchlist`} onClick={() => navigate("watchlist")}>{user.name.charAt(0).toUpperCase()}</button> : <button className="signin-button" onClick={() => openAuth("login")}>Sign in <ArrowRight size={14} /></button>}</div></header>

      <main className="content">
        <section className="welcome"><div><div className="eyebrow welcome-eyebrow"><span className="little-line" /> FOR THE LOVE OF CINEMA</div><h1>Your next <span>obsession.</span></h1><p>A little less searching. A lot more <span>“just one more scene.”</span></p></div><button className="taste-button" onClick={() => { if (shown.length) { const pick = shown[Math.floor(Math.random() * shown.length)]; void openMovie(pick); } else notify("Try a different genre to find your next movie."); }}><Sparkles size={17} /><span>Find my movie</span><ArrowRight size={16} /></button></section>

        {view === "discover" && !search && <section className="feature-grid" aria-label="Featured movies and mood recommendations"><div className="hero" key={hero.id}>
          <img className="hero-image" src={hero.backdrop || hero.poster} alt="" fetchPriority="high" onError={e => { const target = e.currentTarget; if (!target.dataset.fallback) { target.dataset.fallback = "true"; target.src = hero.poster; } }} /><div className="hero-overlay" /><div className="film-grain" />
          <div className="hero-top"><span className="feature-tag"><span /> THE FRAME PICK</span><span className="editorial-label">EDITOR’S COLLECTION</span></div>
          <div className="hero-content"><div className="hero-mini-meta"><span>{hero.genres.slice(0, 2).join(" · ")}</span><b>•</b>{hero.year}<b>•</b>{hero.duration ? `${Math.floor(hero.duration / 60)}h ${hero.duration % 60}m` : "Feature film"}</div><h2 className={heroIndex === 0 ? "dune-title" : ""}>{heroIndex === 0 ? <>DUNE<span>PART TWO</span></> : hero.title}</h2><p>{heroIndex === 0 ? "Beyond fear. Beyond destiny. Some stories are made to be felt on a different scale." : hero.overview.slice(0, 135) + "…"}</p><div className="hero-actions"><button className="button-primary" onClick={() => { void openMovie(hero, true); }}><Play size={15} fill="currentColor" /> Watch trailer</button><button className={`button-glass ${saved.some(m => m.id === hero.id) ? "saved" : ""}`} onClick={() => { void toggleSave(hero); }}>{saved.some(m => m.id === hero.id) ? <Check size={16} /> : <Plus size={17} />}<span>Watchlist</span></button><button className="hero-info" onClick={() => { void openMovie(hero); }}>More info <ArrowRight size={14} /></button></div></div>
          <div className="hero-pagination"><div className="hero-dots">{heroes.map((m, i) => <button key={m.id} aria-label={`Feature ${m.title}`} aria-pressed={i === heroIndex} className={i === heroIndex ? "active" : ""} onClick={() => setHeroIndex(i)} />)}</div><div className="hero-page-numbers"><strong>0{heroIndex + 1}</strong><span>/ 03</span><button className="hero-arrow" aria-label="Previous feature" onClick={() => setHeroIndex((heroIndex + 2) % 3)}><ChevronLeft size={15} /></button><button className="hero-arrow" aria-label="Next feature" onClick={() => setHeroIndex((heroIndex + 1) % 3)}><ChevronRight size={15} /></button></div></div>
        </div><div className="mood-card"><div className="mood-card-top"><span className="eyebrow"><Sparkles size={14} /> A LITTLE MOVIE MAGIC</span><span className="mood-plus">✧</span></div><h2>What’s the<br /><em>mood?</em></h2><p>There’s a perfect movie<br />for the way you feel.</p><div className="mood-options">{MOODS.map(item => <button key={item.genre} onClick={() => chooseGenre(item.genre)}><span>{item.icon}</span>{item.label}<ChevronRight size={13} /></button>)}</div><button className="surprise-button" onClick={() => { void openMovie(FALLBACK_MOVIES[Math.floor(Math.random() * FALLBACK_MOVIES.length)]); }}><Shuffle size={15} /> Surprise me <ArrowRight size={15} /></button><span className="mood-decoration">✳</span></div></section>}

        <section className="movie-section" ref={gridRef}><div className="genre-line"><div className="genre-tabs" role="group" aria-label="Filter movies by genre">{GENRES.map(g => <button key={g} className={genre === g ? "selected" : ""} aria-pressed={genre === g} onClick={() => setGenre(g)}>{g === "All movies" && <Compass size={14} />}{g}</button>)}</div></div>
          <div className="section-heading"><div><div className="section-kicker">{view === "watchlist" ? "SAVED FOR A GOOD NIGHT" : genre !== "All movies" ? "PICKED FOR YOUR TASTE" : "THE CONVERSATION STARTS HERE"}</div><h2>{view === "watchlist" ? <Bookmark size={23} /> : <Flame size={23} className="flame-icon" />}{gridTitle}<span className="heading-dot" /></h2><p>{view === "watchlist" ? "The ones you’re coming back for. All in one place." : search ? `${shown.length} movies to explore` : "Big stories. Beautiful worlds. Your next favorite, waiting to happen."}</p></div><div className="section-controls"><button className={`data-status ${live ? "is-live" : ""}`} title={`${source}${updated ? ` · Updated ${new Date(updated).toLocaleString()}` : ""}. Click to refresh.`} onClick={() => setRefresh(n => n + 1)} disabled={loading}>{loading ? <LoaderCircle size={12} className="spin" /> : <span />}{loading ? "Finding films" : live ? "Live discovery" : "Curated picks"}</button><label className="sort-select"><SlidersHorizontal size={14} /><select aria-label="Sort movies" value={sort} onChange={e => setSort(e.target.value)}><option value="recommended">For you</option><option value="newest">Newest first</option><option value="rating">Top rated</option><option value="title">A to Z</option></select></label></div></div>
          {view !== "watchlist" && notice && <p className="source-notice"><span />{notice}</p>}
          {loading && shown.length === 0 ? <div className="loading-state"><LoaderCircle size={26} className="spin" /><p>Finding your next great watch…</p></div> : shown.length ? <div className={`movie-grid ${loading ? "grid-loading" : ""}`}>{shown.slice(0, visibleCount).map((movie, index) => <MovieCard key={movie.id} movie={movie} index={index} saved={saved.some(m => m.id === movie.id)} onOpen={() => { void openMovie(movie); }} onSave={() => { void toggleSave(movie); }} />)}</div> : <div className="empty-state">{view === "watchlist" ? <Bookmark size={34} /> : <Search size={34} />}<h3>{view === "watchlist" ? "A great movie night starts with a list." : "No films in this frame."}</h3><p>{view === "watchlist" ? user ? "Tap + on any movie to save it here." : "Sign in to collect the films you can’t wait to see." : "Try another genre or a different movie title."}</p><button className="button-primary" onClick={() => { if (view === "watchlist" && !user) openAuth("login"); else { navigate("discover"); setGenre("All movies"); } }}>{view === "watchlist" && !user ? "Sign in" : "Explore movies"}<ArrowRight size={15} /></button></div>}
          {shown.length > visibleCount && <div className="load-more"><button className="button-secondary" onClick={() => setVisibleCount(count => count + 12)}>A few more for your list <Plus size={14} /></button><span>Showing {Math.min(visibleCount, shown.length)} of {shown.length} films</span></div>}
        </section>

        {view !== "watchlist" && !search && <section className="collection-section"><div className="section-heading"><div><div className="section-kicker">TAKE THE SCENIC ROUTE</div><h2>A world for every mood<span className="heading-dot" /></h2></div><span className="collection-hint">Go where the story takes you <ArrowDown size={14} /></span></div><div className="collection-grid">{[{ genre: "Sci-Fi", title: "Out of this world", sub: "For the beautifully curious", image: heroes[1]?.backdrop, class: "space" }, { genre: "Action", title: "Feel every second", sub: "Big screens. Bigger adrenaline.", image: FALLBACK_MOVIES.find(m => m.title.includes("Batman"))?.backdrop, class: "action" }, { genre: "Romance", title: "All the feels", sub: "Stories that stay with you", image: FALLBACK_MOVIES.find(m => m.genres.includes("Romance"))?.backdrop, class: "romance" }].map(collection => <button className={`collection-card ${collection.class}`} key={collection.genre} onClick={() => chooseGenre(collection.genre)}>{collection.image && <img src={collection.image} alt="" loading="lazy" />}<span className="collection-overlay" /><span className="collection-caption"><small>{collection.genre.toUpperCase()}</small><strong>{collection.title}</strong><span>{collection.sub}</span></span><span className="collection-arrow"><ArrowRight size={18} /></span></button>)}</div></section>}
        <footer className="footer"><a className="footer-brand" href="/">FRAME<span>.</span></a><p>Made for the love of cinema. <Heart size={11} /></p><span>{view === "watchlist" ? "Your personal collection" : source} · Posters & film data belong to their respective owners</span></footer><div className="provider-credits"><a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" aria-label="The Movie Database"><img src="/tmdb.svg" alt="TMDB" width="48" height="7" /></a><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p><a href="https://www.dneg.com/show/dune-part-two/" target="_blank" rel="noopener noreferrer">Featured Dune: Part Two imagery · DNEG</a></div>
      </main>
    </div>

    <button className={`music-fab ${music ? "open" : ""}`} aria-label={music ? "Close music lounge" : "Open music lounge"} onClick={() => setMusic(!music)}><Headphones size={19} /><span>Set the mood</span><span className="tiny-bars"><i /><i /><i /></span></button>{music && <MusicLounge onClose={() => setMusic(false)} />}
    {toast && <div className="toast" role="status"><Check size={17} />{toast}<button aria-label="Dismiss notification" onClick={() => setToast("")}><X size={14} /></button></div>}

    {selected && <Modal label={selected.title} onClose={closeDetails} wide><div className="detail-visual">{trailer && trailerUrl ? directVideo ? <video src={trailerUrl} controls autoPlay playsInline onError={() => notify("The preview could not load. Try opening it from the movie provider.")} /> : <iframe src={trailerUrl} title={`${selected.title} official trailer`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <><img src={selected.backdrop || selected.poster} alt="" /><div className="detail-visual-overlay" />{!trailer && <button className="detail-play" onClick={() => setTrailer(true)} aria-label={`Play ${selected.title} trailer`}><Play fill="currentColor" size={28} /></button>}{trailer && !trailerUrl && <div className="trailer-unavailable"><Film size={30} /><strong>{detailLoading ? "Finding the trailer…" : "A trailer isn’t available for this title."}</strong><p>You can still explore the story below.</p></div>}</>}</div><div className="detail-content"><div className="eyebrow">YOUR NEXT MOVIE NIGHT</div><h2>{selected.title}</h2><div className="detail-meta"><span>{selected.year}</span>{selected.duration && <span>{Math.floor(selected.duration / 60)}h {selected.duration % 60}m</span>}{selected.rating != null && selected.rating > 0 && <span className="detail-rating"><Star size={14} fill="currentColor" /> {selected.rating.toFixed(1)} / 10</span>}<span>{selected.language || ""}</span></div><div className="detail-genres">{selected.genres.map(g => <button key={g} onClick={() => { closeDetails(); chooseGenre(g); }}>{g}</button>)}</div><p className="detail-overview">{selected.overview || "A new story waiting to be discovered. More details will be available from the movie provider."}</p><div className="detail-actions"><button className="button-primary" disabled={saving.includes(selected.id)} onClick={() => { void toggleSave(selected); }}>{saving.includes(selected.id) ? <LoaderCircle size={17} className="spin" /> : saved.some(m => m.id === selected.id) ? <Check size={17} /> : <Plus size={17} />}{saved.some(m => m.id === selected.id) ? "In your watchlist" : "Add to watchlist"}</button>{!trailer && <button className="button-secondary" onClick={() => setTrailer(true)}><Play size={15} />Watch trailer</button>}</div><small className="detail-source">{selected.source || "FRAME curated collection"} · Availability and release dates vary by region.</small>{selected.source === "Apple iTunes" && <div className="apple-credit">{selected.storeUrl && <a className="button-secondary" href={selected.storeUrl} target="_blank" rel="noopener noreferrer">View on Apple TV <ArrowRight size={13} /></a>}<span>Previews provided courtesy of iTunes.</span></div>}</div></Modal>}

    {auth && <Modal label={authTitles[auth]} onClose={closeAuth}><div className="auth-art"><span className="auth-brand"><Clapperboard size={19} /> FRAME.</span><div className="auth-art-lines" /><Sparkles size={38} /><span>YOUR FRONT-ROW SEAT TO GREAT STORIES</span></div><div className="auth-content"><div className="eyebrow">{auth === "register" ? "BECOME A MOVIE PERSON" : auth.includes("password") ? "ACCOUNT RECOVERY" : "THE GOOD PART STARTS HERE"}</div><h2>{authTitles[auth]}</h2><p>{auth === "login" ? "Sign in to save your favorites and make movie night yours." : auth === "register" ? "Save the films you love. Discover the ones you will." : auth === "forgot-password" ? "Enter your account email. We’ll send a secure link to reset your password." : "Choose a strong new password for your FRAME account."}</p>
      <form onSubmit={submitAuth}>{auth === "register" && <label className="form-label">Your name<input name="name" autoComplete="name" placeholder="How should we call you?" required minLength={2} maxLength={80} /></label>}{auth !== "reset-password" && <label className="form-label">Email address<input type="email" name="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} /></label>}{auth !== "forgot-password" && <label className="form-label">{auth === "reset-password" ? "New password" : "Password"}<span className="password-field"><input name="password" type={showPassword ? "text" : "password"} autoComplete={auth === "login" ? "current-password" : "new-password"} placeholder={auth === "login" ? "Your password" : "At least 10 characters"} minLength={auth === "login" ? 1 : 10} maxLength={128} required /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>}{auth === "login" && <button className="forgot-link" type="button" onClick={() => openAuth("forgot-password")}>Forgot password?</button>}{authError && <p className="form-error" role="alert">{authError}</p>}{authMessage && <p className="form-success" role="status">{authMessage}</p>}<button type="submit" className="button-primary auth-submit" disabled={authBusy}>{authBusy ? <LoaderCircle size={17} className="spin" /> : auth === "login" ? "Sign in" : auth === "register" ? "Create your account" : auth === "forgot-password" ? "Send reset link" : "Update password"}{!authBusy && <ArrowRight size={16} />}</button></form>
      {(auth === "login" || auth === "register") && <><div className="auth-or"><span />or take the shortcut<span /></div><a className="chatgpt-signin" href="/signin-with-chatgpt?return_to=%2F" target="_top"><Sparkles size={17} /> Continue with ChatGPT</a><p className="auth-switch">{auth === "login" ? "New to the picture?" : "Already part of the story?"} <button onClick={() => openAuth(auth === "login" ? "register" : "login")}>{auth === "login" ? "Create an account" : "Sign in"}</button></p></>}{auth.includes("password") && <button className="back-login" onClick={() => openAuth("login")}><ChevronLeft size={14} /> Back to sign in</button>}</div></Modal>}
  </div>;
}


