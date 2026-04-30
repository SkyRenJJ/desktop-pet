export type ParsedJsonResult = {
  rawInput: string;
  formattedJson: string;
};

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };