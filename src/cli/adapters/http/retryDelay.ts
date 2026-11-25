// Past this the API is rationing quota, not smoothing a burst. core-sdk clamps a
// longer `Retry-After` to the cap rather than giving up, so a rationing 429 costs
// at most one wait of this length per retry before the status reaches the caller.
export const MAX_RETRY_DELAY_MS = 60_000;
