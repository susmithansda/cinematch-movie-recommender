import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText).toString("base64")}`;
const identity = await import(moduleUrl(readFileSync(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8")
  .replace('import { headers } from "next/headers";', 'const headers = async () => new Headers({ "oai-authenticated-user-id": "forged", "oai-authenticated-user-email": "forged@example.com" });')
  .replace('import { redirect } from "next/navigation";', 'const redirect = () => { throw new Error("Unexpected redirect"); };')));
const runtime = await import(moduleUrl(readFileSync(new URL("../lib/vercel-env.ts", import.meta.url), "utf8")
  .replace('import { createD1Database } from "./d1-http";', 'const createD1Database = () => ({ prepare() {} });')));
const auth = await import(moduleUrl(readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8")
  .replace('import { env } from "cloudflare:workers";', 'const env = { get DB() { return globalThis.__vercelRateLimitDb; } };')
  .replace('import { getChatGPTUser } from "@/app/chatgpt-auth";', 'const getChatGPTUser = async () => null;')));

async function withEnv(values, fn) {
  const saved = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  try { await fn(); }
  finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test("Next.js never authenticates visitor-supplied Sites identity headers", async () => {
  await withEnv({ FRAME_RUNTIME: "node" }, async () => {
    assert.equal(await identity.getChatGPTUser(), null);
  });
});

test("Vercel storage is unavailable until all three server credentials exist", async () => {
  await withEnv({ CLOUDFLARE_ACCOUNT_ID: undefined, CLOUDFLARE_D1_DATABASE_ID: undefined, CLOUDFLARE_D1_API_TOKEN: undefined }, async () => {
    assert.equal(runtime.env.DB, undefined);
    process.env.CLOUDFLARE_ACCOUNT_ID = "account";
    process.env.CLOUDFLARE_D1_DATABASE_ID = "database";
    assert.equal(runtime.env.DB, undefined);
    process.env.CLOUDFLARE_D1_API_TOKEN = "token";
    assert.equal(typeof runtime.env.DB.prepare, "function");
  });
});

test("Vercel rate limits use platform client IPs rather than spoofed Cloudflare headers", async () => {
  const keys = [];
  globalThis.__vercelRateLimitDb = {
    prepare(sql) {
      return { bind(key) { if (sql.startsWith("INSERT")) keys.push(key); return { first: async () => ({ count: 1 }), run: async () => ({}) }; } };
    },
  };
  try {
    await withEnv({ FRAME_RUNTIME: "node", VERCEL: "1" }, async () => {
      for (const ip of ["192.0.2.1", "192.0.2.2"]) {
        await auth.rateLimit(new Request("https://frame.example/api/auth/login", {
          headers: { "x-forwarded-for": ip, "cf-connecting-ip": "spoofed" },
        }), "login", "reader@example.com");
        assert.equal(keys.at(-1), await auth.digest(`login:${ip}:reader@example.com`));
      }
    });
  } finally { delete globalThis.__vercelRateLimitDb; }
});
