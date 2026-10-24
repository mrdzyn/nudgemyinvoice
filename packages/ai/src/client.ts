import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { modelInvoiceOutputSchema } from "./schema.js";

export interface ModelRequest {
  instructions: string;
  input: string;
}

/** Provider seam. Returns UNTRUSTED data; callers must validate. Tests inject a fake. */
export interface InvoiceModelClient {
  generate(request: ModelRequest): Promise<unknown>;
}

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export function createOpenAIInvoiceClient(config: OpenAIConfig): InvoiceModelClient {
  const openai = new OpenAI({
    apiKey: config.apiKey,
    timeout: config.timeoutMs ?? 20_000,
    maxRetries: 1,
  });
  return {
    async generate({ instructions, input }) {
      const response = await openai.responses.parse({
        model: config.model,
        instructions,
        input,
        store: false,
        max_output_tokens: config.maxOutputTokens ?? 1024,
        text: { format: zodTextFormat(modelInvoiceOutputSchema, "invoice_draft") },
      });
      return response.output_parsed;
    },
  };
}
