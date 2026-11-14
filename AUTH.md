# Accounts and saved movies

FRAME supports email/password accounts and optional Google and Facebook sign-in, backed by Cloudflare D1. In production, Sites controls who may visit the deployment; a FRAME account does not bypass the private Site's access policy. The existing platform identity remains supported for previously signed-in hosted visitors, while the app's sign-in choices are email, Google and Facebook.

Email accounts use random per-password salts, PBKDF2-SHA256 hashes, random opaque sessions stored as SHA256 hashes, and HttpOnly SameSite cookies. HTTPS sessions use Secure cookies. Sessions expire after 14 days. Account mutations validate request origin; login, registration and reset routes enforce database-backed attempt limits. Watchlist queries always scope records to the authenticated owner, including delete and upsert.

## Password reset setup

Set these server-only environment values in the hosted Site or ignored local `.dev.vars`:

```dotenv
RESEND_API_KEY=your-resend-api-key
AUTH_FROM_EMAIL=FRAME <accounts@your-verified-domain.example>
```

The sender must be verified with Resend. Reset emails contain a random single-use token valid for 30 minutes. The database stores only its SHA256 hash. Resetting a password invalidates all sessions and reset tokens for that account. The frontend handles `/?reset_token=...` and posts the chosen new password to `/api/auth/reset-password`. It should remove the token from the address bar immediately to reduce accidental sharing.

Without both email settings, the forgot-password endpoint returns HTTP 503 with a clear setup message. It never claims to have sent an email or displays a reset link. Actual email delivery requires configured credentials and has not been verified without them.

For optional TMDB live data, add the server-only `TMDB_READ_ACCESS_TOKEN` environment variable. Keyless live Apple catalog access and the visibly labelled curated fallback remain available without this token.

## API contract

- `POST /api/auth/register` with `{name,email,password}`; password length 10–128 characters.
- `POST /api/auth/login` with `{email,password}`.
- `GET /api/auth/me` returns `{user}` or `{user:null}`. User has `{id,name,email,provider}`.
- `POST /api/auth/logout` removes the email or social session. The outer platform session signs out through `/signout-with-chatgpt?return_to=/` as top-level navigation when needed.
- `POST /api/auth/forgot-password` with `{email}`. Success deliberately does not reveal whether the account exists.
- `POST /api/auth/reset-password` with `{token,password}`.
- `GET /api/watchlist` returns `{movies}`; `PUT` with `{movie}` saves it; `DELETE ?id=...` removes it. An authenticated user is required. Maximum 500 movies per owner.

JSON request bodies are required for form submissions. Errors return `{error:string}` with appropriate 4xx/503 status. No secret or password is stored in browser localStorage.

Local development includes the starter's loopback-only mock platform identity for testing hosted access. Email accounts and D1 remain real local development data, separate from the hosted database. Apply the generated migrations before testing accounts.

## Google and Facebook setup

The social buttons use real server-side OAuth authorization-code flows. Each provider needs its own registered developer application; FRAME cannot create provider credentials automatically. Configure these as server-only secrets in Sites, or in ignored local `.dev.vars` for development:

```dotenv
GOOGLE_CLIENT_ID=your-web-application-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
FACEBOOK_CLIENT_ID=your-meta-app-id
FACEBOOK_CLIENT_SECRET=your-meta-app-secret
```

For this deployment, register these exact authorized callback URLs:

- Google: `https://frame-cinema-discovery.merrybasin1.chatgpt.site/api/auth/oauth/google/callback`
- Facebook: `https://frame-cinema-discovery.merrybasin1.chatgpt.site/api/auth/oauth/facebook/callback`

When using another hostname, register that origin with the same callback path. Local testing also requires registering the exact local origin and callback path with the provider; development uses its own accounts and database. Google requires an OAuth web client and consent-screen configuration. Meta requires Facebook Login configuration, matching valid redirect URIs, and the necessary permissions/app availability for the intended users. Credentials alone do not prove the provider app is ready for public use.

`GET /api/auth/providers` exposes only `{google:boolean,facebook:boolean}`. Missing credentials return `false`; the button redirects back with a clear setup message rather than simulating a sign-in. Secrets and provider access tokens are never sent to the browser or persisted as account credentials.

Start sign-in by a normal top-level navigation to `/api/auth/oauth/google` or `/api/auth/oauth/facebook`. Callbacks use the paths above. Success establishes an opaque HttpOnly session and redirects to `/`. Failure redirects to `/?auth_error=...` with one of `google_unavailable`, `facebook_unavailable`, `oauth_cancelled`, `oauth_expired`, or `oauth_failed`; the frontend translates these into readable messages and removes the query parameter.

Both flows bind a random state to a ten-minute HttpOnly SameSite cookie and a hashed, single-use D1 state record. Google additionally uses S256 PKCE, then obtains the subject and verified email from Google's server-side authenticated userinfo endpoint. No unverified ID-token claims are accepted. Facebook uses a confidential authorization-code exchange, validates the token's app/user/expiry using `debug_token`, and calls the profile API with `appsecret_proof`. The Facebook API version is pinned to v26.0.

Accounts are keyed by the provider plus its immutable subject identifier, in a table separate from password accounts. Equal email addresses never silently link or merge accounts. Facebook email is optional display data and is never accepted as proof for linking or password recovery. Social accounts sign in again through their provider rather than using FRAME's email-password reset endpoint. Their watchlists and sessions remain isolated from any password account with the same address.

Actual Google/Facebook end-to-end sign-in requires configured provider apps and credentials. The automated tests mock only provider HTTP responses while exercising the real server code, state/PKCE handling, SQL, session cookies, replay rejection and account isolation.

Official references: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Google PKCE](https://developers.google.com/identity/protocols/oauth2/native-app), [Meta secure Graph requests](https://developers.facebook.com/docs/graph-api/guides/secure-requests), [Meta Graph API versions](https://developers.facebook.com/docs/graph-api/changelog/versions/).
