import postgres from 'postgres';

export type Sql = postgres.Sql;

/** Supabase's transaction pooler (port 6543) cannot keep prepared statements between queries. */
export function usesTransactionPooler(url: string): boolean {
  try {
    return new URL(url).port === '6543';
  } catch {
    return false;
  }
}

export function connect(url: string, maxConnections: number): Sql {
  return postgres(url, {
    max: maxConnections,
    idle_timeout: 30,
    prepare: !usesTransactionPooler(url),
    // Bulk upserts can be large; keep notices quiet.
    onnotice: () => {},
  });
}
