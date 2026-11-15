"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, BookOpen, CalendarDays, Check, CheckCircle2, Clock3, Columns3, Dices, Download, Edit3, Film, LoaderCircle, LockKeyhole, Plus, RefreshCw, Star, Ticket, Trash2, X } from "lucide-react";
import type { Movie } from "../lib/movies";
import type { DiaryEntry } from "../lib/diary-types";
import { canonicalMovieKey, createMovieNightCalendar, recommendMovieNight, type MovieNightPreferences } from "../lib/movie-night";

export type ClubFeature = "planner" | "blind" | "compare" | "passport" | "log";
type Plan = ReturnType<typeof recommendMovieNight>[number];
type Industry = "all" | "hollywood" | "bollywood";
type Props = {
  feature: ClubFeature;
  catalog: Movie[];
  diary: DiaryEntry[];
  compared: Movie[];
  loggedMovie: Movie | null;
  authenticated: boolean;
  industry: Industry;
  preferredGenres: string[];
  diaryLoading: boolean;
  diaryError: string;
  onFeature: (feature: ClubFeature) => void;
  onOpen: (movie: Movie) => void;
  onSave: (movie: Movie) => void;
  onCompare: (movie: Movie) => void;
  onRefreshComparison: () => Promise<void>;
  onSignIn: () => void;
  onLog: (movie: Movie) => void;
  onSaveEntry: (entry: DiaryEntry) => Promise<void>;
  onDeleteEntry: (id: string) => Promise<void>;
  onRetryDiary: () => void;
};

const EXPERIENCES = [
  { id: "planner", title: "Plan an evening", subtitle: "One night. Two great films.", icon: CalendarDays },
  { id: "blind", title: "Blind date with a film", subtitle: "Leave your expectations at the door.", icon: Dices },
  { id: "compare", title: "The final shortlist", subtitle: "Put your contenders side by side.", icon: Columns3 },
  { id: "passport", title: "Cinema passport", subtitle: "A record of the worlds you’ve visited.", icon: BookOpen },
] as const;
const MOODS = [
  { value: "anything", label: "Open to anything" },
  { value: "easygoing", label: "Keep it light" },
  { value: "edge-of-seat", label: "Keep me on the edge" },
  { value: "heartfelt", label: "Something with heart" },
  { value: "mind-bending", label: "Make me think" },
] as const;

