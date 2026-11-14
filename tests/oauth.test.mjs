import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import ts from "typescript";

const fixture = { env: {}, platform: null };
globalThis.__frameOauthTest = fixture;
function moduleUrl(source) {
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
}
const authSource = readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8")
  .replace('import { env } from "cloudflare:workers";', "const env = globalThis.__frameOauthTest.env;")
  .replace('import { getChatGPTUser } from "@/app/chatgpt-auth";', "const getChatGPTUser = async () => globalThis.__frameOauthTest.platform;");
const authUrl = moduleUrl(authSource);
const auth = await import(authUrl);
const oauthSource = readFileSync(new URL("../lib/oauth.ts", import.meta.url), "utf8")
  .replace('import { env } from "cloudflare:workers";', "const env = globalThis.__frameOauthTest.env;")
  .replace('"@/lib/auth"', JSON.stringify(authUrl));
const oauth = await import(moduleUrl(oauthSource));
const origin = "https://frame.example";
const originalFetch = globalThis.fetch;

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrations = new URL("../drizzle/", import.meta.url);
  for (const file of readdirSync(migrations).filter(file => file.endsWith(".sql")).sort()) sqlite.exec(readFileSync(new URL(file, migrations), "utf8"));
  const db = {
    prepare(sql) {
      let bindings = [];
      const statement = {
        bind(...values) { bindings = values; return statement; },
        async first() { return sqlite.prepare(sql).get(...bindings) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...bindings), success: true }; },
        async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...bindings).changes) }, success: true }; },
      };
      return statement;
    },
    async batch(statements) {
      sqlite.exec("BEGIN TRANSACTION");
      try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec("COMMIT"); return result; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  for (const key of Object.keys(fixture.env)) delete fixture.env[key];
  fixture.env.DB = db;
  fixture.env.GOOGLE_CLIENT_ID = "google-web-client";
  fixture.env.GOOGLE_CLIENT_SECRET = "google-secret";
  fixture.env.FACEBOOK_CLIENT_ID = "123456";
  fixture.env.FACEBOOK_CLIENT_SECRET = "facebook-secret";
  fixture.platform = null;
  globalThis.fetch = async () => { throw new Error("Unexpected upstream request"); };
  return sqlite;
}

function request(path, cookie = "", headers = {}) {
  return new Request(`${origin}${path}`, { headers: { Cookie: cookie, ...headers } });
}
function cookie(response, name) {
  return response.headers.getSetCookie().find(value => value.startsWith(`${name}=`))?.split(";")[0];
}
async function start(provider = "google") {
  const response = await oauth.beginOAuth(request(`/api/auth/oauth/${provider}`), provider);
  assert.equal(response.status, 302);
  const url = new URL(response.headers.get("location"));
  return { response, url, state: url.searchParams.get("state"), cookie: cookie(response, `frame_oauth_${provider}`) };
}
function callback(provider, pending, query = "code=one-time-code") {
  return oauth.finishOAuth(request(`/api/auth/oauth/${provider}/callback?state=${pending.state}&${query}`, pending.cookie), provider);
}
function response(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function googleUpstream(profile = {}) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url === "https://oauth2.googleapis.com/token") return response({ access_token: "google-access", token_type: "Bearer" });
    if (url === "https://openidconnect.googleapis.com/v1/userinfo") return response({ sub: "google-subject", name: "Google Reader", email: "reader@example.com", email_verified: true, ...profile });
    throw new Error("Unexpected upstream request");
  };
  return calls;
}
function cleanup(sqlite) { globalThis.fetch = originalFetch; sqlite.close(); }

