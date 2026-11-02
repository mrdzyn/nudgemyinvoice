import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { CURRENCY_CODES, type CurrencyCode } from "@nmi/shared";
import {
  LIST_MAX_SEARCH,
  PAYPAL_STATUS_GROUPS,
  PostgresInvoiceAnalyticsStore,
  type Db,
} from "@nmi/db";

// Date.toISOString() produces exactly this UTC, millisecond-precision format.
const instant = z.iso.datetime({ offset: false, precision: 3 });
const validZone = (zone: string) => {
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/.test(zone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

// Both range bounds and the timezone are mandatory in V1. A half-specified interval
// must not silently return unbounded or arbitrary financial data.
export const analyticsBody = z
  .strictObject({
    fromInclusive: instant,
    toExclusive: instant,
    timeZone: z.string().min(1).max(64).refine(validZone, "invalid time zone"),
    currency: z.enum(CURRENCY_CODES as [CurrencyCode, ...CurrencyCode[]]).optional(),
    status: z.enum(PAYPAL_STATUS_GROUPS).optional(),
    q: z.string().trim().min(1).max(LIST_MAX_SEARCH).optional(),
  })
  .refine((v) => {
    const from = Date.parse(v.fromInclusive);
    const to = Date.parse(v.toExclusive);
    return to > from && to - from <= 366 * 86_400_000;
  }, "invalid or oversized date range");

/** Read-only SQL aggregation over ALL matching owned records, independent of grid pagination. */
export function analyticsRoutes(app: FastifyInstance, db: Db): void {
  const store = new PostgresInvoiceAnalyticsStore(db);
  app.post("/api/analytics/summary", { preHandler: app.requireOperator }, async (req, reply) => {
    reply.header("cache-control", "no-store");
    const parsed = analyticsBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_analytics_query",
        issues: parsed.error.issues.map((e) => ({ path: e.path.join("."), message: e.message })),
      });
    }
    const q = parsed.data;
    const operatorId = (req as FastifyRequest).session?.operatorId;
    if (!operatorId) return reply.code(401).send({ error: "unauthorized" });
    const result = await store.summarize({
      operatorId,
      fromInclusive: new Date(q.fromInclusive),
      toExclusive: new Date(q.toExclusive),
      timeZone: q.timeZone,
      currency: q.currency,
      status: q.status,
      search: q.q,
    });
    return reply.send({
      version: 1,
      fromInclusive: q.fromInclusive,
      toExclusive: q.toExclusive,
      timeZone: q.timeZone,
      ...result,
    });
  });
}
