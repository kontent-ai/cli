export type Clock = Readonly<{ now: () => number }>;

export const systemClock: Clock = { now: () => Date.now() };
