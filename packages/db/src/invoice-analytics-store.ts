import { and, eq, gte, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import {
  CURRENCY_CODES,
  currencyExponent,
  isSupportedCurrency,
  type CurrencyCode,
} from "@nmi/shared";
import type { Db } from "./client.js";
import {
  LIST_MAX_SEARCH,
  PAYPAL_STATUS_GROUPS,
  type PayPalStatusGroup,
} from "./invoice-list-store.js";
import { invoices, paypalDraftOperations } from "./schema.js";

export interface AnalyticsQuery {
  operatorId: string;
  fromInclusive: Date;
  toExclusive: Date;
  timeZone: string;
  currency?: CurrencyCode | undefined;
  status?: PayPalStatusGroup | undefined;
  search?: string | undefined;
}

export interface AnalyticsCurrencyTotal {
  currency: CurrencyCode;
  exponent: number;
  invoiceCount: number;
  totalMinor: string;
  stateCounts: Record<PayPalStatusGroup, number>;
}
export interface AnalyticsDayTotal {
  day: string;
  currency: CurrencyCode;
  exponent: number;
  invoiceCount: number;
  totalMinor: string;
}
export interface AnalyticsSummary {
  currencies: AnalyticsCurrencyTotal[];
  days: AnalyticsDayTotal[];
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const countNumber = (s: string) => {
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("invalid aggregate count");
  return n;
};

/**
 * Aggregates the FULL owner-scoped invoice population in SQL, not the grid's cursor page.
 * All sums are PostgreSQL integer aggregates, then BigInt; no float or FX conversion.
 * Customer fields are used only for a parameterized search predicate, never returned.
 */
export class PostgresInvoiceAnalyticsStore {
  constructor(private readonly db: Db) {}

  async summarize(q: AnalyticsQuery): Promise<AnalyticsSummary> {
    const where: SQL[] = [
      eq(invoices.createdBy, q.operatorId),
      gte(invoices.createdAt, q.fromInclusive),
      lt(invoices.createdAt, q.toExclusive),
    ];
    if (q.currency) {
      if (!CURRENCY_CODES.includes(q.currency)) throw new Error("unsupported currency");
      where.push(eq(invoices.currency, q.currency));
    }
    if (q.status) {
      if (!PAYPAL_STATUS_GROUPS.includes(q.status)) throw new Error("unsupported status");
      where.push(
        q.status === "none"
          ? isNull(paypalDraftOperations.id)
          : inArray(
              paypalDraftOperations.state,
              q.status === "progress"
                ? ["pending", "creating"]
                : q.status === "created"
                  ? ["created"]
                  : ["unknown", "rejected", "mismatch"],
            ),
      );
    }
    const term = q.search?.trim();
    if (term) {
      if (term.length > LIST_MAX_SEARCH) throw new Error("search too long");
      const contains = `%${escapeLike(term)}%`;
      const prefix = `${escapeLike(term)}%`;
      where.push(
        sql`(${invoices.customerName} ilike ${contains} escape '\\' or ${invoices.customerEmail} ilike ${contains} escape '\\' or ${invoices.id}::text ilike ${prefix} escape '\\')`,
      );
    }

    // Only an explicitly validated IANA timezone reaches this parameterized expression.
    const day = sql<string>`to_char(timezone(${q.timeZone}, ${invoices.createdAt}), 'YYYY-MM-DD')`;
    const state = sql<PayPalStatusGroup>`case
      when ${paypalDraftOperations.id} is null then 'none'
      when ${paypalDraftOperations.state} in ('pending','creating') then 'progress'
      when ${paypalDraftOperations.state} = 'created' then 'created'
      else 'attention' end`;
    const rows = await this.db
      .select({
        day,
        currency: invoices.currency,
        state,
        invoiceCount: sql<string>`count(*)::text`,
        totalMinor: sql<string>`sum(${invoices.totalMinor})::text`,
      })
      .from(invoices)
      .leftJoin(paypalDraftOperations, eq(paypalDraftOperations.invoiceId, invoices.id))
      .where(and(...where))
      .groupBy(day, invoices.currency, state);

    const currencies = new Map<CurrencyCode, {
      count: number;
      total: bigint;
      states: Record<PayPalStatusGroup, number>;
    }>();
    const days = new Map<string, { day: string; currency: CurrencyCode; count: number; total: bigint }>();
    for (const r of rows) {
      if (!isSupportedCurrency(r.currency) || !PAYPAL_STATUS_GROUPS.includes(r.state)) {
        throw new Error("unexpected stored aggregate dimension");
      }
      const currency = r.currency;
      const count = countNumber(r.invoiceCount);
      const minor = BigInt(r.totalMinor);
      const c = currencies.get(currency) ?? {
        count: 0,
        total: 0n,
        states: { none: 0, progress: 0, created: 0, attention: 0 },
      };
      c.count += count;
      c.total += minor;
      c.states[r.state] += count;
      if (!Number.isSafeInteger(c.count)) throw new Error("aggregate overflow");
      currencies.set(currency, c);
      const key = `${r.day}:${currency}`;
      const d = days.get(key) ?? { day: r.day, currency, count: 0, total: 0n };
      d.count += count;
      d.total += minor;
      if (!Number.isSafeInteger(d.count)) throw new Error("aggregate overflow");
      days.set(key, d);
    }
    return {
      currencies: [...currencies].sort(([a], [b]) => a.localeCompare(b)).map(([currency, v]) => ({
        currency,
        exponent: currencyExponent(currency),
        invoiceCount: v.count,
        totalMinor: v.total.toString(),
        stateCounts: v.states,
      })),
      days: [...days.values()]
        .sort((a, b) => a.day.localeCompare(b.day) || a.currency.localeCompare(b.currency))
        .map((d) => ({
          day: d.day,
          currency: d.currency,
          exponent: currencyExponent(d.currency),
          invoiceCount: d.count,
          totalMinor: d.total.toString(),
        })),
    };
  }
}
