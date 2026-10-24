import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type pg from "pg";

/** Drizzle handle over a pg Pool or a single (possibly transaction-bound) pg Client. */
export type Db = NodePgDatabase;

export function createDb(poolOrClient: pg.Pool | pg.PoolClient | pg.Client): Db {
  return drizzle(poolOrClient);
}
