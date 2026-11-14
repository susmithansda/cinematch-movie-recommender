import { env } from "cloudflare:workers";
import { ApiError, type AppUser, database, digest, email, json, randomToken, rateLimit, sameOrigin, startOAuthSession } from "@/lib/auth";

export type OAuthProvider = "google" | "facebook";
const STATE_SECONDS = 600;
const FACEBOOK_API = "https://graph.facebook.com/v26.0";
const encoder = new TextEncoder();

function credentials(provider: OAuthProvider): { id: string; secret: string } | null {
  const id = (provider === "google" ? env.GOOGLE_CLIENT_ID : env.FACEBOOK_CLIENT_ID)?.trim();
  const secret = (provider === "google" ? env.GOOGLE_CLIENT_SECRET : env.FACEBOOK_CLIENT_SECRET)?.trim();
  return id && secret ? { id, secret } : null;
}

export function providers(): Response {
  return json({ google: Boolean(credentials("google")), facebook: Boolean(credentials("facebook")) });
}

function cookieName(provider: OAuthProvider): string { return `frame_oauth_${provider}`; }
function stateCookie(request: Request, provider: OAuthProvider, value: string, maxAge = STATE_SECONDS): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${cookieName(provider)}=${value}; Path=/api/auth/oauth/${provider}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function callbackUrl(request: Request, provider: OAuthProvider): string {
  return `${new URL(request.url).origin}/api/auth/oauth/${provider}/callback`;
}

function redirect(location: string, cookie?: string, status = 303): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(null, { status, headers });
}

function failure(request: Request, provider: OAuthProvider, code: string): Response {
  return redirect(`/?auth_error=${encodeURIComponent(code)}`, stateCookie(request, provider, "", 0));
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function challenge(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));
}

function equal(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

export async function beginOAuth(request: Request, provider: OAuthProvider): Promise<Response> {
  const config = credentials(provider);
  if (!config) return failure(request, provider, `${provider}_unavailable`);
  try {
    sameOrigin(request);
    await rateLimit(request, "oauth-start", "", 20);
    const state = randomToken();
    const verifier = provider === "google" ? randomToken() : "";
    const db = database();
    await db.prepare("DELETE FROM oauth_requests WHERE expires_at < ?").bind(Date.now()).run();
    await db.prepare("INSERT INTO oauth_requests (state_hash, provider, code_verifier, expires_at) VALUES (?, ?, ?, ?)")
      .bind(await digest(state), provider, verifier, Date.now() + STATE_SECONDS * 1000).run();
    const url = new URL(provider === "google" ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://www.facebook.com/v26.0/dialog/oauth");
    url.searchParams.set("client_id", config.id);
    url.searchParams.set("redirect_uri", callbackUrl(request, provider));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    url.searchParams.set("scope", provider === "google" ? "openid email profile" : "public_profile,email");
    if (provider === "google") {
      url.searchParams.set("code_challenge", await challenge(verifier));
      url.searchParams.set("code_challenge_method", "S256");
      url.searchParams.set("prompt", "select_account");
    }
    return redirect(url.toString(), stateCookie(request, provider, state), 302);
  } catch (error) {
    console.error("OAuth start failed", error instanceof ApiError ? error.status : "service");
    return failure(request, provider, "oauth_failed");
  }
}

async function providerJson(url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new ApiError(502, "Sign-in provider could not complete this request.");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new ApiError(502, "Invalid provider response.");
  return data as Record<string, unknown>;
}

function token(data: Record<string, unknown>): string {
  if (typeof data.access_token !== "string" || !data.access_token || data.access_token.length > 16000) throw new ApiError(502, "Missing provider access token.");
  if (data.token_type && String(data.token_type).toLowerCase() !== "bearer") throw new ApiError(502, "Unexpected provider access token.");
  return data.access_token;
}

function subject(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 255 || !/^[\x21-\x7e]+$/.test(value)) throw new ApiError(502, "Missing provider identity.");
  return value;
}

type SocialProfile = { subject: string; name: string; email: string };

async function googleProfile(request: Request, code: string, verifier: string, config: { id: string; secret: string }): Promise<SocialProfile> {
  const tokens = await providerJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: config.id, client_secret: config.secret, redirect_uri: callbackUrl(request, "google"), grant_type: "authorization_code", code_verifier: verifier }),
  });
  // Identity comes from Google's authenticated userinfo endpoint, not an
  // unverified JWT decoded in the browser. Provider tokens never reach clients.
  const profile = await providerJson("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token(tokens)}` },
  });
  if (profile.email_verified !== true) throw new ApiError(403, "A verified Google email is required.");
  const address = email(profile.email);
  return {
    subject: subject(profile.sub),
    name: typeof profile.name === "string" && profile.name.trim() ? profile.name.trim().slice(0, 60) : address.split("@")[0],
    email: address,
  };
}

