import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export type AppUser = { id: string; name: string; email: string; provider: "email" | "chatgpt" | "google" | "facebook" };
type UserRow = { id: string; name: string; email: string; password_hash: string };
const SESSION_SECONDS = 60 * 60 * 24 * 14;
const COOKIE_NAME = "frame_session";
const encoder = new TextEncoder();

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function database(): D1Database {
  if (!env.DB) throw new ApiError(503, "Account storage is unavailable. Please try again later.");
  return env.DB;
}

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  responseHeaders.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

export function endpoint(fn: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try { return await fn(request); }
    catch (error) {
      if (error instanceof ApiError) return json({ error: error.message }, error.status);
      console.error("Account request failed", error instanceof Error ? error.name : "UnknownError");
      return json({ error: "The account service is temporarily unavailable. Please try again." }, 503);
    }
  };
}

export function sameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError(403, "This request must come from FRAME.");
  }
}

export async function body(request: Request): Promise<Record<string, unknown>> {
  sameOrigin(request);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "Please send a JSON request.");
  }
  if (Number(request.headers.get("content-length") ?? 0) > 16000) throw new ApiError(413, "Request too large.");
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  if (reader) {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 16000) { await reader.cancel(); throw new ApiError(413, "Request too large."); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch { throw new ApiError(400, "Please send a valid request."); }
}

export function email(value: unknown): string {
  if (typeof value !== "string") throw new ApiError(400, "Enter a valid email address.");
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new ApiError(400, "Enter a valid email address.");
  return normalized;
}

export function password(value: unknown): string {
  if (typeof value !== "string" || value.length < 10 || value.length > 128) throw new ApiError(400, "Use a password between 10 and 128 characters.");
  return value;
}

export function displayName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 2 || value.trim().length > 60) throw new ApiError(400, "Enter a name between 2 and 60 characters.");
  return value.trim();
}

function hex(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return Array.from(bytes, n => n.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], n => parseInt(n, 16));
}

export function randomToken(): string { return hex(crypto.getRandomValues(new Uint8Array(32))); }
export async function digest(value: string): Promise<string> { return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value))); }

export async function hashPassword(value: string, salt = hex(crypto.getRandomValues(new Uint8Array(16)))): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(value), "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: fromHex(salt), iterations: 100000, hash: "SHA-256" }, key, 256);
  return `pbkdf2-sha256$100000$${salt}$${hex(derived)}`;
}

export async function verifyPassword(value: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256" || parts[1] !== "100000") return false;
  const actual = await hashPassword(value, parts[2]);
  if (actual.length !== stored.length) return false;
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ stored.charCodeAt(i);
  return difference === 0;
}

export async function rateLimit(request: Request, action: string, subject = "", max = 10): Promise<void> {
  const db = database();
  const now = Date.now();
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const key = await digest(`${action}:${ip}:${subject}`);
  const result = await db.prepare(`INSERT INTO auth_limits (key, count, window_end) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN window_end < ? THEN 1 ELSE count + 1 END,
    window_end = CASE WHEN window_end < ? THEN excluded.window_end ELSE window_end END
    RETURNING count`).bind(key, now + 15 * 60 * 1000, now, now).first<{ count: number }>();
  if (!result || result.count > max) throw new ApiError(429, "Too many attempts. Please wait 15 minutes and try again.");
  if (crypto.getRandomValues(new Uint8Array(1))[0] < 8) {
    await db.prepare("DELETE FROM auth_limits WHERE window_end < ?").bind(now).run();
    await db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run();
    await db.prepare("DELETE FROM password_resets WHERE expires_at < ?").bind(now).run();
    await db.prepare("DELETE FROM oauth_sessions WHERE expires_at < ?").bind(now).run();
    await db.prepare("DELETE FROM oauth_requests WHERE expires_at < ?").bind(now).run();
  }
}

function sessionToken(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const value = cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

function sessionCookie(request: Request, value: string, maxAge: number): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function startSession(request: Request, user: UserRow | Omit<UserRow, "password_hash">): Promise<Response> {
  const token = randomToken();
  await database().prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await digest(token), user.id, Date.now() + SESSION_SECONDS * 1000).run();
  return json({ user: { id: user.id, name: user.name, email: user.email, provider: "email" } }, 200, { "Set-Cookie": sessionCookie(request, token, SESSION_SECONDS) });
}

export async function startOAuthSession(request: Request, user: AppUser): Promise<Response> {
  const token = randomToken();
  await database().prepare("INSERT INTO oauth_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)")
    .bind(await digest(token), user.id, Date.now() + SESSION_SECONDS * 1000).run();
  return json({ user }, 200, { "Set-Cookie": sessionCookie(request, token, SESSION_SECONDS) });
}

export async function endSession(request: Request): Promise<Response> {
  sameOrigin(request);
  const token = sessionToken(request);
  if (token) {
    const db = database();
    const hash = await digest(token);
    await db.batch([
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(hash),
      db.prepare("DELETE FROM oauth_sessions WHERE token_hash = ?").bind(hash),
    ]);
  }
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(request, "", 0) });
}