test("provider configuration exposes booleans only; missing credentials never create sessions", async () => {
  const sqlite = setup();
  try {
    assert.deepEqual(await oauth.providers().json(), { google: true, facebook: true });
    delete fixture.env.GOOGLE_CLIENT_SECRET;
    delete fixture.env.FACEBOOK_CLIENT_ID;
    assert.deepEqual(await oauth.providers().json(), { google: false, facebook: false });
    assert.equal((await oauth.beginOAuth(request("/api/auth/oauth/google"), "google")).headers.get("location"), "/?auth_error=google_unavailable");
    assert.equal((await oauth.beginOAuth(request("/api/auth/oauth/facebook"), "facebook")).headers.get("location"), "/?auth_error=facebook_unavailable");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM oauth_requests").get().n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM oauth_sessions").get().n, 0);
  } finally { cleanup(sqlite); }
});

test("Google uses state, S256 PKCE and verified server profile; callback creates a private session", async () => {
  const sqlite = setup();
  try {
    const pending = await start();
    assert.equal(pending.url.origin, "https://accounts.google.com");
    assert.equal(pending.url.searchParams.get("redirect_uri"), `${origin}/api/auth/oauth/google/callback`);
    assert.equal(pending.url.searchParams.get("scope"), "openid email profile");
    assert.equal(pending.url.searchParams.get("code_challenge_method"), "S256");
    assert.match(pending.state, /^[a-f0-9]{64}$/);
    assert.match(pending.response.headers.get("set-cookie"), /HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
    const row = sqlite.prepare("SELECT state_hash, code_verifier FROM oauth_requests").get();
    assert.equal(row.state_hash, await auth.digest(pending.state));
    assert.notEqual(row.state_hash, pending.state);
    assert.equal(pending.url.searchParams.get("code_challenge"), createHash("sha256").update(row.code_verifier).digest("base64url"));
    const calls = googleUpstream();
    const finished = await callback("google", pending);
    assert.equal(finished.status, 303);
    assert.equal(finished.headers.get("location"), "/");
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.body.get("code_verifier"), row.code_verifier);
    assert.equal(calls[0].options.body.get("client_secret"), "google-secret");
    assert.equal(calls[1].options.headers.Authorization, "Bearer google-access");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM oauth_requests").get().n, 0);
    const sessionCookie = cookie(finished, "frame_session");
    assert.ok(sessionCookie);
    assert.notEqual(sqlite.prepare("SELECT token_hash FROM oauth_sessions").get().token_hash, sessionCookie.split("=")[1]);
    const user = await auth.currentUser(request("/api/auth/me", sessionCookie));
    assert.equal(user.provider, "google");
    assert.equal(user.email, "reader@example.com");
    assert.match(user.id, /^oauth:/);
    assert.ok(!JSON.stringify(sqlite.prepare("SELECT * FROM oauth_accounts").get()).includes("google-access"));
    await auth.endSession(request("/api/auth/logout", sessionCookie));
    assert.equal(await auth.currentUser(request("/api/auth/me", sessionCookie)), null);
  } finally { cleanup(sqlite); }
});

test("state is browser-bound, provider-bound, expiring and single-use", async () => {
  const sqlite = setup();
  try {
    const pending = await start();
    const calls = googleUpstream();
    const stolen = await oauth.finishOAuth(request(`/api/auth/oauth/google/callback?state=${pending.state}&code=one-time-code`), "google");
    assert.equal(stolen.headers.get("location"), "/?auth_error=oauth_expired");
    assert.equal(calls.length, 0);
    const wrongProvider = await oauth.finishOAuth(request(`/api/auth/oauth/facebook/callback?state=${pending.state}&code=code`, pending.cookie), "facebook");
    assert.equal(wrongProvider.headers.get("location"), "/?auth_error=oauth_expired");
    assert.equal((await callback("google", pending)).headers.get("location"), "/");
    assert.equal((await callback("google", pending)).headers.get("location"), "/?auth_error=oauth_expired");
    assert.equal(calls.length, 2);
    const expired = await start();
    sqlite.prepare("UPDATE oauth_requests SET expires_at = 0").run();
    assert.equal((await callback("google", expired)).headers.get("location"), "/?auth_error=oauth_expired");
    assert.equal(calls.length, 2);
    const cancelled = await start();
    assert.equal((await callback("google", cancelled, "error=access_denied")).headers.get("location"), "/?auth_error=oauth_cancelled");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM oauth_requests").get().n, 0);
  } finally { cleanup(sqlite); }
});

