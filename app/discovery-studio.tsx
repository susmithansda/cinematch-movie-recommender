"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Check, Clock3, Compass, Download, Film, LoaderCircle, Plus, RefreshCw, Ticket } from "lucide-react";
import type { Movie } from "../lib/movies";
import type { DiaryEntry } from "../lib/diary-types";
import { canonicalMovieKey } from "../lib/movie-night";
import { buildTasteCompass, buildFilmFestival, createFestivalCalendar, type DiscoveryIndustry, type TasteLane, type FestivalTheme } from "../lib/discovery";

type Festival = NonNullable<ReturnType<typeof buildFilmFestival>>;
type Profile = ReturnType<typeof buildTasteCompass>["profile"];
type Props = {
  feature: "compass" | "festival";
  catalog: Movie[];
  diary: DiaryEntry[];
  saved: Movie[];
  industry: DiscoveryIndustry;
  authenticated: boolean;
  diaryLoading: boolean;
  diaryError: string;
  onRetryDiary: () => void;
  onOpen: (movie: Movie) => void;
  onSave: (movie: Movie) => void;
  onPassport: () => void;
};
const minutes = (value: number) => `${Math.floor(value / 60)}h${value % 60 ? ` ${value % 60}m` : ""}`;
const language = (movie: Movie) => movie.originalLanguage === "bn" ? "Bengali" : movie.originalLanguage === "hi" ? "Hindi" : movie.originalLanguage === "en" ? "English" : movie.language || "Not provided";
const CINEMAS = [{ value: "all", label: "All cinema" }, { value: "hollywood", label: "Hollywood / English" }, { value: "bollywood", label: "Bollywood / Hindi" }, { value: "bengali", label: "Bengali / বাংলা" }] as const;

function Cover({ movie }: { movie: Movie }) {
  const [failed, setFailed] = useState(false);
  return failed || !movie.poster ? <span className="studio-cover-fallback"><Film size={20} /></span> : <img src={movie.poster} alt={`${movie.title} poster`} onError={() => setFailed(true)} loading="lazy" />;
}

function CompassDrawing({ profile, coldStart }: { profile: Profile; coldStart: boolean }) {
  const genres = profile.topGenres.filter(genre => genre.weight > 0).slice(0, 6);
  const count = Math.max(3, genres.length), maximum = Math.max(1, ...genres.map(item => Math.max(0, item.weight)));
  const point = (index: number, radius: number) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
    return [160 + Math.cos(angle) * radius, 145 + Math.sin(angle) * radius];
  };
  const polygon = (radius: number) => Array.from({ length: count }, (_, index) => point(index, radius).join(",")).join(" ");
  const profilePoints = Array.from({ length: count }, (_, index) => point(index, genres[index] ? Math.max(0, genres[index].weight) / maximum * 88 : 0).join(",")).join(" ");
  return <svg className="taste-compass-drawing" viewBox="0 0 320 290" role="img" aria-label={coldStart ? "Your taste compass is waiting for your ratings" : `Relative genre preferences: ${genres.map(item => `${item.genre}, ${item.count} films`).join("; ")}`}>
    <circle cx="160" cy="145" r="104" className="compass-outer-ring" />
    {[24, 48, 72, 88].map(radius => <polygon key={radius} points={polygon(radius)} className="compass-grid" />)}
    {Array.from({ length: count }, (_, index) => <line key={index} x1="160" y1="145" x2={point(index, 96)[0]} y2={point(index, 96)[1]} className="compass-axis" />)}
    {!coldStart && genres.length > 0 && <polygon points={profilePoints} className="compass-profile-shape" />}
    {!coldStart && genres.map((item, index) => <g key={item.genre}><circle cx={point(index, Math.max(0, item.weight) / maximum * 88)[0]} cy={point(index, Math.max(0, item.weight) / maximum * 88)[1]} r="3" className="compass-profile-point" /><text x={point(index, 119)[0]} y={point(index, 119)[1]} textAnchor="middle" dominantBaseline="middle">{item.genre}</text></g>)}
    {(coldStart || !genres.length) && <g><path d="m160 103 12 42-12 42-12-42Z" className="compass-needle" /><circle cx="160" cy="145" r="4" className="compass-profile-point" /><text x="160" y="30" textAnchor="middle">YOUR NEXT DIRECTION</text><text x="160" y="271" textAnchor="middle">RATE A FILM YOU LOVE</text></g>}
  </svg>;
}

