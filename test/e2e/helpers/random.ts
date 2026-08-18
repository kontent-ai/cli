// Uniqueness suffix for per-run entity names, so parallel runs cannot collide.
export const randomSuffix = (): string => Math.random().toString(36).slice(2, 8);