async function appSecretProof(accessToken: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(accessToken))), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function facebookProfile(request: Request, code: string, config: { id: string; secret: string }): Promise<SocialProfile> {
  const tokens = await providerJson(`${FACEBOOK_API}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: config.id, client_secret: config.secret, redirect_uri: callbackUrl(request, "facebook") }),
  });
  const accessToken = token(tokens);
  const debugUrl = new URL(`${FACEBOOK_API}/debug_token`);
  debugUrl.searchParams.set("input_token", accessToken);
  const debug = await providerJson(debugUrl.toString(), { headers: { Authorization: `Bearer ${config.id}|${config.secret}` } });
  const data = debug.data as Record<string, unknown> | undefined;
  const now = Math.floor(Date.now() / 1000);
  if (!data || data.is_valid !== true || data.app_id !== config.id || typeof data.expires_at !== "number" || data.expires_at <= now) {
    throw new ApiError(403, "Invalid Facebook login token.");
  }
  if (typeof data.data_access_expires_at === "number" && data.data_access_expires_at > 0 && data.data_access_expires_at <= now) throw new ApiError(403, "Facebook data access has expired.");
  const facebookSubject = subject(data.user_id);
  const profileUrl = new URL(`${FACEBOOK_API}/me`);
  profileUrl.searchParams.set("fields", "id,name,email");
  profileUrl.searchParams.set("appsecret_proof", await appSecretProof(accessToken, config.secret));
  const profile = await providerJson(profileUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (subject(profile.id) !== facebookSubject) throw new ApiError(403, "Facebook profile does not match the login token.");
  // Facebook may omit email; it is display data, never an account linking key
  // or a password-recovery address. The app-scoped id identifies this account.
  let address = "";
  try { if (profile.email) address = email(profile.email); } catch { /* optional display field */ }
  return {
    subject: facebookSubject,
    name: typeof profile.name === "string" && profile.name.trim() ? profile.name.trim().slice(0, 60) : "Facebook member",
    email: address,
  };
}

async function socialAccount(provider: OAuthProvider, profile: SocialProfile): Promise<AppUser> {
  const row = await database().prepare(`INSERT INTO oauth_accounts (id, provider, subject, name, email, created_at)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(provider, subject) DO UPDATE SET name = excluded.name, email = excluded.email
    RETURNING id, name, email, provider`)
    .bind(`oauth:${crypto.randomUUID()}`, provider, profile.subject, profile.name, profile.email, Date.now())
    .first<{ id: string; name: string; email: string; provider: OAuthProvider }>();
  if (!row) throw new ApiError(503, "Could not create the account session.");
  return row;
}

export async function finishOAuth(request: Request, provider: OAuthProvider): Promise<Response> {
  const config = credentials(provider);
  if (!config) return failure(request, provider, `${provider}_unavailable`);
  try {
    const url = new URL(request.url);
    const state = url.searchParams.get("state") ?? "";
    const cookie = (request.headers.get("cookie") ?? "").split(";").map(value => value.trim())
      .find(value => value.startsWith(`${cookieName(provider)}=`))?.slice(cookieName(provider).length + 1) ?? "";
    if (!/^[a-f0-9]{64}$/.test(state) || !equal(state, cookie)) return failure(request, provider, "oauth_expired");
    // Atomic consumption prevents a callback from being replayed, including
    // concurrent requests that arrive before either provider request completes.
    const pending = await database().prepare("DELETE FROM oauth_requests WHERE state_hash = ? AND provider = ? AND expires_at > ? RETURNING code_verifier")
      .bind(await digest(state), provider, Date.now()).first<{ code_verifier: string }>();
    if (!pending) return failure(request, provider, "oauth_expired");
    if (url.searchParams.has("error")) return failure(request, provider, "oauth_cancelled");
    const code = url.searchParams.get("code");
    if (!code || code.length > 4096) return failure(request, provider, "oauth_failed");
    const profile = provider === "google"
      ? await googleProfile(request, code, pending.code_verifier, config)
      : await facebookProfile(request, code, config);
    const account = await socialAccount(provider, profile);
    const session = await startOAuthSession(request, account);
    const response = redirect("/", stateCookie(request, provider, "", 0));
    const cookieHeader = session.headers.get("set-cookie");
    if (cookieHeader) response.headers.append("Set-Cookie", cookieHeader);
    return response;
  } catch (error) {
    console.error("OAuth callback failed", error instanceof ApiError ? error.status : "service");
    return failure(request, provider, "oauth_failed");
  }
}
