# Deploy FRAME on Vercel

The original build targets Cloudflare Workers through Vinext. It does not
produce the Next.js `.next/routes-manifest.json` that Vercel expects. This
checkout includes a separate Next.js build and a `vercel.json` that selects it;
the existing Vinext commands still support Cloudflare development and hosting.

## Build settings

Commit and push the changed files to the GitHub repository connected to Vercel.
In Vercel's project settings, use:

| Setting | Value |
| --- | --- |
| Framework Preset | Next.js |
| Root Directory | Directory containing this `package.json` and `vercel.json` |
| Build Command | `npm run build:vercel` |
| Install Command | `npm ci` |
| Output Directory | `.next` (the Next.js default) |
| Node.js Version | 24.x |

In this workspace, `frame/` is itself a Git repository, with `package.json` at
its root. If that is the repository imported into Vercel, leave Root Directory
as `.`. Select `frame` only if your GitHub repository contains the outer folder
and the application is nested inside it. The other build settings are also
declared in `vercel.json`.

After pushing, deploy the new commit. Redeploying the original commit will
keep using the old Vinext build.

## Database and secrets

Movie and music browsing can run without account storage. Accounts, OAuth,
watchlists, and the diary need a Cloudflare D1 database. The Next.js server
connects to D1 using Cloudflare's HTTPS API because Vercel has no Worker bindings.

1. Create a D1 database in your own Cloudflare account, or use an existing D1
   database you administer. Local `.wrangler` data is separate and is not
   uploaded by deploying to Vercel.
2. For a **new empty database**, run the SQL in `drizzle/0000_mushy_human_fly.sql`,
   `drizzle/0001_icy_xavin.sql`, and `drizzle/0002_powerful_war_machine.sql`, in
   order, using the D1 dashboard console or Wrangler. Do not rerun these on an
   already migrated database. Vercel builds do not apply database migrations.
3. Create a Cloudflare API token with **Account > D1 > Edit** permission,
   restricted to the account containing that database.
4. In **Vercel > Project Settings > Environment Variables**, add
   `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, and
   `CLOUDFLARE_D1_API_TOKEN` for the environments you deploy.
5. Add optional provider values from `.env.example`. Vercel does not read the
   local `.dev.vars` file. Keep all credentials server-only.
6. Redeploy after changing environment variables. Without the three database
   values, account operations return a clear service-unavailable response.

For Google/Facebook sign-in, register the exact production callback URLs with
the provider, such as `https://your-domain/api/auth/oauth/google/callback`.
Password-reset emails also need `RESEND_API_KEY` and a verified
`AUTH_FROM_EMAIL` sender.

Cloudflare's D1 REST API shares Cloudflare's global API rate limit and is best
suited to low-volume use. For a busy public application, use a protected Worker
database API or migrate storage to a database designed for direct serverless
connections. See [Cloudflare's D1 access guidance](https://developers.cloudflare.com/d1/tutorials/build-an-api-to-access-d1/).

The Sites gateway's private audience policy does not apply to a Vercel
deployment. FRAME's private library data still requires a FRAME account.
Next.js ignores the Sites identity headers to prevent impersonation.

## Verify locally

Requires Node.js 22.13 or newer; Node.js 24 is recommended.

```powershell
npm ci
npm test
npm run build:vercel
npm run start:vercel
```

Open `http://localhost:3000`. For Next.js development, copy `.env.example` to
the ignored `.env.local`, fill in the needed values, and run `npm run dev:vercel`.
The existing `npm run dev`, `npm run build`, and `npm start` commands continue
to use Vinext/Cloudflare and `.dev.vars`.

Vercel's [build configuration reference](https://vercel.com/docs/builds/configure-a-build)
describes the framework, root directory, and output settings.
