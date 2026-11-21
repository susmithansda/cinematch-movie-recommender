import { createD1Database } from "./d1-http";

let database: D1Database | undefined;

// Replaces cloudflare:workers only in the Next.js server bundle. Secrets are
// read at runtime, so the public pages can build before storage is configured.
export const env = {
  get DB(): D1Database | undefined {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID?.trim();
    const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN?.trim();
    if (!accountId || !databaseId || !apiToken) return undefined;
    return database ??= createD1Database({ accountId, databaseId, apiToken });
  },
  get RESEND_API_KEY() { return process.env.RESEND_API_KEY; },
  get AUTH_FROM_EMAIL() { return process.env.AUTH_FROM_EMAIL; },
  get TMDB_READ_ACCESS_TOKEN() { return process.env.TMDB_READ_ACCESS_TOKEN; },
  get GOOGLE_CLIENT_ID() { return process.env.GOOGLE_CLIENT_ID; },
  get GOOGLE_CLIENT_SECRET() { return process.env.GOOGLE_CLIENT_SECRET; },
  get FACEBOOK_CLIENT_ID() { return process.env.FACEBOOK_CLIENT_ID; },
  get FACEBOOK_CLIENT_SECRET() { return process.env.FACEBOOK_CLIENT_SECRET; },
};
