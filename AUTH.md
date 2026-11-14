# Accounts and saved movies

FRAME supports email/password accounts backed by Cloudflare D1 and native ChatGPT sign-in. In production, Sites controls who may visit the deployment; a FRAME email account does not bypass the private Site's access policy. Native ChatGPT identity is preserved and can own a watchlist without a second password.

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
- `POST /api/auth/logout` removes the email session. ChatGPT sessions sign out through `/signout-with-chatgpt?return_to=/` as top-level navigation.
- `POST /api/auth/forgot-password` with `{email}`. Success deliberately does not reveal whether the account exists.
- `POST /api/auth/reset-password` with `{token,password}`.
- `GET /api/watchlist` returns `{movies}`; `PUT` with `{movie}` saves it; `DELETE ?id=...` removes it. An authenticated user is required. Maximum 500 movies per owner.

JSON request bodies are required for form submissions. Errors return `{error:string}` with appropriate 4xx/503 status. No secret or password is stored in browser localStorage.

Local development uses the starter's loopback-only mock ChatGPT sign-in for the native option. Email accounts and D1 remain real local development data, separate from the hosted database. Apply the generated migrations before testing accounts.
