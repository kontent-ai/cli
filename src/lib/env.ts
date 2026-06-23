export const isTruthyEnv = (value: string | undefined): boolean =>
  value !== undefined && !["", "0", "false", "no"].includes(value.toLowerCase());
