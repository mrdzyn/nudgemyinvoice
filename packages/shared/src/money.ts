import { currencyExponent, type CurrencyCode } from "./currency.js";

/** Integer minor units (e.g. cents) for a specific currency. Never a float. */
export type Minor = bigint;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

const DECIMAL = /^(\d{1,12})(?:\.(\d+))?$/;

/** Parse a non-negative decimal string into minor units; rejects excess precision. */
export function parseMoney(value: string, currency: CurrencyCode): Minor {
  const m = DECIMAL.exec(value.trim());
  if (!m) throw new MoneyError(`Invalid amount "${value}"`);
  const exp = currencyExponent(currency);
  const whole = m[1] as string;
  const frac = m[2] ?? "";
  if (frac.length > exp) {
    throw new MoneyError(`Amount "${value}" has more than ${exp} decimal places for ${currency}`);
  }
  return BigInt(whole + frac.padEnd(exp, "0"));
}

export function formatMoney(minor: Minor, currency: CurrencyCode): string {
  const exp = currencyExponent(currency);
  const s = minor.toString().padStart(exp + 1, "0");
  return exp === 0 ? s : `${s.slice(0, -exp)}.${s.slice(-exp)}`;
}

/** Quantity with at most 2 decimals, as hundredths (e.g. "1.5" -> 150n). Must be > 0. */
export function parseQuantity(value: string): bigint {
  const m = DECIMAL.exec(value.trim());
  if (!m) throw new MoneyError(`Invalid quantity "${value}"`);
  const frac = m[2] ?? "";
  if (frac.length > 2) throw new MoneyError(`Quantity "${value}" has more than 2 decimal places`);
  const hundredths = BigInt((m[1] as string) + frac.padEnd(2, "0"));
  if (hundredths <= 0n) throw new MoneyError("Quantity must be greater than zero");
  if (hundredths > 100_000_00n) throw new MoneyError("Quantity is unreasonably large");
  return hundredths;
}

/** Percentage with at most 2 decimals, as basis points (e.g. "8.25" -> 825n), 0..100%. */
export function parsePercent(value: string): bigint {
  const m = DECIMAL.exec(value.trim());
  if (!m) throw new MoneyError(`Invalid percentage "${value}"`);
  const frac = m[2] ?? "";
  if (frac.length > 2) throw new MoneyError(`Percentage "${value}" has more than 2 decimal places`);
  const bps = BigInt((m[1] as string) + frac.padEnd(2, "0"));
  if (bps > 10_000n) throw new MoneyError("Percentage must be between 0 and 100");
  return bps;
}

/** Integer division rounding half up (operands non-negative). */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

function trimFraction(whole: bigint, fraction: bigint, digits: number): string {
  const frac = fraction.toString().padStart(digits, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Canonical decimal for a quantity stored as hundredths: 150n -> "1.5", 200n -> "2". */
export function formatQuantity(hundredths: bigint): string {
  return trimFraction(hundredths / 100n, hundredths % 100n, 2);
}

/** Canonical decimal for a percentage stored as basis points: 825n -> "8.25", 1900n -> "19". */
export function formatPercent(bps: bigint): string {
  return trimFraction(bps / 100n, bps % 100n, 2);
}
