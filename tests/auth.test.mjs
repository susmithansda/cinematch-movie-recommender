import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import ts from "typescript";

// Run the actual server functions against SQLite with a small D1 API adapter.
// Only the platform environment/identity imports are replaced for Node's runner.
const fixture = { env: {}, platform: null };
globalThis.__frameAuthTest = fixture;
const source = readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8")
  .replace('import { env } from "cloudflare:workers";', "const env = globalThis.__frameAuthTest.env;")
  .replace('import { getChatGPTUser } from "@/app/chatgpt-auth";', "const getChatGPTUser = async () => globalThis.__frameAuthTest.platform;");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const authUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const auth = await import(authUrl);
const watchlistSource = readFileSync(new URL("../app/api/watchlist/route.ts", import.meta.url), "utf8").replace('"@/lib/auth"', JSON.stringify(authUrl));
const watchlist = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(watchlistSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString("base64")}`);
const origin = "https://frame.example";

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrations = new URL("../drizzle/", import.meta.url);
  const files = readdirSync(migrations).filter(file => file.endsWith(".sql")).sort();
  assert.ok(files.length, "Generate the D1 migrations before running account tests.");
  for (const file of files) sqlite.exec(readFileSync(new URL(file, migrations), "utf8"));
  const adapter = {
    prepare(sql) {
      let bindings = [];
      const statement = {
        bind(...args) { bindings = args; return statement; },
        async first() { return sqlite.prepare(sql).get(...bindings) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...bindings), success: true }; },
        async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...bindings).changes) }, success: true }; },
      };
      return statement;
    },
    async batch(statements) {
      sqlite.exec("BEGIN TRANSACTION");
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec("COMMIT"); return results; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  fixture.env.DB = adapter;
  delete fixture.env.RESEND_API_KEY;
  delete fixture.env.AUTH_FROM_EMAIL;
  fixture.platform = null;
  return sqlite;
}

function request(path, data, cookie = "", method = "POST", extra = {}) {
  return new Request(`${origin}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie, ...extra },
    ...(method !== "GET" ? { body: JSON.stringify(data ?? {}) } : {}),
  });
}

async function call(fn, path, data, cookie, method, extra) { return auth.endpoint(fn)(request(path, data, cookie, method, extra)); }
async function register(email = "reader@example.com") {
  const response = await call(auth.register, "/api/auth/register", { name: "Movie Lover", email, password: "long secure passphrase" });
  assert.equal(response.status, 200, await response.clone().text());
  return { response, cookie: response.headers.get("set-cookie").split(";")[0], user: (await response.json()).user };
}

test("registration hashes passwords and sessions; login rejects wrong passwords and normalizes email", async () => {
  const sqlite = setup();
  try {
    const { cookie, user, response } = await register("  Reader@EXAMPLE.com  ");
    assert.equal(user.email, "reader@example.com");
    assert.match(response.headers.get("set-cookie"), /HttpOnly; SameSite=Lax; Max-Age=1209600; Secure/);
    const row = sqlite.prepare("SELECT password_hash FROM users").get();
    assert.match(row.password_hash, /^pbkdf2-sha256\$100000\$/);
    assert.notEqual(row.password_hash, "long secure passphrase");
    assert.notEqual(sqlite.prepare("SELECT token_hash FROM sessions").get().token_hash, cookie.split("=")[1]);
    const correct = await call(auth.login, "/api/auth/login", { email: "READER@EXAMPLE.COM", password: "long secure passphrase" });
    assert.equal(correct.status, 200);
    const wrong = await call(auth.login, "/api/auth/login", { email: user.email, password: "wrong password" });
    assert.equal(wrong.status, 401);
    const unknown = await call(auth.login, "/api/auth/login", { email: "unknown@example.com", password: "wrong password" });
    assert.equal(unknown.status, 401);
    assert.equal((await wrong.json()).error, (await unknown.json()).error);
  } finally { sqlite.close(); }
});

test("session expiry, logout and native identity fallback", async () => {
  const sqlite = setup();
  try {
    const { cookie, user } = await register();
    assert.equal((await auth.currentUser(request("/api/auth/me", null, cookie, "GET"))).id, user.id);
    await call(auth.endSession, "/api/auth/logout", {}, cookie);
    assert.equal(await auth.currentUser(request("/api/auth/me", null, cookie, "GET")), null);
    const login = await call(auth.login, "/api/auth/login", { email: user.email, password: "long secure passphrase" });
    const newCookie = login.headers.get("set-cookie").split(";")[0];
    sqlite.prepare("UPDATE sessions SET expires_at = 0").run();
    assert.equal(await auth.currentUser(request("/api/auth/me", null, newCookie, "GET")), null);
    fixture.platform = { userId: "native-person", displayName: "Native Reader", email: "native@example.com" };
    assert.deepEqual(await auth.currentUser(request("/api/auth/me", null, "", "GET")), { id: "chatgpt:native-person", name: "Native Reader", email: "native@example.com", provider: "chatgpt" });
  } finally { sqlite.close(); }
});

