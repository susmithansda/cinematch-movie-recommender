type D1HttpConfig = { accountId: string; databaseId: string; apiToken: string };
type SqlValue = string | number | null | number[];
type Query = { sql: string; params: SqlValue[] };
type QueryResult = {
  success: true;
  results: Record<string, unknown>[];
  meta: Record<string, unknown> & { changes: number };
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parameter(value: unknown): SqlValue {
  if (value === null || typeof value === "string") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));
  if (value instanceof Uint8Array) return Array.from(value);
  throw new Error("Unsupported database parameter.");
}

/**
 * D1 operations used by FRAME, over Cloudflare's authenticated REST API.
 * This API has Cloudflare's administrative API rate limits. For higher traffic,
 * use a dedicated Worker API backed by a native D1 binding instead.
 */
export function createD1Database(config: D1HttpConfig, fetcher: typeof fetch = fetch): D1Database {
  const { accountId, databaseId, apiToken } = config;
  if (![accountId, databaseId, apiToken].every(value => typeof value === "string" && value.trim())) {
    throw new Error("Database connection is not configured.");
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;
  const statements = new WeakMap<object, Query>();

  async function execute(queries: Query[], batch = false): Promise<QueryResult[]> {
    if (!queries.length) return [];
    let response: Response;
    let payload: unknown;
    try {
      response = await fetcher(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(batch ? { batch: queries } : queries[0]),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error();
      payload = await response.json();
    } catch {
      // Upstream errors can include SQL, bound private data, or credentials.
      // Never propagate the response body or the original exception.
      throw new Error("Database request failed.");
    }
    if (!record(payload) || payload.success !== true
      || (Array.isArray(payload.errors) && payload.errors.length > 0)
      || !Array.isArray(payload.result) || payload.result.length !== queries.length) {
      throw new Error("Database returned an invalid response.");
    }
    return payload.result.map((result: unknown): QueryResult => {
      if (!record(result) || result.success !== true || result.error
        || !Array.isArray(result.results) || !result.results.every(record)
        || !record(result.meta) || typeof result.meta.changes !== "number"
        || !Number.isFinite(result.meta.changes) || result.meta.changes < 0) {
        throw new Error("Database query failed.");
      }
      return {
        success: true,
        results: result.results,
        meta: { ...result.meta, changes: result.meta.changes },
      };
    });
  }

  class Statement {
    constructor(query: Query) { statements.set(this, query); }

    private query(): Query {
      const query = statements.get(this);
      if (!query) throw new Error("Invalid database statement.");
      return query;
    }

    bind(...values: unknown[]): Statement {
      return new Statement({ sql: this.query().sql, params: values.map(parameter) });
    }

    async first(column?: string): Promise<unknown> {
      const result = (await execute([this.query()]))[0];
      const row = result.results[0];
      if (!row) return null;
      if (column === undefined) return row;
      if (!Object.prototype.hasOwnProperty.call(row, column)) {
        throw new Error("Database column is unavailable.");
      }
      return row[column];
    }

    async all(): Promise<QueryResult> { return (await execute([this.query()]))[0]; }
    async run(): Promise<QueryResult> { return (await execute([this.query()]))[0]; }
    async raw(): Promise<never> { throw new Error("Database raw queries are not supported."); }
  }

  const database = {
    prepare(sql: string): Statement {
      if (typeof sql !== "string" || !sql.trim()) throw new Error("Invalid database statement.");
      return new Statement({ sql, params: [] });
    },
    async batch(items: object[]): Promise<QueryResult[]> {
      // One REST batch preserves D1's transactional execution and result order.
      const queries = items.map(item => {
        const query = statements.get(item);
        if (!query) throw new Error("Invalid database batch statement.");
        return query;
      });
      return execute(queries, true);
    },
    async exec(): Promise<never> { throw new Error("Database exec is not supported."); },
    async dump(): Promise<never> { throw new Error("Database dump is not supported."); },
    withSession(): never { throw new Error("Database sessions are not supported."); },
  };
  // The adapter deliberately implements only the D1 subset used by this app.
  return database as unknown as D1Database;
}
