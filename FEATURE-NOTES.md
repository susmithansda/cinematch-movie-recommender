# Movie Night Planner helpers

`lib/movie-night.ts` is client-safe and has no network, storage, clock, or random side effects. Its exported helpers are `canonicalMovieKey`, `movieMatchesMood`, `recommendMovieNight`, and `createMovieNightCalendar`.

`recommendMovieNight(movies, preferences, watchedIds)` accepts a mood, industry (`all`, `hollywood`, `bollywood`, or `bengali`), `maxMinutes`, and mode (`single` or `double`). Optional fields are `bothWorlds`, `preferredGenres`, `hideWatched` (defaults to true), and `limit` (defaults to six). Each suggestion contains `films`, one metadata-based explanation per film in `reasons`, `totalMinutes`, and `breakMinutes`.

Only finite positive known runtimes are eligible. A double feature includes a 15-minute intermission within the budget. Unknown runtimes never inherit estimates from unrelated movies. Mood choices filter by genre overlap and rank by the number of matching genres, followed by overlap with saved genre preferences; `anything` skips the mood constraint. Explanations describe actual genres and runtime. They do not claim artificial intelligence, review scores, or percentage matches. The helper returns an empty array when constraints cannot be met.

For double features, `bothWorlds: true` requires exactly one Hindi original and one English original. It requires `industry: "all"`; a conflicting single-industry request returns no suggestions. The flag is inactive in single-feature mode. Explicit `originalLanguage` metadata wins over an industry tag; known `hollywood`, `bollywood`, or `bengali` tags are used only when original-language metadata is absent. Bengali selects `bn` originals, rather than Hindi films dubbed into Bengali. Unknown industry is never inferred from storefront country.

Canonical identities normalize title, common edition suffixes, and release year across provider IDs. Different years remain distinct. Watched exclusions accept both provider IDs and these canonical keys. A watched provider ID present in the candidate pool expands to its canonical identity automatically; callers should persist canonical keys alongside IDs so exclusions also work when the original provider entry is absent from a later pool. Duplicate catalog entries cannot occupy both slots of a double feature.

`createMovieNightCalendar(plan, start, { generatedAt, uid })` returns calendar text without initiating a download or sending an invitation. The caller supplies a valid start `Date`, creation `Date`, and unique identifier, then downloads the returned text in response to the user's calendar button. Film and intermission blocks are separate events. Invalid dates, malformed identifiers, missing runtimes, duplicate films, and inconsistent totals are rejected.

The calendar serializer follows [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545): UTC timestamps, CRLF separators, escaped text, and lines folded at 75 UTF-8 octets. It preserves Unicode characters when folding and assigns distinct event identifiers within a plan. No calendar connection is required; calendar software imports the downloaded `.ics` file.

Validation: `node --test --test-isolation=none tests/movie-night.test.mjs` exercises budget boundaries, missing runtimes, provider/edition duplicates, watched exclusions, strict language selection, mood and taste ranking, calendar timing, escaping, Unicode folding, and malformed-plan rejection.

## Taste Compass

`lib/discovery.ts` exports `buildTasteCompass(catalog, diary, saved, {industry, lane, limit})`. The result contains `suggestions`, `profile`, and `coldStart`. A suggestion has its `movie`, factual `reasons`, `sharedGenres`, and `newGenres`. The profile reports unique watched and personally rated films, explored original-language codes, and genre entries with signed `weight` plus evidence `count`.

The most recent entry for a canonical film supplies its personal score. Five-star films add weight 3 to their genres, four-star films add 2, three-star films add 0.25, two-star films subtract 1.5, and one-star films subtract 3. Each unlogged saved film adds 0.5; saving a watched, disliked film cannot undo its rating. Unrated diary films inform explored genres/languages without being treated as liked. Counts cover unique diary and unlogged saved titles that contain a genre. Genre weights are evidence weights, never review scores or confidence percentages.

`comfort` ranks familiar positive genre connections while penalizing genres with lower ratings. `adventure` rewards genres not yet present in the diary, with the same negative-rating penalty. `bridge` defaults to Bengali originals when industry is `all`, or uses the explicitly selected cinema, and describes actual genre connections. Every lane excludes logged canonical films and provider/edition duplicates. With no rated diary or unlogged saved films, the result explicitly reports a cold start and offers catalog discovery without pretending to know the visitor's taste.

## Film Festival

`buildFilmFestival(catalog, {theme, maxMinutes, count: 3, excludeWatched}, watchedKeys)` returns one `FilmFestivalPlan` or `null`. Its fields are `films`, one reason per film, `totalMinutes`, `breakMinutes`, `theme`, and `title`. `breakMinutes` is the **total** interval duration, 30 minutes: two separate 15-minute breaks.

Themes are `bengal-stories` (three Bengali originals), `world-tour` (one English, one Hindi and one Bengali original), `mystery-evening` (Mystery/Thriller/Crime genre overlap), and `feel-good` (Comedy/Family/Animation/Music genre overlap). These are metadata heuristics, not content or age classifications. All three films need real positive known runtimes, distinct canonical identities, and a total including breaks that fits the selected budget. Watched exclusions default on. No theme, language, or budget is silently relaxed.

The search favors genre variety and, for Bengal stories, different decades. For large libraries it evaluates a bounded selection while retaining the shortest eligible programmes so it cannot discard the only lineup that fits the budget. It makes no claim that its chosen programme is a globally optimal combination.

`createFestivalCalendar(plan, start, {generatedAt, uid})` returns a five-event ICS file: three film blocks and two intervals. Like the Movie Night calendar, it validates supplied data, uses UTC timestamps, escapes text, folds at 75 UTF-8 octets, and performs no network or calendar-account action. The interface downloads it only when requested.

The interface invalidates a generated programme when authentication, relevant diary history, or the available film metadata changes. A guest programme cannot retain logged films after a delayed authenticated diary loads. Compass watchlist actions match canonical film identity and remove the actual saved provider record rather than creating an additional edition.

Validation: `node --test --test-isolation=none tests/discovery.test.mjs` covers cold starts, rating penalties, saved evidence, original-language filtering, nonmutation, canonical exclusions, strict theme and runtime rules, large-library feasibility, calendar timing, Bengali Unicode folding, and injection rejection.