test("watchlists isolate owners, upsert and sanitize saved movie records", async () => {
  const sqlite = setup();
  try {
    const alice = await register("alice@example.com");
    const bob = await register("bob@example.com");
    const movie = { id: "tmdb:123", title: "A Film", year: 2026, genres: ["Drama"], rating: null, duration: 130, poster: "javascript:bad()", overview: "A story", extra: "discard" };
    assert.equal((await watchlist.PUT(request("/api/watchlist", { movie }, alice.cookie, "PUT"))).status, 200);
    const aliceList = await (await watchlist.GET(request("/api/watchlist", null, alice.cookie, "GET"))).json();
    assert.equal(aliceList.movies.length, 1);
    assert.equal(aliceList.movies[0].poster, "");
    assert.equal(aliceList.movies[0].rating, null);
    assert.equal(aliceList.movies[0].duration, 130);
    assert.equal(aliceList.movies[0].extra, undefined);
    assert.equal((await (await watchlist.GET(request("/api/watchlist", null, bob.cookie, "GET"))).json()).movies.length, 0);
    await watchlist.DELETE(request("/api/watchlist?id=tmdb%3A123", {}, bob.cookie, "DELETE"));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM watchlist").get().n, 1);
    await watchlist.PUT(request("/api/watchlist", { movie: { ...movie, title: "Updated title" } }, alice.cookie, "PUT"));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM watchlist").get().n, 1);
    await watchlist.DELETE(request("/api/watchlist?id=tmdb%3A123", {}, alice.cookie, "DELETE"));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM watchlist").get().n, 0);
    assert.equal((await watchlist.GET(request("/api/watchlist", null, "", "GET"))).status, 401);
  } finally { sqlite.close(); }
});

test("reset requires email configuration, sends a hashed single-use token and revokes sessions", async () => {
  const sqlite = setup();
  const originalFetch = globalThis.fetch;
  try {
    const { cookie, user } = await register();
    assert.equal((await call(auth.forgotPassword, "/api/auth/forgot-password", { email: user.email })).status, 503);
    fixture.env.RESEND_API_KEY = "test-secret";
    fixture.env.AUTH_FROM_EMAIL = "FRAME <test@example.com>";
    let emailBody;
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.resend.com/emails");
      emailBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
    };
    const sent = await call(auth.forgotPassword, "/api/auth/forgot-password", { email: user.email });
    assert.equal(sent.status, 200);
    const token = emailBody.text.match(/reset_token=([a-f0-9]{64})/)[1];
    const row = sqlite.prepare("SELECT token_hash FROM password_resets").get();
    assert.notEqual(row.token_hash, token);
    assert.equal(row.token_hash, await auth.digest(token));
    const unknown = await call(auth.forgotPassword, "/api/auth/forgot-password", { email: "unknown@example.com" });
    assert.deepEqual(await unknown.json(), await sent.json());
    const reset = await call(auth.resetPassword, "/api/auth/reset-password", { token, password: "a changed password" });
    assert.equal(reset.status, 200);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 0);
    assert.equal(await auth.currentUser(request("/api/auth/me", null, cookie, "GET")), null);
    assert.equal((await call(auth.resetPassword, "/api/auth/reset-password", { token, password: "another changed password" })).status, 400);
    assert.equal((await call(auth.login, "/api/auth/login", { email: user.email, password: "long secure passphrase" })).status, 401);
    assert.equal((await call(auth.login, "/api/auth/login", { email: user.email, password: "a changed password" })).status, 200);
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});

test("cross-origin mutations, invalid input and repeated login attempts are rejected", async () => {
  const sqlite = setup();
  try {
    assert.equal((await call(auth.register, "/api/auth/register", { name: "Movie Lover", email: "reader@example.com", password: "long secure passphrase" }, "", "POST", { Origin: "https://untrusted.example" })).status, 403);
    assert.equal((await call(auth.register, "/api/auth/register", { name: "Movie Lover", email: "bad email", password: "long secure passphrase" })).status, 400);
    assert.equal((await call(auth.register, "/api/auth/register", { name: "Movie Lover", email: "reader@example.com", password: "short" })).status, 400);
    assert.equal((await call(auth.register, "/api/auth/register", { name: "Movie Lover", email: "reader@example.com", password: "x".repeat(17000) })).status, 413);
    let status;
    for (let i = 0; i < 11; i++) status = (await call(auth.login, "/api/auth/login", { email: "unknown@example.com", password: "wrong password" })).status;
    assert.equal(status, 429);
  } finally { sqlite.close(); }
});

test("expired reset links and failed email delivery never leave a usable reset path", async () => {
  const sqlite = setup();
  const originalFetch = globalThis.fetch;
  try {
    const { user } = await register();
    fixture.env.RESEND_API_KEY = "test-secret";
    fixture.env.AUTH_FROM_EMAIL = "FRAME <test@example.com>";
    let token;
    globalThis.fetch = async (_url, options) => {
      token = JSON.parse(options.body).text.match(/reset_token=([a-f0-9]{64})/)[1];
      return new Response("{}", { status: 200 });
    };
    assert.equal((await call(auth.forgotPassword, "/api/auth/forgot-password", { email: user.email })).status, 200);
    sqlite.prepare("UPDATE password_resets SET expires_at = 0").run();
    assert.equal((await call(auth.resetPassword, "/api/auth/reset-password", { token, password: "a changed password" })).status, 400);
    globalThis.fetch = async () => new Response("provider error", { status: 403 });
    const failed = await call(auth.forgotPassword, "/api/auth/forgot-password", { email: user.email });
    assert.equal(failed.status, 503);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM password_resets").get().n, 0);
    assert.equal((await call(auth.login, "/api/auth/login", { email: user.email, password: "long secure passphrase" })).status, 200);
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});
