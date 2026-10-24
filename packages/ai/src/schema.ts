import { z } from "zod";

/**
 * Schema the model must satisfy. Everything is a string/nullable (OpenAI strict structured
 * output needs every key present). It deliberately has no totals and no action fields:
 * totals are computed by us, and the model cannot request any action.
 */
export const modelInvoiceOutputSchema = z.strictObject({
  customerName: z.string().nullable(),
  customerEmail: z.string().nullable(),
  currency: z.string().nullable(),
  lineItems: z.array(
    z.strictObject({ description: z.string(), quantity: z.string(), unitPrice: z.string() }),
  ),
  dueDate: z.string().nullable(),
  taxPercent: z.string().nullable(),
  discount: z.strictObject({ kind: z.enum(["percent", "amount"]), value: z.string() }).nullable(),
});
export type ModelInvoiceOutput = z.infer<typeof modelInvoiceOutputSchema>;
