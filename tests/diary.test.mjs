import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import ts from "typescript";

const fixture = { env: {}, platform: null };
globalThis.__frameDiaryTest = fixture;
function moduleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString("base64")}`;
}
const authUrl = moduleUrl(readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8")
  .replace('import { env } from "cloudflare:workers";', "const env = globalThis.__frameDiaryTest.env;")
  .replace('import { getChatGPTUser } from "@/app/chatgpt-auth";', "const getChatGPTUser = async () => globalThis.__frameDiaryTest.platform;"));
const auth = await import(authUrl);
const diaryUrl = moduleUrl(readFileSync(new URL("../lib/diary.ts", import.meta.url), "utf8").replace('"@/lib/auth"', JSON.stringify(authUrl)));
const routes = await import(moduleUrl(readFileSync(new URL("../app/api/diary/route.ts", import.meta.url), "utf8")
  .replace('"@/lib/auth"', JSON.stringify(authUrl)).replace('"@/lib/diary"', JSON.stringify(diaryUrl))));
const origin = "https://frame.example";
const movie = {
  id: "seed-872585", title: "A Film", year: 2024, releaseDate: "2024-06-01", genres: ["Drama", "Adventure"],
  rating: 8.2, duration: 130, overview: "A memorable journey.", poster: "https://image.tmdb.org/t/p/w500/test.jpg", backdrop: "/arrakis-hero.jpg",
  trailer: "https://www.youtube.com/watch?v=sample", language: "Hindi", originalLanguage: "hi", industry: "bollywood", source: "TMDB", storeUrl: "https://tv.apple.com/movie/example",
};
const entry = { movie, rating: 4, note: "Stayed with me after the credits.", watchedAt: "2026-11-14" };

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrations = new URL("../drizzle/", import.meta.url);
  for (const file of readdirSync(migrations).filter(file => file.endsWith(".sql")).sort()) sqlite.exec(readFileSync(new URL(file, migrations), "utf8"));
  const db = {
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...bindings) { values = bindings; return statement; },
        async first() { return sqlite.prepare(sql).get(...values) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...values), success: true }; },
        async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) }, success: true }; },
      };
      return statement;
    },
    async batch(statements) {
      sqlite.exec("BEGIN TRANSACTION");
      try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec("COMMIT"); return result; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  fixture.env.DB = db;
  fixture.platform = null;
  return sqlite;
}

function request(method = "GET", data, cookie = "", path = "/api/diary", headers = {}) {
  return new Request(`${origin}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie, ...headers },
    ...(method === "PUT" ? { body: JSON.stringify(data) } : {}),
  });
}

