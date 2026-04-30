import type { ParsedJsonResult } from "../types/jsonParser";

export function parseJsonInput(input: string): ParsedJsonResult {
  const parsed = JSON.parse(input);

  return {
    rawInput: input,
    formattedJson: JSON.stringify(parsed, null, 2),
  };
}