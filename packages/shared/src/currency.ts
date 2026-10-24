/**
 * ISO 4217 currencies the MVP accepts. `exponent` is the number of minor-unit digits.
 * Adding a currency here is a deliberate, reviewed change; unknown codes are rejected.
 */
export const SUPPORTED_CURRENCIES = {
  USD: { exponent: 2 },
  EUR: { exponent: 2 },
  GBP: { exponent: 2 },
  CAD: { exponent: 2 },
  AUD: { exponent: 2 },
  JPY: { exponent: 0 },
} as const;

export type CurrencyCode = keyof typeof SUPPORTED_CURRENCIES;

export const CURRENCY_CODES = Object.keys(SUPPORTED_CURRENCIES) as CurrencyCode[];

export function isSupportedCurrency(value: string): value is CurrencyCode {
  return Object.hasOwn(SUPPORTED_CURRENCIES, value);
}

export function currencyExponent(code: CurrencyCode): number {
  return SUPPORTED_CURRENCIES[code].exponent;
}
