import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../lib/d1-http.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { createD1Database } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const config = { accountId: "account-id", databaseId: "database-id", apiToken: "private-token" };
const queryResult = (results = [], changes = 0) => ({ success: true, results, meta: { changes, duration: 1 } });
const response = (...result) => Response.json({ success: true, errors: [], result });

test("parameterized reads preserve SQL, normalize bindings, and bypass caching", async () => {
  const requests = [];
  const db = createD1Database(config, async (url, init) => {
    requests.push({ url, init });
    return response(queryResult([{ id: "user-1", name: "A reader" }]));
  });
  const sql = "SELECT id, name FROM users WHERE email = ? AND enabled = ?";
  const row = await db.prepare(sql).bind("reader@example.com' OR 1=1", true).first();
  assert.deepEqual(row, { id: "user-1", name: "A reader" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.cloudflare.com/client/v4/accounts/account-id/d1/database/database-id/query");
  assert.deepEqual(JSON.parse(requests[0].init.body), { sql, params: ["reader@example.com' OR 1=1", 1] });
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.headers.Authorization, "Bearer private-token");
  assert.equal(requests[0].init.cache, "no-store");
  assert.equal(requests[0].init.redirect, "error");
  assert.ok(requests[0].init.signal instanceof AbortSignal);
});

test("first returns null for no rows, supports selected columns, and rejects missing columns", async () => {
  let result = [];
  const db = createD1Database(config, async () => response(queryResult(result)));
  assert.equal(await db.prepare("SELECT id FROM users").first(), null);
  assert.equal(await db.prepare("SELECT id FROM users").first("id"), null);
  result = [{ id: "user-1", nickname: null }];
  assert.equal(await db.prepare("SELECT id FROM users").first("id"), "user-1");
  assert.equal(await db.prepare("SELECT nickname FROM users").first("nickname"), null);
  await assert.rejects(db.prepare("SELECT id FROM users").first("toString"), /column is unavailable/);
});

test("bound statements remain independent and all/run preserve rows and mutation metadata", async () => {
  const bodies = [];
  const db = createD1Database(config, async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return response(queryResult([{ count: 1 }], 1));
  });
  const base = db.prepare("SELECT count FROM totals WHERE id = ?");
  const one = base.bind(1), two = base.bind(2);
  assert.deepEqual((await one.all()).results, [{ count: 1 }]);
  assert.equal((await two.run()).meta.changes, 1);
  await base.all();
  assert.deepEqual(bodies.map(body => body.params), [[1], [2], []]);
});

test("batch sends one transactional request with ordered parameterized statements", async () => {
  const bodies = [];
  const db = createD1Database(config, async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return response(queryResult([], 1), queryResult([], 3));
  });
  const results = await db.batch([
    db.prepare("UPDATE users SET name = ? WHERE id = ?").bind("A reader", "user-1"),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind("user-1"),
  ]);
  assert.equal(bodies.length, 1);
  assert.deepEqual(bodies[0], { batch: [
    { sql: "UPDATE users SET name = ? WHERE id = ?", params: ["A reader", "user-1"] },
    { sql: "DELETE FROM sessions WHERE user_id = ?", params: ["user-1"] },
  ] });
  assert.deepEqual(results.map(result => result.meta.changes), [1, 3]);
});

test("failed batch rejects as a whole without retrying a mutation", async () => {
  let calls = 0;
  const db = createD1Database(config, async () => {
    calls++;
    return response(queryResult([], 1), { success: false, error: "SQL private-token reader@example.com" });
  });
  await assert.rejects(db.batch([db.prepare("UPDATE users SET name = 'private'"), db.prepare("DELETE FROM sessions")]),
    error => error.message === "Database query failed." && error.cause === undefined);
  assert.equal(calls, 1);
});

test("HTTP errors, network failures, malformed JSON, and API errors remain sanitized", async () => {
  const upstreamSecret = "private-token SELECT secret reader@example.com";
  const scenarios = [
    async () => new Response(upstreamSecret, { status: 429 }),
    async () => { throw new Error(upstreamSecret); },
    async () => new Response(upstreamSecret, { status: 200 }),
    async () => Response.json({ success: false, errors: [{ message: upstreamSecret }], result: [] }),
    async () => Response.json({ success: true, errors: [{ message: upstreamSecret }], result: [queryResult()] }),
  ];
  for (const fetcher of scenarios) {
    let calls = 0;
    const db = createD1Database(config, async (...args) => { calls++; return fetcher(...args); });
    await assert.rejects(db.prepare("INSERT INTO users VALUES (?)").bind("private").run(), error => {
      assert.doesNotMatch(error.message, /private-token|SELECT|reader@example.com|INSERT/);
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test("result count, row shape, query success, and mutation metadata are validated", async () => {
  const invalid = [
    { success: true, result: [] },
    { success: true, result: [queryResult(), queryResult()] },
    { success: true, result: [{ ...queryResult(), success: false }] },
    { success: true, result: [{ ...queryResult(), results: ["not a row"] }] },
    { success: true, result: [{ ...queryResult(), meta: {} }] },
    { success: true, result: [{ ...queryResult(), meta: { changes: -1 } }] },
  ];
  for (const payload of invalid) {
    const db = createD1Database(config, async () => Response.json(payload));
    await assert.rejects(db.prepare("SELECT * FROM users").all(), /Database/);
  }
});

test("blob and primitive bindings normalize while unsupported values fail before network access", async () => {
  const bodies = [];
  const db = createD1Database(config, async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return response(queryResult());
  });
  await db.prepare("INSERT INTO values_table VALUES (?, ?, ?, ?, ?, ?)")
    .bind(null, 2.5, false, "text", new Uint8Array([1, 2]), new Uint8Array([3, 4]).buffer).run();
  assert.deepEqual(bodies[0].params, [null, 2.5, 0, "text", [1, 2], [3, 4]]);
  for (const value of [undefined, NaN, Infinity, 1n, {}, new Date()]) {
    assert.throws(() => db.prepare("SELECT ?").bind(value), /Unsupported database parameter/);
  }
  assert.equal(bodies.length, 1);
});

test("empty batches avoid network and foreign statements fail before network access", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return response(queryResult()); };
  const db = createD1Database(config, fetcher), other = createD1Database(config, fetcher);
  assert.deepEqual(await db.batch([]), []);
  await assert.rejects(db.batch([other.prepare("DELETE FROM users")]), /Invalid database batch statement/);
  assert.equal(calls, 0);
});

test("missing configuration and unsupported methods fail explicitly without network access", async () => {
  let calls = 0;
  const db = createD1Database(config, async () => { calls++; return response(queryResult()); });
  assert.throws(() => createD1Database({ ...config, apiToken: "" }), /not configured/);
  await assert.rejects(db.exec("SELECT 1"), /not supported/);
  await assert.rejects(db.dump(), /not supported/);
  await assert.rejects(db.prepare("SELECT 1").raw(), /not supported/);
  assert.throws(() => db.withSession(), /not supported/);
  assert.equal(calls, 0);
});
