import postgres from 'postgres';

export type Sql = postgres.Sql;

export function connect(url: string, maxConnections: number): Sql {
  return postgres(url, {
    max: maxConnections,
    idle_timeout: 30,
    // Bulk upserts can be large; keep notices quiet.
    onnotice: () => {},
  });
}
