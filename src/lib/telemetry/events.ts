export type CommandOutcome = "success" | "error";

export type EventProperties = Record<string, string | number | boolean | undefined>;

export type TelemetryEvent = Readonly<{
  name: string;
  properties: EventProperties;
}>;

export const toEventType = (command: string): string =>
  `cli__${command.trim().replace(/\s+/g, "-")}`;
