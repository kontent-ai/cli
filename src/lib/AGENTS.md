# src/lib

- `iapi`: internal API, hand-rolled over `@kontent-ai/core-sdk`, one file per endpoint. `schema` validators must be `zod/mini`; classic zod cannot infer the payload.
- `mapi`: Management API via `@kontent-ai/management-sdk`. `mapi/raw` is a passthrough behind `kontent mapi`: no schema, 4xx/5xx is a result, not an error. Why: doc comments in `raw/client.ts`, `raw/contentType.ts`.
- `learn`: tokenless Learn-MCP client behind `kontent docs`. Schemas declare only the fields read, so unknown keys survive to stdout; `runtimeValidation.validateResponses` must stay on.
- `config`: `cliConfig.ts` is the persisted CLI state (telemetry consent, ids); `kontentUrl.ts` allowlists the domains the CLI may talk to, never bypass it.
- `telemetry`: see `TELEMETRY.md`.
