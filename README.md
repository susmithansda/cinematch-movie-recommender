# FRAME — the movie club

A complete movie discovery app with a cinematic responsive interface, live movie metadata, secure accounts, and personal watchlists.

## Included

- Live Apple movie charts and title search without an API key, with ten-minute server caching and explicit source/outage labels.
- Optional TMDB integration for theatrical now-playing, upcoming releases, review scores, and official trailers.
- Hollywood and Bollywood/Hindi browsing, genre and mood discovery, country selection, sorting, search, load-more pagination, and recommendations ranked by watchlist genres. Film language is independent of storefront region.
- High-resolution artwork, animated cards, featured-film carousel, accessible dialogs, keyboard search, reduced-motion support, and mobile navigation.
- Movie details with YouTube trailers or Apple video previews and matching store links. Full films are not hosted.
- Email/password registration and login, Google and Facebook OAuth, persistent private watchlists, and sign-out. The in-app sign-in screen has no ChatGPT button.
- Expiring single-use password-reset links delivered through Resend when configured.
- Cinematic, lo-fi, and ambient music synthesized in the browser. Audio starts only when requested; no third-party music subscription or copyrighted audio download is required.
- Movie Night Planner: a single film or double feature within your time budget, including a 15-minute interval and an optional Hindi/English pairing. Download a real calendar file for your selected start time.
- Blind Date with a Film: discover a film through genre, year, and runtime clues before revealing the title and poster. Films in your diary are excluded.
- Comparison shortlist: compare up to three films, refresh missing details, and choose whether to reveal story summaries.
- Cinema Passport: a private watched-film diary with personal ratings, notes, dates, earned stamps, a genre profile, and an export of your own entries. Logged films can be hidden from browsing.

## Run locally

Requires Node.js 22.13+ (Node 24 recommended).

```powershell
npm ci
npm run dev
```

Open the printed local URL, normally **http://127.0.0.1:5173**. This workspace's local database has already been initialized.

For a fresh checkout, build once and initialize its empty local D1 database before starting development:

```powershell
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_mushy_human_fly.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_icy_xavin.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_powerful_war_machine.sql
npm run dev
```

Run the SQL command only for a fresh database. Local development accounts and data stay in the ignored `.wrangler/` directory and are separate from production.

Email and social accounts use the local database during development. The hosted Site retains its existing private audience policy independently of FRAME's account forms.

## Provider configuration

Copy `.dev.vars.example` to the ignored `.dev.vars` and fill in the needed values:

| Server environment variable | Purpose |
| --- | --- |
| `TMDB_READ_ACCESS_TOKEN` | Optional; adds TMDB theatrical release discovery, upcoming movies and ratings. |
| `RESEND_API_KEY` | Required for password-reset email delivery. |
| `AUTH_FROM_EMAIL` | Verified Resend sender, for example `FRAME <accounts@your-domain.com>`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Enables Google sign-in after registering an OAuth web app and its exact callback URL. |
| `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` | Enables Facebook sign-in after registering a Meta app and its exact callback URL. |

Restart local development after changing these values. Hosted values belong in Sites environment settings and require a new deployment to take effect. Never put secrets in browser code or the hosting manifest.

Without mail configuration, the reset form clearly reports that email is not configured. It does not claim to have sent a message. Real email delivery has not been tested without provider credentials. Apple discovery works without credentials; TMDB credentials are needed for authoritative theatrical now-playing and upcoming feeds. Film availability varies by region.

The Site is private by default. Visitors authenticate through Sites before opening it; FRAME email accounts do not override the Site's audience policy.

## Verify

```powershell
npm run typecheck
npm test
npm run build
```

Automated tests execute actual auth/watchlist/OAuth/provider functions against SQLite and controlled upstream fixtures. They cover secure sessions, account isolation, password-reset expiry and replay, OAuth state and profile validation, CSRF, rate limiting, Hindi/English original-language filtering, provider outages, and artwork resizing.

For a running local server, optional integration checks are available:

```powershell
node scripts/http-smoke.mjs
node scripts/browser-qa.mjs
node scripts/feature-qa.mjs
```

The HTTP check creates an isolated local test account and tests real API requests. The browser check uses installed Windows Chrome and saves desktop/mobile screenshots under ignored `outputs/`.

## Stack and source

React 19, TypeScript, Vinext/Vite, Cloudflare Workers, D1 SQLite, Drizzle ORM, Web Crypto, Web Audio, and Lucide icons. The Sites integration and `.openai/hosting.json` retain deployment identity and storage bindings. Production SQL migrations are applied by Sites during publication.

- `app/cinema.tsx`: interface, discovery controls, account forms, trailers, music.
- `app/cinema-club.tsx`, `app/cinema-club.css`: planner, blind discovery, comparisons, and Cinema Passport.
- `lib/movie-night.ts`: runtime-aware matching, canonical movie identity, and calendar generation.
- `lib/diary.ts`, `app/api/diary/`: private diary validation and storage.
- `app/globals.css`: responsive visual design and animation.
- `lib/auth.ts`, `app/api/auth/`, `app/api/watchlist/`: accounts and private data.
- `lib/movie-provider.ts`, `app/api/movies/`: live providers, normalization, caching.
- `db/schema.ts`, `drizzle/`: durable schema and migration.
- [AUTH.md](AUTH.md): account security and API details.
- [DATA.md](DATA.md): provider behavior, limitations, attribution and sources.
- [DIARY.md](DIARY.md): private diary API and account isolation.
- [FEATURE-NOTES.md](FEATURE-NOTES.md): movie-night rules and calendar behavior.