async function member(address = "reader@example.com") {
  const response = await auth.register(new Request(`${origin}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ name: "Movie Reader", email: address, password: "long secure passphrase" }),
  }));
  assert.equal(response.status, 200);
  return { user: (await response.json()).user, cookie: response.headers.get("set-cookie").split(";")[0] };
}

test("diary records survive reads and edits while preserving external movie scores and source metadata", async () => {
  const sqlite = setup();
  try {
    const alice = await member();
    const saved = await routes.PUT(request("PUT", entry, alice.cookie));
    assert.equal(saved.status, 200, await saved.clone().text());
    const first = (await saved.json()).entry;
    assert.equal(first.rating, 4);
    assert.equal(first.movie.rating, 8.2);
    assert.equal(first.movie.industry, "bollywood");
    assert.equal(first.movie.originalLanguage, "hi");
    assert.equal(first.movie.source, "TMDB");
    assert.equal(first.movie.storeUrl, movie.storeUrl);
    const updated = { ...entry, rating: null, note: "Revisited it. <b>Still excellent.</b>", watchedAt: "2024-02-29" };
    assert.equal((await routes.PUT(request("PUT", updated, alice.cookie))).status, 200);
    const entries = (await (await routes.GET(request("GET", null, alice.cookie))).json()).entries;
    assert.equal(entries.length, 1);
    assert.equal(entries[0].rating, null);
    assert.equal(entries[0].movie.rating, 8.2);
    assert.equal(entries[0].note, updated.note);
    assert.equal(entries[0].watchedAt, "2024-02-29");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM movie_diary").get().count, 1);
  } finally { sqlite.close(); }
});

test("all diary operations require authentication and isolate owners, including identical movie ids", async () => {
  const sqlite = setup();
  try {
    for (const method of ["GET", "PUT", "DELETE"]) {
      const response = await routes[method](request(method, entry, "", method === "DELETE" ? `/api/diary?id=${movie.id}` : "/api/diary"));
      assert.equal(response.status, 401);
    }
    const alice = await member("alice@example.com");
    const bob = await member("bob@example.com");
    await routes.PUT(request("PUT", entry, alice.cookie));
    assert.deepEqual((await (await routes.GET(request("GET", null, bob.cookie))).json()).entries, []);
    await routes.DELETE(request("DELETE", null, bob.cookie, `/api/diary?id=${movie.id}`));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM movie_diary").get().count, 1);
    await routes.PUT(request("PUT", { ...entry, note: "Bob's own review", rating: 2 }, bob.cookie));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM movie_diary").get().count, 2);
    const aliceEntry = (await (await routes.GET(request("GET", null, alice.cookie))).json()).entries[0];
    assert.equal(aliceEntry.note, entry.note);
    assert.equal(aliceEntry.rating, 4);
    await routes.DELETE(request("DELETE", null, alice.cookie, `/api/diary?id=${movie.id}`));
    const bobEntries = (await (await routes.GET(request("GET", null, bob.cookie))).json()).entries;
    assert.equal(bobEntries.length, 1);
    assert.equal(bobEntries[0].note, "Bob's own review");
  } finally { sqlite.close(); }
});

test("diary validates calendar dates, personal stars, note size, movie identifiers and request origin", async () => {
  const sqlite = setup();
  try {
    const alice = await member();
    for (const change of [
      { watchedAt: "2026-02-29" }, { watchedAt: "2026-13-01" }, { watchedAt: "14/11/2026" },
      { rating: 0 }, { rating: 6 }, { rating: 4.5 }, { rating: "5" },
      { note: "x".repeat(1001) }, { note: { html: "bad" } },
      { movie: { ...movie, id: "x".repeat(151) } }, { movie: { ...movie, title: "" } },
    ]) {
      const response = await routes.PUT(request("PUT", { ...entry, ...change }, alice.cookie));
      assert.equal(response.status, 400, `Unexpected response for ${JSON.stringify(change)}`);
    }
    assert.equal((await routes.PUT(request("PUT", entry, alice.cookie, "/api/diary", { Origin: "https://untrusted.example" }))).status, 403);
    assert.equal((await routes.DELETE(request("DELETE", null, alice.cookie, `/api/diary?id=${movie.id}`, { Origin: "https://untrusted.example" }))).status, 403);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM movie_diary").get().count, 0);
  } finally { sqlite.close(); }
});

test("stored movies discard unsafe media URLs and extra fields without changing plain-text notes", async () => {
  const sqlite = setup();
  try {
    const alice = await member();
    const response = await routes.PUT(request("PUT", {
      ...entry, note: "<script>alert('just text')</script>",
      movie: { ...movie, poster: "javascript:bad()", backdrop: "//tracking.example/pixel", trailer: "/\\external.example/video", storeUrl: "https://user:secret@example.com/movie", genres: ["Drama", { genre: "bad" }], unknown: "discard" },
    }, alice.cookie));
    assert.equal(response.status, 200);
    const saved = (await response.json()).entry;
    assert.equal(saved.note, "<script>alert('just text')</script>");
    assert.equal(saved.movie.poster, "");
    assert.equal(saved.movie.backdrop, "");
    assert.equal(saved.movie.trailer, "");
    assert.equal(saved.movie.storeUrl, "");
    assert.deepEqual(saved.movie.genres, ["Drama"]);
    assert.equal(saved.movie.unknown, undefined);
  } finally { sqlite.close(); }
});

test("capacity is enforced on inserts while full passports remain editable and sorted by watched date", async () => {
  const sqlite = setup();
  try {
    const alice = await member();
    const insert = sqlite.prepare("INSERT INTO movie_diary (owner_id,movie_id,movie_json,personal_rating,note,watched_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)");
    for (let i = 0; i < 500; i++) insert.run(alice.user.id, `film-${i}`, JSON.stringify({ ...movie, id: `film-${i}` }), null, "", "2020-01-01", i, i);
    assert.equal((await routes.PUT(request("PUT", entry, alice.cookie))).status, 400);
    const edit = await routes.PUT(request("PUT", { ...entry, movie: { ...movie, id: "film-1" } }, alice.cookie));
    assert.equal(edit.status, 200);
    const entries = (await (await routes.GET(request("GET", null, alice.cookie))).json()).entries;
    assert.equal(entries.length, 500);
    assert.equal(entries[0].movie.id, "film-1");
    await routes.DELETE(request("DELETE", null, alice.cookie, "/api/diary?id=film-2"));
    assert.equal((await routes.PUT(request("PUT", entry, alice.cookie))).status, 200);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM movie_diary WHERE owner_id = ?").get(alice.user.id).count, 500);
  } finally { sqlite.close(); }
});

test("write throttling uses durable counters and recovers after its window expires", async () => {
  const sqlite = setup();
  try {
    const alice = await member();
    for (let i = 0; i < 100; i++) assert.equal((await routes.PUT(request("PUT", entry, alice.cookie))).status, 200);
    assert.equal((await routes.PUT(request("PUT", entry, alice.cookie))).status, 429);
    sqlite.prepare("UPDATE auth_limits SET window_end = 0").run();
    assert.equal((await routes.PUT(request("PUT", entry, alice.cookie))).status, 200);
  } finally { sqlite.close(); }
});
