declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    RESEND_API_KEY?: string;
    AUTH_FROM_EMAIL?: string;
    TMDB_API_KEY?: string;
    TMDB_ACCESS_TOKEN?: string;
    TMDB_READ_ACCESS_TOKEN?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    FACEBOOK_CLIENT_ID?: string;
    FACEBOOK_CLIENT_SECRET?: string;
  }
}
