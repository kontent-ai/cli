/** The API references the Learn service knows; any other value answers 400. */
export const API_REFERENCES = [
  "delivery_api",
  "content_management_api_v2",
  "subscription_api",
  "sync_api_v2",
] as const;

export type ApiReference = (typeof API_REFERENCES)[number];
