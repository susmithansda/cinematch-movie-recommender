# FRAME — find your next obsession

A complete movie discovery app with a cinematic responsive interface, live movie metadata, secure accounts, and personal watchlists.

## Included

- Live Apple movie charts and title search without an API key, with ten-minute server caching and explicit source/outage labels.
- Optional TMDB integration for theatrical now-playing, upcoming releases, review scores, and official trailers.
- Genre and mood discovery, country selection, sorting, search, load-more pagination, and recommendations ranked by watchlist genres.
- High-resolution artwork, animated cards, featured-film carousel, accessible dialogs, keyboard search, reduced-motion support, and mobile navigation.
- Movie details with YouTube trailers or Apple video previews and matching store links. Full films are not hosted.
- Email/password registration and login, native ChatGPT sign-in on Sites, persistent private watchlists, and sign-out.
- Expiring single-use password-reset links delivered through Resend when configured.
- Cinematic, lo-fi, and ambient music synthesized in the browser. Audio starts only when requested; no third-party music subscription or copyrighted audio download is required.

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
npm run dev
```

Run the SQL command only for a fresh database. Local development accounts and data stay in the ignored `.wrangler/` directory and are separate from production.

The development-only native ChatGPT option uses the starter's loopback mock identity. Email accounts are real local accounts backed by the local database.

## Provider configuration

Copy `.dev.vars.example` to the ignored `.dev.vars` and fill in the needed values:

| Server environment variable | Purpose |
| --- | --- |
| `TMDB_READ_ACCESS_TOKEN` | Optional; adds TMDB theatrical release discovery, upcoming movies and ratings. |
| `RESEND_API_KEY` | Required for password-reset email delivery. |
| `AUTH_FROM_EMAIL` | Verified Resend sender, for example `FRAME <accounts@your-domain.com>`. |

Restart local development after changing these values. Hosted values belong in Sites environment settings and require a new deployment to take effect. Never put secrets in browser code or the hosting manifest.

Without mail configuration, the reset form clearly reports that email is not configured. It does not claim to have sent a message. Real email delivery has not been tested without provider credentials. Apple discovery works without credentials; TMDB credentials are needed for authoritative theatrical now-playing and upcoming feeds. Film availability varies by region.

The Site is private by default. Visitors authenticate through Sites before opening it; FRAME email accounts do not override the Site's audience policy.

## Verify

```powershell
npm run typecheck
npm test
npm run build
```

The 12 automated tests execute actual auth/watchlist/provider functions against SQLite and controlled upstream fixtures. They cover secure sessions, account isolation, password-reset expiry and replay, CSRF, rate limiting, movie-provider schemas, outages, and artwork resizing.

For a running local server, optional integration checks are available:

```powershell
node scripts/http-smoke.mjs
node scripts/browser-qa.mjs
```

The HTTP check creates an isolated local test account and tests real API requests. The browser check uses installed Windows Chrome and saves desktop/mobile screenshots under ignored `outputs/`.

## Stack and source

React 19, TypeScript, Vinext/Vite, Cloudflare Workers, D1 SQLite, Drizzle ORM, Web Crypto, Web Audio, and Lucide icons. The Sites integration and `.openai/hosting.json` retain deployment identity and storage bindings. Production SQL migrations are applied by Sites during publication.

- `app/cinema.tsx`: interface, discovery controls, account forms, trailers, music.
- `app/globals.css`: responsive visual design and animation.
- `lib/auth.ts`, `app/api/auth/`, `app/api/watchlist/`: accounts and private data.
- `lib/movie-provider.ts`, `app/api/movies/`: live providers, normalization, caching.
- `db/schema.ts`, `drizzle/`: durable schema and migration.
- [AUTH.md](AUTH.md): account security and API details.
- [DATA.md](DATA.md): provider behavior, limitations, attribution and sources.
