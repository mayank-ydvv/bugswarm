import type { Sql } from './db.ts';
import type { LlmCache } from './types.ts';
import postgres from 'postgres';

export function llmCache(sql: Sql): LlmCache {
  return {
    async get(hashes) {
      if (hashes.length === 0) return new Map();
      const rows = await sql<{ content_hash: string; result: unknown }[]>`
        select content_hash, result from llm_cache where content_hash = any(${hashes})
      `;
      return new Map(rows.map((r) => [r.content_hash, r.result]));
    },
    async put(entries) {
      if (entries.length === 0) return;
      const rows = entries.map((e) => ({ content_hash: e.hash, result: sql.json(e.result as postgres.JSONValue) }));
      await sql`insert into llm_cache ${sql(rows, 'content_hash', 'result')} on conflict (content_hash) do nothing`;
    },
  };
}
