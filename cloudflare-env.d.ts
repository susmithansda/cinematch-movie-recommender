declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    RESEND_API_KEY?: string;
    AUTH_FROM_EMAIL?: string;
    TMDB_API_KEY?: string;
    TMDB_ACCESS_TOKEN?: string;
    TMDB_READ_ACCESS_TOKEN?: string;
  }
}
