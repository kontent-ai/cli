// biome-ignore lint/correctness/useImportExtensions: importing package.json, not a TS module
import pkg from "../../../package.json" with { type: "json" };

declare const __AMPLITUDE_API_KEY__: string | undefined;

// The constant is injected by tsdown's define at build time; typeof on an
// undeclared identifier never throws, so unbundled runs (tsc, tsx) safely fall
// back to an empty key and send nothing.
export const amplitudeApiKey: string =
  typeof __AMPLITUDE_API_KEY__ === "string" ? __AMPLITUDE_API_KEY__ : "";

export const cliVersion: string = pkg.version;