test("unverified Google emails and failed token exchanges cannot sign in", async () => {
  const sqlite = setup();
  try {
    const unverified = await start();
    googleUpstream({ email_verified: false });
    assert.equal((await callback("google", unverified)).headers.get("location"), "/?auth_error=oauth_failed");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM oauth_accounts").get().n, 0);
    const denied = await start();
    globalThis.fetch = async () => response({ error: "invalid_grant" }, 400);
    assert.equal((await callback("google", denied)).headers.get("location"), "/?auth_error=oauth_failed");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM oauth_sessions").get().n, 0);
    assert.equal((await callback("google", denied)).headers.get("location"), "/?auth_error=oauth_expired");
  } finally { cleanup(sqlite); }
});

test("social identities never merge with password accounts or with matching emails from another subject", async () => {
  const sqlite = setup();
  try {
    const registered = await auth.register(new Request(`${origin}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ name: "Password Reader", email: "reader@example.com", password: "long secure passphrase" }) }));
    const passwordUser = (await registered.json()).user;
    googleUpstream();
    const first = await callback("google", await start());
    const firstUser = await auth.currentUser(request("/api/auth/me", cookie(first, "frame_session")));
    assert.notEqual(firstUser.id, passwordUser.id);
    const again = await callback("google", await start());
    assert.equal((await auth.currentUser(request("/api/auth/me", cookie(again, "frame_session")))).id, firstUser.id);
    googleUpstream({ sub: "another-google-subject" });
    const different = await callback("google", await start());
    assert.notEqual((await auth.currentUser(request("/api/auth/me", cookie(different, "frame_session")))).id, firstUser.id);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM users").get().n, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM oauth_accounts").get().n, 2);
  } finally { cleanup(sqlite); }
});

test("Facebook verifies token app and subject, adds appsecret_proof, and supports profiles without email", async () => {
  const sqlite = setup();
  try {
    const pending = await start("facebook");
    assert.equal(pending.url.origin, "https://www.facebook.com");
    assert.equal(pending.url.pathname, "/v26.0/dialog/oauth");
    assert.equal(pending.url.searchParams.get("redirect_uri"), `${origin}/api/auth/oauth/facebook/callback`);
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/oauth/access_token")) return response({ access_token: "facebook-access", token_type: "bearer" });
      if (parsed.pathname.endsWith("/debug_token")) return response({ data: { app_id: "123456", user_id: "facebook-person", is_valid: true, expires_at: Math.floor(Date.now() / 1000) + 3600 } });
      if (parsed.pathname.endsWith("/me")) return response({ id: "facebook-person", name: "Facebook Reader" });
      throw new Error("Unexpected upstream request");
    };
    const finished = await callback("facebook", pending);
    assert.equal(finished.headers.get("location"), "/");
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.body.get("client_secret"), "facebook-secret");
    assert.equal(calls[1].options.headers.Authorization, "Bearer 123456|facebook-secret");
    assert.equal(new URL(calls[2].url).searchParams.get("appsecret_proof"), createHmac("sha256", "facebook-secret").update("facebook-access").digest("hex"));
    assert.equal(calls[2].options.headers.Authorization, "Bearer facebook-access");
    const user = await auth.currentUser(request("/api/auth/me", cookie(finished, "frame_session")));
    assert.equal(user.provider, "facebook");
    assert.equal(user.email, "");
    const next = await start("facebook");
    globalThis.fetch = async url => new URL(url).pathname.endsWith("/oauth/access_token")
      ? response({ access_token: "wrong-app-access" })
      : response({ data: { app_id: "another-app", user_id: "facebook-person", is_valid: true, expires_at: Math.floor(Date.now() / 1000) + 3600 } });
    assert.equal((await callback("facebook", next)).headers.get("location"), "/?auth_error=oauth_failed");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM oauth_sessions").get().n, 1);
  } finally { cleanup(sqlite); }
});