function TasteCompass(props: Props) {
  const [lane, setLane] = useState<TasteLane>(props.industry === "all" || props.industry === "bengali" ? "bridge" : "comfort"), [industry, setIndustry] = useState<DiscoveryIndustry>(props.industry);
  const result = useMemo(() => buildTasteCompass(props.catalog, props.diary, props.saved, { industry, lane, limit: 6 }), [props.catalog, props.diary, props.saved, industry, lane]);
  const historyUnavailable = props.authenticated && (props.diaryLoading || Boolean(props.diaryError));
  return <div className="taste-compass-experience">
    {historyUnavailable ? <div className="club-empty">{props.diaryLoading ? <LoaderCircle className="spin" size={25} /> : <Compass size={27} />}<h3>{props.diaryLoading ? "Finding your direction…" : "Your diary couldn’t be opened."}</h3>{props.diaryError && <><p>{props.diaryError}</p><button className="button-secondary" onClick={props.onRetryDiary}><RefreshCw size={13} />Try again</button></>}</div> : <>
      <div className="compass-profile-panel"><div className="compass-chart"><CompassDrawing profile={result.profile} coldStart={result.coldStart} /></div><div className="compass-profile-copy"><span className="club-kicker">YOUR TASTE HAS A DIRECTION</span><h3>{result.coldStart ? <>Every great journey<br /><em>starts with one film.</em></> : <>A little familiar.<br /><em>A little undiscovered.</em></>}</h3><p>{result.coldStart ? "These are curated starting points. Rate films in your passport or save a few favorites, and the compass will begin to reflect your taste." : "Your diary ratings and watchlist shape these genre preferences. Comfort follows what you love; Adventure takes a different route."}</p><div className="compass-counts" data-testid="taste-profile"><span><strong>{result.profile.ratedFilms}</strong>rated films</span><span><strong>{result.profile.watchedFilms}</strong>logged films</span><span><strong>{result.profile.exploredLanguages.length}</strong>languages explored</span></div>{result.coldStart && <p className="compass-cold-start" data-testid="compass-cold-start">A curated starting point, ready to become yours.</p>}<button className="text-link" onClick={props.onPassport}>Open my cinema passport <ArrowRight size={14} /></button></div></div>
      <div className="compass-controls"><label>Choose a direction<select name="tasteLane" value={lane} onChange={event => setLane(event.target.value as TasteLane)}><option value="comfort">Comfort · more of what I love</option><option value="adventure">Adventure · surprise my taste</option><option value="bridge">Bridge · familiar genres, new worlds</option></select></label><label>Explore a film world<select name="tasteIndustry" value={industry} onChange={event => setIndustry(event.target.value as DiscoveryIndustry)}>{CINEMAS.map(cinema => <option value={cinema.value} key={cinema.value}>{cinema.label}</option>)}</select></label></div>
      <div className="studio-section-heading"><div><span className="club-kicker">{lane === "bridge" && (industry === "all" || industry === "bengali") ? "A BRIDGE TO BENGALI CINEMA" : lane === "adventure" ? "TAKE THE ROAD LESS WATCHED" : "SOMETHING IN YOUR ORBIT"}</span><h3>{lane === "bridge" ? "A new world. A familiar feeling." : lane === "adventure" ? "Try a different direction." : "Your kind of film, next."}</h3></div><span>{result.suggestions.length} films to explore</span></div>
      {result.suggestions.length ? <div className="compass-film-grid">{result.suggestions.map(suggestion => { const saved = props.saved.find(movie => canonicalMovieKey(movie) === canonicalMovieKey(suggestion.movie)); return <article className="discovery-film" key={canonicalMovieKey(suggestion.movie)} data-testid="compass-result" data-language={suggestion.movie.originalLanguage} data-movie-key={canonicalMovieKey(suggestion.movie)}><button className="discovery-film-cover" aria-label={`Explore ${suggestion.movie.title}`} onClick={() => props.onOpen(suggestion.movie)}><Cover movie={suggestion.movie} /><span>{language(suggestion.movie)}</span></button><div className="discovery-film-copy"><button onClick={() => props.onOpen(suggestion.movie)}>{suggestion.movie.title}</button><small>{suggestion.movie.year} · {suggestion.movie.duration ? minutes(suggestion.movie.duration) : language(suggestion.movie)}</small><ul>{suggestion.reasons.map(reason => <li key={reason}><Check size={11} />{reason}</li>)}</ul><button className="studio-save" aria-pressed={Boolean(saved)} onClick={() => props.onSave(saved || suggestion.movie)}>{saved ? <Check size={13} /> : <Plus size={13} />}{saved ? "On my watchlist" : "Save for later"}</button></div></article>; })}</div> : <div className="club-empty"><Compass size={28} /><h3>No new direction in this frame.</h3><p>Try another cinema or lane. Your logged films stay out of the suggestions.</p></div>}
      <p className="club-fine-print">The compass uses genres, your personal ratings, and saved films. It excludes films you’ve logged and explains each match without inventing confidence scores.</p>
    </>}
  </div>;
}