const duration = (minutes: number) => `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}h ` : ""}${minutes % 60 ? `${minutes % 60}m` : ""}`.trim() || "0m";
const language = (movie: Movie) => {
  const original = movie.originalLanguage?.trim().toLowerCase();
  if (original) return original === "hi" ? "Hindi" : original === "en" ? "English" : movie.language || original.toUpperCase();
  return movie.industry === "bollywood" ? "Hindi" : movie.industry === "hollywood" ? "English" : movie.language || "Not provided";
};
const passportGenres = (movie: Movie) => [...new Set(movie.genres.flatMap(genre => genre.split(/\s*(?:&|\/)\s*/)).map(genre => /^sci[ -]?fi$/i.test(genre) ? "Science Fiction" : genre.trim()).filter(genre => genre && genre !== "Bollywood"))];

function Cover({ movie }: { movie: Movie }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [movie.poster]);
  return !movie.poster || failed ? <span className="club-cover-fallback"><Film size={19} /></span> : <img className="club-cover" src={movie.poster} alt={`${movie.title} poster`} loading="lazy" onError={() => setFailed(true)} />;
}

function download(contents: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function nextEvening() {
  const now = new Date(), evening = new Date();
  evening.setHours(20, 0, 0, 0);
  if (evening <= now) evening.setDate(evening.getDate() + 1);
  return `${localDate(evening)}T20:00`;
}

export function ClubLaunchers({ onOpen, comparedCount, diaryCount }: { onOpen: (feature: ClubFeature) => void; comparedCount: number; diaryCount: number }) {
  return <section className="club-launchers" aria-label="The FRAME movie club">
    {EXPERIENCES.map(({ id, title, subtitle, icon: Icon }, index) => <button key={id} className={`club-launcher launcher-${id}`} data-testid={`club-open-${id}`} onClick={() => onOpen(id)}>
      <span className="launcher-number">0{index + 1}</span><Icon size={20} strokeWidth={1.4} /><span><strong>{title}{id === "compare" && comparedCount > 0 && <b>{comparedCount}</b>}{id === "passport" && diaryCount > 0 && <b>{diaryCount}</b>}</strong><small>{subtitle}</small></span><ArrowRight size={13} />
    </button>)}
  </section>;
}

export function ComparisonTray({ movies, onOpen, onRemove, onClear }: { movies: Movie[]; onOpen: () => void; onRemove: (movie: Movie) => void; onClear: () => void }) {
  if (!movies.length) return null;
  return <div className="comparison-tray" data-testid="compare-tray" role="region" aria-label="Your movie comparison shortlist"><span className="tray-caption"><Columns3 size={17} />The shortlist <b>{movies.length}/3</b></span><div className="tray-films">{movies.map(movie => <div key={canonicalMovieKey(movie)} className="tray-film"><Cover movie={movie} /><button aria-label={`Remove ${movie.title} from comparison`} onClick={() => onRemove(movie)}><X size={11} /></button></div>)}</div><button className="button-primary" data-testid="club-open-compare" onClick={onOpen}>Compare <ArrowRight size={14} /></button><button className="icon-btn" aria-label="Clear comparison shortlist" onClick={onClear}><X size={15} /></button></div>;
}

function Planner({ catalog, diary, industry, preferredGenres, onOpen }: Pick<Props, "catalog" | "diary" | "industry" | "preferredGenres" | "onOpen">) {
  const [mode, setMode] = useState<"single" | "double">("double");
  const [mood, setMood] = useState<MovieNightPreferences["mood"]>("anything");
  const [selectedIndustry, setIndustry] = useState<Industry>(industry);
  const [maxMinutes, setMaxMinutes] = useState(360), [bothWorlds, setBothWorlds] = useState(true), [hideWatched, setHideWatched] = useState(true);
  const [plans, setPlans] = useState<Plan[] | null>(null), [startTime, setStartTime] = useState(nextEvening), [calendarError, setCalendarError] = useState("");
  const watched = diary.map(entry => canonicalMovieKey(entry.movie));
  useEffect(() => { setPlans(null); setCalendarError(""); }, [mode, mood, selectedIndustry, maxMinutes, bothWorlds, hideWatched]);
  function generate(event: FormEvent) {
    event.preventDefault();
    setPlans(recommendMovieNight(catalog, { mode, mood, industry: selectedIndustry, maxMinutes, bothWorlds: mode === "double" && selectedIndustry === "all" && bothWorlds, hideWatched, preferredGenres, limit: 3 }, watched));
  }
  function exportCalendar(plan: Plan) {
    try {
      const start = new Date(startTime);
      if (!startTime || !Number.isFinite(start.getTime()) || start.getTime() < Date.now() - 60000) throw new Error("Choose a start time in the future for your movie night.");
      const content = createMovieNightCalendar(plan, start, { generatedAt: new Date(), uid: crypto.randomUUID() });
      download(content, "frame-movie-night.ics", "text/calendar;charset=utf-8"); setCalendarError("");
    } catch (error) { setCalendarError((error as Error).message); }
  }
  return <div className="planner-experience">
    <form className="planner-form" onSubmit={generate}>
      <div className="planner-fields"><label>Make it a<select name="mode" value={mode} onChange={e => setMode(e.target.value as "single" | "double")}><option value="double">Double feature</option><option value="single">Single feature</option></select></label><label>The feeling<select name="mood" value={mood} onChange={e => setMood(e.target.value as MovieNightPreferences["mood"])}>{MOODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label><label>Your cinema<select name="industry" value={selectedIndustry} onChange={e => setIndustry(e.target.value as Industry)}><option value="all">Both worlds</option><option value="hollywood">Hollywood / English</option><option value="bollywood">Bollywood / Hindi</option></select></label></div>
      <div className="planner-budget"><div><label htmlFor="night-budget">Time you have</label><output htmlFor="night-budget">{duration(maxMinutes)}</output></div><input id="night-budget" name="maxMinutes" type="range" min="90" max="420" step="15" value={maxMinutes} onChange={e => setMaxMinutes(Number(e.target.value))} /><div className="budget-scale"><span>90 minutes</span><span>A whole evening</span></div></div>
      <div className="planner-checks">{mode === "double" && selectedIndustry === "all" && <label><input type="checkbox" name="bothWorlds" checked={bothWorlds} onChange={e => setBothWorlds(e.target.checked)} />One Hindi film + one English film</label>}<label><input type="checkbox" name="hideWatched" checked={hideWatched} onChange={e => setHideWatched(e.target.checked)} />Something I haven’t logged before</label></div>
      <div className="planner-form-footer"><p><Clock3 size={13} />{mode === "double" ? "A 15-minute interval is included in your time." : "Based on films with available runtimes."}</p><button className="button-primary" type="submit" data-testid="planner-generate">Plan my evening <ArrowRight size={15} /></button></div>
    </form>
    {plans === null ? <div className="planner-placeholder"><Ticket size={36} strokeWidth={1.1} /><h3>Less deciding.<br /><em>More movie night.</em></h3><p>Pick a mood, set your time, and we’ll build a bill that fits.</p></div> : plans.length === 0 ? <div className="club-empty"><Clock3 size={27} /><h3>No perfect fit for this evening.</h3><p>Try a little more time, a different mood, or a single feature. We only suggest films with a known runtime that fit your choices.</p></div> : <section className="planner-results" aria-label="Your movie night suggestions"><div className="planner-results-heading"><h3>Your evening, in {plans[0].films.length === 2 ? "two acts" : "one great film"}.</h3><label>When do the lights go down?<input name="startTime" type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} aria-label="Movie night start time" required /></label></div><div className="night-plans">{plans.map((plan, index) => <article className="night-plan" key={plan.films.map(canonicalMovieKey).join("+")} data-total-minutes={plan.totalMinutes} data-film-count={plan.films.length}><div className="night-plan-top"><span>THE {String(index + 1).padStart(2, "0")} EDIT</span><b>{duration(plan.totalMinutes)} total</b></div><div className="planned-films">{plan.films.map((movie, i) => <div key={movie.id}>{i > 0 && <div className="planned-interval"><span />15 MIN INTERVAL<span /></div>}<button type="button" className="planned-film" data-testid="planned-film" data-runtime={movie.duration} data-industry={movie.industry} onClick={() => onOpen(movie)}><Cover movie={movie} /><span><small>ACT {i + 1} · {language(movie)}</small><strong>{movie.title}</strong><span>{movie.year} · {duration(movie.duration || 0)}</span></span><ArrowRight size={13} /></button></div>)}</div><ul className="plan-reasons">{plan.reasons.map(reason => <li key={reason}><Check size={12} />{reason}</li>)}</ul><button className="calendar-export" type="button" data-testid="planner-calendar" onClick={() => exportCalendar(plan)}><Download size={13} />Save to my calendar</button></article>)}</div>{calendarError && <p className="form-error" role="alert">{calendarError}</p>}<p className="club-fine-print">Matches use genres and known runtimes from the catalog. Film availability varies by region. Calendar files download to your device.</p></section>}
  </div>;
}

function BlindDate({ catalog, diary, industry, preferredGenres, onOpen, onSave }: Pick<Props, "catalog" | "diary" | "industry" | "preferredGenres" | "onOpen" | "onSave">) {
  const [mood, setMood] = useState<MovieNightPreferences["mood"]>("anything"), [selectedIndustry, setIndustry] = useState<Industry>(industry), [revealed, setRevealed] = useState(false), [movie, setMovie] = useState<Movie | null>(null), [dealt, setDealt] = useState<string[]>([]);
  const candidates = recommendMovieNight(catalog, { mode: "single", industry: selectedIndustry, mood, maxMinutes: 420, hideWatched: true, preferredGenres, limit: 100 }, diary.map(entry => canonicalMovieKey(entry.movie))).flatMap(plan => plan.films);
  const signature = candidates.map(canonicalMovieKey).join("|");
  function draw() {
    const previous = new Set([...dealt, ...(movie ? [canonicalMovieKey(movie)] : [])]);
    const unused = candidates.filter(candidate => !previous.has(canonicalMovieKey(candidate)));
    const alternatives = candidates.filter(candidate => !movie || canonicalMovieKey(candidate) !== canonicalMovieKey(movie));
    const pool = unused.length ? unused : alternatives.length ? alternatives : candidates;
    const next = pool[Math.floor(Math.random() * pool.length)] || null;
    setMovie(next); setRevealed(false); setDealt(next ? [...(unused.length ? previous : []), canonicalMovieKey(next)] : []);
  }
  useEffect(() => { setRevealed(false); setDealt([]); setMovie(candidates[Math.floor(Math.random() * candidates.length)] || null); }, [signature]);
  return <div className="blind-experience"><div className="blind-filters"><label>The feeling<select name="blindMood" value={mood} onChange={e => setMood(e.target.value as MovieNightPreferences["mood"])}>{MOODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label><label>Your cinema<select name="blindIndustry" value={selectedIndustry} onChange={e => setIndustry(e.target.value as Industry)}><option value="all">Either world</option><option value="hollywood">Hollywood / English</option><option value="bollywood">Bollywood / Hindi</option></select></label></div>{movie ? <div className={`blind-ticket ${revealed ? "revealed" : ""}`}><div className="blind-ticket-edge"><span>FRAME / ADMIT ONE</span><b>{revealed ? "IT’S A MATCH" : "NO EXPECTATIONS"}</b></div><div className="blind-ticket-content" aria-live="polite">{revealed ? <><Cover movie={movie} /><div className="blind-revealed-copy"><span className="club-kicker">MEET YOUR MOVIE</span><h3 className="blind-film-title">{movie.title}</h3><p>{movie.year} · {language(movie)} · {duration(movie.duration || 0)}</p><span className="blind-genres">{movie.genres.slice(0, 3).join(" / ")}</span><div><button className="button-primary" data-testid="blind-open-film" onClick={() => onOpen(movie)}>Meet this film <ArrowRight size={14} /></button><button className="button-secondary" onClick={() => onSave(movie)}><Plus size={14} />My list</button></div></div></> : <div className="blind-mystery"><span className="mystery-reel"><Film size={35} strokeWidth={1} /></span><h3>A good film.<br /><em>A clean slate.</em></h3><p>No poster. No title. Just a few clues.</p><div className="blind-clues"><span>{movie.year}</span><span>{duration(movie.duration || 0)}</span><span>{movie.genres[0]}</span></div><button className="button-primary" data-testid="blind-reveal" onClick={() => setRevealed(true)}>Turn the ticket over <ArrowRight size={15} /></button></div>}</div><div className="blind-ticket-bottom"><span>{revealed ? "Sometimes, the best ones find you." : "A small leap of cinematic faith."}</span><span className="ticket-barcode" aria-hidden="true" /></div></div> : <div className="club-empty"><Film size={30} /><h3>No mystery films in this frame.</h3><p>Try another mood or cinema. Films you’ve logged are left out.</p></div>}<div className="blind-bottom"><span>Films you’ve logged won’t be dealt again.</span><button className="text-link" data-testid="blind-next" onClick={draw} disabled={!candidates.length}><RefreshCw size={13} />Deal me another</button></div></div>;
}

function Comparison({ catalog, compared, diary, onOpen, onCompare, onRefreshComparison }: Pick<Props, "catalog" | "compared" | "diary" | "onOpen" | "onCompare" | "onRefreshComparison">) {
  const [plots, setPlots] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState("");
  async function hydrate() { setLoading(true); setError(""); try { await onRefreshComparison(); } catch (cause) { setError((cause as Error).message); } finally { setLoading(false); } }
  const rows: { label: string; value: (movie: Movie) => string }[] = [
    { label: "Year", value: movie => String(movie.year || "Not provided") },
    { label: "Runtime", value: movie => movie.duration ? duration(movie.duration) : "Not provided" },
    { label: "Original language", value: language },
    { label: "The territory", value: movie => movie.genres.slice(0, 3).join(" / ") || "Not provided" },
    { label: "Provider score", value: movie => movie.rating != null && movie.rating > 0 ? `${movie.rating.toFixed(1)} / 10` : "Not provided" },
    { label: "Your rating", value: movie => { const entry = diary.find(item => canonicalMovieKey(item.movie) === canonicalMovieKey(movie)); return entry?.rating ? `${entry.rating} / 5` : "Not rated yet"; } },
  ];
  return <div className="compare-experience"><div className="comparison-options"><p><Columns3 size={15} />Up to three contenders. One easier decision.</p><label><input type="checkbox" checked={plots} onChange={e => setPlots(e.target.checked)} />Show story summaries</label></div>{compared.length ? <><div className="compare-table-scroll" tabIndex={0} role="region" aria-label="Movie comparison table"><table className="compare-table"><thead><tr><th scope="col"><span>The final<br /><em>shortlist.</em></span><small>{compared.length}/3 films</small></th>{compared.map(movie => <th key={canonicalMovieKey(movie)} scope="col"><div className="compare-film"><button className="compare-cover-button" onClick={() => onOpen(movie)}><Cover movie={movie} /></button><button className="icon-btn compare-remove" aria-label={`Remove ${movie.title} from comparison`} onClick={() => onCompare(movie)}><X size={15} /></button><button className="compare-film-title" onClick={() => onOpen(movie)}>{movie.title}</button></div></th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{compared.map(movie => <td key={canonicalMovieKey(movie)}>{row.value(movie)}</td>)}</tr>)}{plots && <tr className="compare-plots"><th scope="row">The story</th>{compared.map(movie => <td key={canonicalMovieKey(movie)}>{movie.overview || "Not provided"}</td>)}</tr>}</tbody></table></div><div className="compare-data-footer"><span>Scores come from the provider. Your ratings stay personal.</span><button className="text-link" onClick={hydrate} disabled={loading}>{loading ? <LoaderCircle size={13} className="spin" /> : <RefreshCw size={13} />}Fill in missing details</button></div>{error && <p className="form-error" role="alert">{error}</p>}</> : <div className="club-empty"><Columns3 size={30} /><h3>Every good night needs a shortlist.</h3><p>Use the comparison button on a movie poster, or start with a few from the shelf below.</p></div>}{compared.length < 3 && <div className="compare-picker"><span className="club-kicker">ADD A CONTENDER</span><div>{catalog.filter(movie => !compared.some(item => canonicalMovieKey(item) === canonicalMovieKey(movie))).slice(0, 12).map(movie => <button key={canonicalMovieKey(movie)} onClick={() => onCompare(movie)}><Cover movie={movie} /><span>{movie.title}</span><Plus size={13} /></button>)}</div></div>}</div>;
}

function Passport({ diary, authenticated, diaryLoading, diaryError, onSignIn, onLog, onDeleteEntry, onRetryDiary }: Pick<Props, "diary" | "authenticated" | "diaryLoading" | "diaryError" | "onSignIn" | "onLog" | "onDeleteEntry" | "onRetryDiary">) {
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState("");
  const unique = useMemo(() => [...new Map(diary.map(entry => [canonicalMovieKey(entry.movie), entry])).values()], [diary]);
  const genres = unique.reduce<Record<string, number>>((result, entry) => { passportGenres(entry.movie).forEach(g => { result[g] = (result[g] || 0) + 1; }); return result; }, {});
  const topGenres = Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const hindi = unique.filter(entry => language(entry.movie) === "Hindi").length;
  const english = unique.filter(entry => language(entry.movie) === "English").length;
  const minutes = unique.reduce((total, entry) => total + (entry.movie.duration || 0), 0);
  const stamps = [{ title: "First frame", note: "Your first logged film", earned: unique.length >= 1, icon: Ticket }, { title: "Across the aisle", note: "One Hindi + one English film", earned: hindi > 0 && english > 0, icon: Film }, { title: "Genre explorer", note: "Four different genres", earned: Object.keys(genres).length >= 4, icon: BookOpen }, { title: "The double bill", note: "Two films in your diary", earned: unique.length >= 2, icon: CheckCircle2 }];
  async function remove(id: string) { setBusy(id); setError(""); try { await onDeleteEntry(id); } catch (cause) { setError((cause as Error).message); } finally { setBusy(null); } }
  if (!authenticated) return <div className="passport-guest"><div className="passport-book"><ClapperboardMark /><span>FRAME</span><strong>CINEMA<br />PASSPORT</strong><small>GOOD STORIES LEAVE A MARK.</small></div><div><span className="club-kicker">YOUR OWN HISTORY OF CINEMA</span><h3>Keep the films.<br /><em>Keep the feeling.</em></h3><p>Log what you watch, leave a note for your future self, and collect stamps as you travel between genres and film worlds.</p><button className="button-primary" data-testid="passport-signin" onClick={onSignIn}>Start my passport <ArrowRight size={15} /></button><small>Your diary and ratings are private to your account.</small></div></div>;
  if (diaryLoading) return <div className="club-empty"><LoaderCircle size={27} className="spin" /><p>Opening your passport…</p></div>;
  if (diaryError) return <div className="club-empty"><BookOpen size={27} /><h3>Your passport couldn’t be opened.</h3><p>{diaryError}</p><button className="button-secondary" onClick={onRetryDiary}><RefreshCw size={14} />Try again</button></div>;
  return <div className="passport-experience"><div className="passport-stats"><div><strong>{unique.length}</strong><span>FILMS LOGGED</span></div><div><strong>{duration(minutes)}</strong><span>KNOWN SCREEN TIME</span></div><div><strong>{hindi}<small> / </small>{english}</strong><span>HINDI / ENGLISH</span></div><div><strong>{Object.keys(genres).length}</strong><span>GENRES EXPLORED</span></div></div><div className="passport-stamps">{stamps.map(({ title, note, earned, icon: Icon }) => <div key={title} className={`passport-stamp ${earned ? "earned" : ""}`} aria-label={`${title}: ${earned ? "earned" : "not earned yet"}`}><Icon size={23} strokeWidth={1.2} /><strong>{title}</strong><span>{note}</span>{earned ? <Check size={12} /> : <LockKeyhole size={11} />}</div>)}</div>{topGenres.length > 0 && <div className="taste-profile"><div><span className="club-kicker">YOUR TASTE, SO FAR</span><h3>The stories you return to.</h3><p>Based on the genres of films you’ve logged.</p></div><div className="taste-bars">{topGenres.map(([genre, count]) => <div key={genre}><span>{genre}</span><i><b style={{ width: `${count / (topGenres[0]?.[1] || 1) * 100}%` }} /></i><strong>{count}</strong></div>)}</div></div>}<div className="diary-heading"><div><span className="club-kicker">NOTES FROM THE AUDIENCE</span><h3>Your film diary.</h3></div>{diary.length > 0 && <button className="text-link" onClick={() => download(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries: diary }, null, 2), "frame-cinema-passport.json", "application/json")}><Download size={13} />Export my diary</button>}</div>{error && <p className="form-error" role="alert">{error}</p>}{diary.length ? <div className="diary-list">{[...diary].sort((a, b) => b.watchedAt.localeCompare(a.watchedAt)).map(entry => <article className="diary-card" key={entry.movie.id}><Cover movie={entry.movie} /><div className="diary-copy"><span>{entry.watchedAt} · {language(entry.movie)}</span><h4>{entry.movie.title}</h4>{entry.rating && <div className="diary-stars" aria-label={`Your rating: ${entry.rating} out of 5`}>{Array.from({ length: 5 }, (_, i) => <Star key={i} size={12} fill={i < entry.rating! ? "currentColor" : "none"} />)}</div>}{entry.note && <p>{entry.note}</p>}</div><div className="diary-actions"><button className="icon-btn" data-testid="diary-edit" aria-label={`Edit diary entry for ${entry.movie.title}`} onClick={() => onLog(entry.movie)}><Edit3 size={15} /></button><button className="icon-btn" aria-label={`Remove diary entry for ${entry.movie.title}`} disabled={busy === entry.movie.id} onClick={() => { void remove(entry.movie.id); }}>{busy === entry.movie.id ? <LoaderCircle size={14} className="spin" /> : <Trash2 size={14} />}</button></div></article>)}</div> : <div className="club-empty"><BookOpen size={28} /><h3>The first page is yours.</h3><p>Open any film and choose “Log this film” to add a watched date, a personal rating, and a note.</p></div>}<p className="club-fine-print">Your passport is private. Screen time includes known runtimes; stamps reflect the unique films in your diary.</p></div>;
}

function ClapperboardMark() { return <Film size={25} strokeWidth={1.3} />; }

function LogMovie({ movie, diary, onSaveEntry, onFeature }: { movie: Movie | null; diary: DiaryEntry[]; onSaveEntry: Props["onSaveEntry"]; onFeature: Props["onFeature"] }) {
  const existing = movie ? diary.find(entry => canonicalMovieKey(entry.movie) === canonicalMovieKey(movie)) : undefined;
  const [rating, setRating] = useState(existing?.rating ? String(existing.rating) : ""), [note, setNote] = useState(existing?.note || ""), [watchedAt, setWatchedAt] = useState(existing?.watchedAt || localDate()), [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (!movie) return <div className="club-empty"><Film size={25} /><p>Open a film to start your diary entry.</p></div>;
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!movie) return; setBusy(true); setError("");
    try { await onSaveEntry({ movie: existing?.movie || movie, rating: rating ? Number(rating) : null, note, watchedAt }); onFeature("passport"); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  return <div className="log-experience"><div className="log-film"><Cover movie={movie} /><div><span className="club-kicker">A NOTE TO YOUR FUTURE SELF</span><h3>{movie.title}</h3><p>{movie.year} · {language(movie)}</p></div></div><form className="diary-form" onSubmit={submit}><div className="diary-form-row"><label>When did you watch it?<input name="watchedAt" type="date" required value={watchedAt} max={localDate()} onChange={e => setWatchedAt(e.target.value)} /></label><label>Your rating<select name="rating" value={rating} onChange={e => setRating(e.target.value)}><option value="">Keep it unrated</option><option value="1">1 / 5 · Not for me</option><option value="2">2 / 5 · A mixed bag</option><option value="3">3 / 5 · A good watch</option><option value="4">4 / 5 · Loved it</option><option value="5">5 / 5 · An all-time favorite</option></select></label></div><label>A few words, just for you<textarea name="note" maxLength={1000} rows={4} value={note} onChange={e => setNote(e.target.value)} placeholder="A scene that stayed with you. Who you watched it with. Would you see it again?" /></label><span className="note-count">{note.length}/1000 · Private to your account</span>{error && <p className="form-error" role="alert">{error}</p>}<button type="submit" className="button-primary" data-testid="diary-save" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}{existing ? "Update my diary" : "Keep this memory"}</button></form></div>;
}

export default function CinemaClub(props: Props) {
  const titles: Record<ClubFeature, { eyebrow: string; title: string; subtitle: string }> = {
    planner: { eyebrow: "THE FRAME AFTER HOURS CLUB", title: "An evening, well cast.", subtitle: "Set the mood. Set your time. Let the double feature take care of itself." },
    blind: { eyebrow: "TAKE A SMALL CHANCE", title: "A blind date with a film.", subtitle: "No familiar faces. No snap judgments. Just the possibility of a new favorite." },
    compare: { eyebrow: "WHEN THE CHOICE IS TOO GOOD", title: "Decisions, side by side.", subtitle: "Look beyond the poster. Keep the plot a surprise until you’re ready." },
    passport: { eyebrow: "COLLECT STORIES, NOT JUST TITLES", title: "Your cinema passport.", subtitle: "The films you’ve seen. The worlds you’ve visited. A little more you, every time." },
    log: { eyebrow: "THE CREDITS HAVE ROLLED", title: "Keep a little of the film.", subtitle: "A rating, a date, a few words. All for you." },
  };
  const header = titles[props.feature];
  return <div className="club-experience"><header className="club-heading"><span className="club-kicker">{header.eyebrow}</span><h2>{header.title}</h2><p>{header.subtitle}</p></header>{props.feature !== "log" && <nav className="club-tabs" aria-label="Movie club experiences">{EXPERIENCES.map(({ id, title, icon: Icon }) => <button key={id} className={props.feature === id ? "active" : ""} aria-current={props.feature === id ? "page" : undefined} onClick={() => props.onFeature(id)}><Icon size={14} />{id === "planner" ? "Movie night" : id === "blind" ? "Blind date" : id === "compare" ? "Compare" : "Passport"}</button>)}</nav>}{props.feature === "planner" && <Planner {...props} />}{props.feature === "blind" && <BlindDate {...props} />}{props.feature === "compare" && <Comparison {...props} />}{props.feature === "passport" && <Passport {...props} />}{props.feature === "log" && <LogMovie movie={props.loggedMovie} diary={props.diary} onSaveEntry={props.onSaveEntry} onFeature={props.onFeature} />}</div>;
}
