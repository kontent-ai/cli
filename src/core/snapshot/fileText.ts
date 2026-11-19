import type { JsonObject } from "@kontent-ai/core-sdk";

/**
 * The text of a snapshot file. `JSON.stringify` writes keys in insertion order, which for
 * parsed JSON is the API's order, except that JavaScript moves integer-like keys (`"1"`) to the
 * front. Either way the order is the same on every run, and the line endings are always `\n`,
 * so an unchanged entity gives the same bytes on every run and OS.
 */
export const snapshotFileText = (value: JsonObject): string =>
  `${JSON.stringify(value, null, 2)}\n`;
