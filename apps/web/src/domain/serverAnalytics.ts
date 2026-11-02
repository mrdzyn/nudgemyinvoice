import { CURRENCY_INFO } from "./money.js";
import { exactKeys, isRecord } from "./serverInvoice.js";
import { isValidLocalDate, localDateInZone } from "./dateRange.js";
import { CURRENCY_CODES, type CurrencyCode } from "./types.js";

export const ANALYTICS_STATES = ["none", "progress", "created", "attention"] as const;
export type AnalyticsState = (typeof ANALYTICS_STATES)[number];

export interface AnalyticsQuery {
  fromInclusive: string;
  toExclusive: string;
  timeZone: string;
  currency?: CurrencyCode;
  status?: AnalyticsState;
  q?: string;
}

export interface AnalyticsCurrencyTotal {
  currency: CurrencyCode;
  exponent: number;
  invoiceCount: number;
  totalMinor: string;
  stateCounts: Record<AnalyticsState, number>;
}

export interface AnalyticsDayTotal {
  day: string;
  currency: CurrencyCode;
  exponent: number;
  invoiceCount: number;
  totalMinor: string;
}

export interface AnalyticsSummary {
  version: 1;
  fromInclusive: string;
  toExclusive: string;
  timeZone: string;
  currencies: AnalyticsCurrencyTotal[];
  days: AnalyticsDayTotal[];
}

const NONNEGATIVE_INTEGER = /^(0|[1-9]\d{0,39})$/;
const isCurrency = (value: unknown): value is CurrencyCode =>
  typeof value === "string" && (CURRENCY_CODES as readonly string[]).includes(value);
const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function parseCurrencyTotal(value: unknown): AnalyticsCurrencyTotal | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["currency", "exponent", "invoiceCount", "totalMinor", "stateCounts"])
  )
    return null;
  const { currency, exponent, invoiceCount, totalMinor, stateCounts } = value;
  if (!isCurrency(currency) || exponent !== CURRENCY_INFO[currency].exponent) return null;
  if (!isCount(invoiceCount) || invoiceCount === 0) return null;
  if (typeof totalMinor !== "string" || !NONNEGATIVE_INTEGER.test(totalMinor)) return null;
  if (!isRecord(stateCounts) || !exactKeys(stateCounts, [...ANALYTICS_STATES])) return null;
  if (!ANALYTICS_STATES.every((state) => isCount(stateCounts[state]))) return null;
  const counts = stateCounts as Record<AnalyticsState, number>;
  const stateCount = ANALYTICS_STATES.reduce((sum, state) => sum + counts[state], 0);
  if (!Number.isSafeInteger(stateCount) || stateCount !== invoiceCount) return null;
  return { currency, exponent, invoiceCount, totalMinor, stateCounts: counts };
}

function parseDayTotal(value: unknown): AnalyticsDayTotal | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["day", "currency", "exponent", "invoiceCount", "totalMinor"])
  )
    return null;
  const { day, currency, exponent, invoiceCount, totalMinor } = value;
  if (typeof day !== "string" || !isValidLocalDate(day)) return null;
  if (!isCurrency(currency) || exponent !== CURRENCY_INFO[currency].exponent) return null;
  if (!isCount(invoiceCount) || invoiceCount === 0) return null;
  if (typeof totalMinor !== "string" || !NONNEGATIVE_INTEGER.test(totalMinor)) return null;
  return { day, currency, exponent, invoiceCount, totalMinor };
}

/** Strictly parses the whole response; a partial or inconsistent summary is never rendered. */
export function parseAnalyticsSummary(
  value: unknown,
  query: AnalyticsQuery,
): AnalyticsSummary | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["version", "fromInclusive", "toExclusive", "timeZone", "currencies", "days"])
  )
    return null;
  if (
    value["version"] !== 1 ||
    value["fromInclusive"] !== query.fromInclusive ||
    value["toExclusive"] !== query.toExclusive ||
    value["timeZone"] !== query.timeZone
  )
    return null;
  if (!Array.isArray(value["currencies"]) || value["currencies"].length > CURRENCY_CODES.length)
    return null;
  if (!Array.isArray(value["days"]) || value["days"].length > 368 * CURRENCY_CODES.length)
    return null;

  const currencies: AnalyticsCurrencyTotal[] = [];
  const currencyMap = new Map<CurrencyCode, AnalyticsCurrencyTotal>();
  for (const raw of value["currencies"]) {
    const total = parseCurrencyTotal(raw);
    if (!total || currencyMap.has(total.currency)) return null;
    if (query.currency && query.currency !== total.currency) return null;
    if (
      query.status &&
      ANALYTICS_STATES.some((s) => s !== query.status && total.stateCounts[s] !== 0)
    )
      return null;
    currencyMap.set(total.currency, total);
    currencies.push(total);
  }

  const from = Date.parse(query.fromInclusive);
  const to = Date.parse(query.toExclusive);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return null;
  const firstDay = localDateInZone(new Date(from), query.timeZone);
  const lastDay = localDateInZone(new Date(to - 1), query.timeZone);
  if (!firstDay || !lastDay) return null;

  const days: AnalyticsDayTotal[] = [];
  const dayKeys = new Set<string>();
  const byCurrency = new Map<CurrencyCode, { count: number; total: bigint }>();
  for (const raw of value["days"]) {
    const total = parseDayTotal(raw);
    if (!total || total.day < firstDay || total.day > lastDay) return null;
    if (!currencyMap.has(total.currency)) return null;
    const key = `${total.day}:${total.currency}`;
    if (dayKeys.has(key)) return null;
    dayKeys.add(key);
    const previous = byCurrency.get(total.currency) ?? { count: 0, total: 0n };
    previous.count += total.invoiceCount;
    previous.total += BigInt(total.totalMinor);
    if (!Number.isSafeInteger(previous.count)) return null;
    byCurrency.set(total.currency, previous);
    days.push(total);
  }

  for (const [currency, summary] of currencyMap) {
    const daily = byCurrency.get(currency);
    if (
      !daily ||
      daily.count !== summary.invoiceCount ||
      daily.total !== BigInt(summary.totalMinor)
    )
      return null;
  }
  if (byCurrency.size !== currencyMap.size) return null;

  return {
    version: 1,
    fromInclusive: query.fromInclusive,
    toExclusive: query.toExclusive,
    timeZone: query.timeZone,
    currencies,
    days,
  };
}
