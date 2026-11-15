# Movie Night Planner helpers

`lib/movie-night.ts` is client-safe and has no network, storage, clock, or random side effects. Its exported helpers are `canonicalMovieKey`, `movieMatchesMood`, `recommendMovieNight`, and `createMovieNightCalendar`.

`recommendMovieNight(movies, preferences, watchedIds)` accepts a mood, industry (`all`, `hollywood`, or `bollywood`), `maxMinutes`, and mode (`single` or `double`). Optional fields are `bothWorlds`, `preferredGenres`, `hideWatched` (defaults to true), and `limit` (defaults to six). Each suggestion contains `films`, one metadata-based explanation per film in `reasons`, `totalMinutes`, and `breakMinutes`.

Only finite positive known runtimes are eligible. A double feature includes a 15-minute intermission within the budget. Unknown runtimes never inherit estimates from unrelated movies. Mood choices filter by genre overlap and rank by the number of matching genres, followed by overlap with saved genre preferences; `anything` skips the mood constraint. Explanations describe actual genres and runtime. They do not claim artificial intelligence, review scores, or percentage matches. The helper returns an empty array when constraints cannot be met.

For double features, `bothWorlds: true` requires exactly one Hindi original and one English original. It requires `industry: "all"`; a conflicting single-industry request returns no suggestions. The flag is inactive in single-feature mode. Explicit `originalLanguage` metadata wins over an industry tag; a known `hollywood` or `bollywood` tag is used only when original-language metadata is absent. Unknown industry is never inferred from storefront country.

Canonical identities normalize title, common edition suffixes, and release year across provider IDs. Different years remain distinct. Watched exclusions accept both provider IDs and these canonical keys. A watched provider ID present in the candidate pool expands to its canonical identity automatically; callers should persist canonical keys alongside IDs so exclusions also work when the original provider entry is absent from a later pool. Duplicate catalog entries cannot occupy both slots of a double feature.

`createMovieNightCalendar(plan, start, { generatedAt, uid })` returns calendar text without initiating a download or sending an invitation. The caller supplies a valid start `Date`, creation `Date`, and unique identifier, then downloads the returned text in response to the user's calendar button. Film and intermission blocks are separate events. Invalid dates, malformed identifiers, missing runtimes, duplicate films, and inconsistent totals are rejected.

The calendar serializer follows [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545): UTC timestamps, CRLF separators, escaped text, and lines folded at 75 UTF-8 octets. It preserves Unicode characters when folding and assigns distinct event identifiers within a plan. No calendar connection is required; calendar software imports the downloaded `.ics` file.

Validation: `node --test --test-isolation=none tests/movie-night.test.mjs` exercises budget boundaries, missing runtimes, provider/edition duplicates, watched exclusions, strict language selection, mood and taste ranking, calendar timing, escaping, Unicode folding, and malformed-plan rejection.