const THEMES: { value: FestivalTheme; title: string; note: string }[] = [
  { value: "bengal-stories", title: "The Bengal edit", note: "Three Bengali originals. A world of stories." },
  { value: "world-tour", title: "Three worlds", note: "One Bengali, one Hindi, one English original." },
  { value: "mystery-evening", title: "A little after midnight", note: "Mystery, crime, and edge-of-seat cinema." },
  { value: "feel-good", title: "The good company club", note: "Comedy, family, animation, and music." },
];

function startTimeDefault() {
  const date = new Date(), now = new Date(); date.setHours(16, 0, 0, 0); if (date <= now) date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T16:00`;
}

function FestivalStudio(props: Props) {
  const [theme, setTheme] = useState<FestivalTheme>("bengal-stories"), [budget, setBudget] = useState(480), [excludeWatched, setExcludeWatched] = useState(true), [startTime, setStartTime] = useState(startTimeDefault), [programme, setProgramme] = useState<{ source: string; plan: Festival | null } | null>(null), [error, setError] = useState("");
  const selectedTheme = THEMES.find(item => item.value === theme)!;
  const historyUnavailable = props.authenticated && excludeWatched && (props.diaryLoading || Boolean(props.diaryError));
  const source = JSON.stringify({ member: props.authenticated, watched: excludeWatched ? props.diary.map(entry => canonicalMovieKey(entry.movie)).sort() : [], catalog: props.catalog.map(movie => [canonicalMovieKey(movie), movie.duration, movie.originalLanguage, movie.industry, movie.genres]) });
  const currentProgramme = !historyUnavailable && programme?.source === source ? programme : null;
  const plan = currentProgramme?.plan || null, generated = Boolean(currentProgramme);
  function reset() { setProgramme(null); setError(""); }
  function generate(event: FormEvent) { event.preventDefault(); if (historyUnavailable) return; setError(""); setProgramme({ source, plan: buildFilmFestival(props.catalog, { theme, maxMinutes: budget, count: 3, excludeWatched }, props.diary.map(entry => canonicalMovieKey(entry.movie))) }); }
  function exportCalendar() {
    if (!plan) return;
    try { const start = new Date(startTime); if (!startTime || !Number.isFinite(start.getTime()) || start.getTime() < Date.now() - 60000) throw new Error("Choose a future start time for your festival."); const content = createFestivalCalendar(plan, start, { generatedAt: new Date(), uid: crypto.randomUUID() }); const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "frame-film-festival.ics"; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); setError(""); } catch (cause) { setError((cause as Error).message); }
  }
  return <div className="festival-experience"><form className="festival-form" onSubmit={generate}><div className="festival-form-top"><label>The programme<select name="festivalTheme" value={theme} onChange={event => { setTheme(event.target.value as FestivalTheme); reset(); }}>{THEMES.map(item => <option value={item.value} key={item.value}>{item.title}</option>)}</select></label><div><span className="club-kicker">THREE FILMS. YOUR OWN FRONT ROW.</span><p>{selectedTheme.note}</p></div></div><div className="planner-budget"><div><label htmlFor="festival-budget">Time for your festival</label><output htmlFor="festival-budget">{minutes(budget)}</output></div><input id="festival-budget" name="festivalBudget" type="range" min="180" max="600" step="15" value={budget} onChange={event => { setBudget(Number(event.target.value)); reset(); }} /><div className="budget-scale"><span>A long afternoon</span><span>Make a day of it</span></div></div><div className="festival-form-bottom"><label><input name="festivalExcludeWatched" type="checkbox" checked={excludeWatched} onChange={event => { setExcludeWatched(event.target.checked); reset(); }} />Leave out films I’ve logged</label><span><Clock3 size={12} />Two 15-minute intervals included</span><button type="submit" className="button-primary" data-testid="festival-generate" disabled={Boolean(historyUnavailable)}>{props.diaryLoading && historyUnavailable ? <LoaderCircle size={14} className="spin" /> : <Ticket size={14} />}Curate my festival</button></div>{props.diaryError && historyUnavailable && <p className="form-error" role="alert">Your diary isn’t available. Try opening your passport again, or turn off the watched-film filter to continue.</p>}</form>
    {programme && !currentProgramme && <p className="club-fine-print" role="status" data-testid="festival-stale-notice">Your film shelf or diary changed. Curate again to keep the programme current.</p>}{plan ? <section className="festival-programme" data-testid="festival-result" data-total-minutes={plan.totalMinutes} data-film-count={plan.films.length}><div className="festival-programme-heading"><div><span className="club-kicker">A FRAME PERSONAL FILM FESTIVAL</span><h3>{plan.title}</h3><p>Three films · {minutes(plan.totalMinutes)} including intervals</p></div><span className="festival-programme-mark">F<br /><small>EST. FOR YOU</small></span></div><div className="festival-acts">{plan.films.map((movie, index) => <div key={canonicalMovieKey(movie)}>{index > 0 && <div className="festival-interval"><span /><small>15 MINUTES · STRETCH. MAKE SOME TEA.</small><span /></div>}<article className="festival-act" data-testid="festival-film" data-runtime={movie.duration} data-language={movie.originalLanguage}><div className="festival-act-number"><span>ACT</span><strong>0{index + 1}</strong></div><button className="festival-act-cover" aria-label={`Explore ${movie.title}`} onClick={() => props.onOpen(movie)}><Cover movie={movie} /></button><div className="festival-act-copy"><small>{language(movie)} · {movie.year} · {minutes(movie.duration || 0)}</small><button onClick={() => props.onOpen(movie)}>{movie.title}</button><p>{plan.reasons[index] || `${movie.genres.slice(0, 2).join(" / ")} from the available film shelf.`}</p><span>{movie.genres.slice(0, 3).join(" / ")}</span></div><button className="icon-btn" aria-label={`Explore ${movie.title}`} onClick={() => props.onOpen(movie)}><ArrowRight size={16} /></button></article></div>)}</div><div className="festival-calendar"><label>When should the festival begin?<input name="festivalStartTime" type="datetime-local" value={startTime} onChange={event => setStartTime(event.target.value)} /></label><button className="button-primary" data-testid="festival-calendar" onClick={exportCalendar}><Download size={14} />Keep the programme</button></div><p className="club-fine-print">Downloads a calendar file with three film sessions and two intervals. Import it into your calendar; nothing is booked or sent automatically.</p></section> : generated ? <div className="club-empty"><Clock3 size={28} /><h3>This programme needs a little more room.</h3><p>Try more time or another theme. We require three different films with known runtimes, and keep the intervals inside your budget.</p></div> : <div className="festival-placeholder"><Ticket size={35} strokeWidth={1.1} /><h3>The best seat in the house.<br /><em>Is yours.</em></h3><p>Choose a theme and a little time. We’ll turn the film shelf into your own three-act programme.</p></div>}{error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}

export default function DiscoveryStudio(props: Props) { return props.feature === "compass" ? <TasteCompass {...props} /> : <FestivalStudio {...props} />; }