export async function currentUser(request: Request): Promise<AppUser | null> {
  const token = sessionToken(request);
  if (token) {
    const row = await database().prepare(`SELECT u.id, u.name, u.email FROM sessions s
      JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`)
      .bind(await digest(token), Date.now()).first<{ id: string; name: string; email: string }>();
    if (row) return { ...row, provider: "email" };
    const social = await database().prepare(`SELECT a.id, a.name, a.email, a.provider FROM oauth_sessions s
      JOIN oauth_accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?`)
      .bind(await digest(token), Date.now()).first<{ id: string; name: string; email: string; provider: "google" | "facebook" }>();
    if (social && (social.provider === "google" || social.provider === "facebook")) return social;
  }
  const platform = await getChatGPTUser();
  return platform ? { id: `chatgpt:${platform.userId}`, name: platform.displayName, email: platform.email, provider: "chatgpt" } : null;
}

export async function requireUser(request: Request): Promise<AppUser> {
  const user = await currentUser(request);
  if (!user) throw new ApiError(401, "Sign in to save your watchlist.");
  return user;
}

export async function register(request: Request): Promise<Response> {
  const data = await body(request);
  const normalizedEmail = email(data.email);
  const validPassword = password(data.password);
  const name = displayName(data.name);
  await rateLimit(request, "register", "", 6);
  const db = database();
  const existing = await db.prepare("SELECT id FROM users WHERE email = ?").bind(normalizedEmail).first();
  if (existing) throw new ApiError(409, "An account already uses this email. Sign in or reset your password.");
  const user = { id: crypto.randomUUID(), name, email: normalizedEmail };
  try {
    await db.prepare("INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(user.id, user.name, user.email, await hashPassword(validPassword), Date.now()).run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) throw new ApiError(409, "An account already uses this email.");
    throw error;
  }
  return startSession(request, user);
}

export async function login(request: Request): Promise<Response> {
  const data = await body(request);
  const normalizedEmail = email(data.email);
  const value = typeof data.password === "string" && data.password.length <= 128 ? data.password : "";
  await rateLimit(request, "login-ip", "", 30);
  await rateLimit(request, "login-account", normalizedEmail, 10);
  const row = await database().prepare("SELECT id, name, email, password_hash FROM users WHERE email = ?").bind(normalizedEmail).first<UserRow>();
  const dummy = "pbkdf2-sha256$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";
  const valid = await verifyPassword(value, row?.password_hash ?? dummy);
  if (!row || !valid) throw new ApiError(401, "The email or password is incorrect.");
  return startSession(request, row);
}

export async function forgotPassword(request: Request): Promise<Response> {
  const data = await body(request);
  const normalizedEmail = email(data.email);
  await rateLimit(request, "forgot-ip", "", 10);
  await rateLimit(request, "forgot-account", normalizedEmail, 3);
  if (!env.RESEND_API_KEY || !env.AUTH_FROM_EMAIL) throw new ApiError(503, "Password reset email is not configured yet. Please contact the app owner.");
  const db = database();
  const row = await db.prepare("SELECT id FROM users WHERE email = ?").bind(normalizedEmail).first<{ id: string }>();
  const result = { message: "If an account exists for this email, a password reset link will arrive shortly." };
  if (!row) return json(result);
  const token = randomToken();
  const tokenHash = await digest(token);
  await db.batch([
    db.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(row.id),
    db.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(tokenHash, row.id, Date.now() + 30 * 60 * 1000),
  ]);
  const resetUrl = `${new URL(request.url).origin}/?reset_token=${token}`;
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.AUTH_FROM_EMAIL, to: [normalizedEmail], subject: "Reset your FRAME password", text: `Reset your FRAME password using this single-use link (expires in 30 minutes):\n\n${resetUrl}\n\nIf you did not request this change, ignore this email.` }),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    await db.prepare("DELETE FROM password_resets WHERE token_hash = ?").bind(tokenHash).run();
    throw new ApiError(503, "Reset email could not be delivered. Please try again later.");
  }
  if (!response.ok) {
    await db.prepare("DELETE FROM password_resets WHERE token_hash = ?").bind(tokenHash).run();
    throw new ApiError(503, "Reset email could not be delivered. Please try again later.");
  }
  return json(result);
}

export async function resetPassword(request: Request): Promise<Response> {
  const data = await body(request);
  const newPassword = password(data.password);
  if (typeof data.token !== "string" || !/^[a-f0-9]{64}$/.test(data.token)) throw new ApiError(400, "This reset link is invalid or expired.");
  await rateLimit(request, "reset", "", 10);
  const db = database();
  const tokenHash = await digest(data.token);
  const now = Date.now();
  const row = await db.prepare("SELECT user_id FROM password_resets WHERE token_hash = ? AND expires_at > ?").bind(tokenHash, now).first<{ user_id: string }>();
  if (!row) throw new ApiError(400, "This reset link is invalid or expired. Request a new one.");
  const hashedPassword = await hashPassword(newPassword);
  const results = await db.batch([
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ? AND EXISTS (SELECT 1 FROM password_resets WHERE token_hash = ? AND expires_at > ?)").bind(hashedPassword, row.user_id, tokenHash, now),
    db.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(row.user_id),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.user_id),
  ]);
  if (!results[0].meta.changes) throw new ApiError(400, "This reset link has already been used.");
  return json({ message: "Password updated. Sign in with your new password." }, 200, { "Set-Cookie": sessionCookie(request, "", 0) });
}
