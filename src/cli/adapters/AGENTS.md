# src/cli/adapters

- One folder per external system or concern (e.g. auth).
- Thin: translate between the outside world and core types, and convert exceptions into `Result` with the adapter's own error type. No decisions.
- Formatters of SDK errors sit next to the adapter whose SDK internals they read. Wording for domain errors belongs to `src/cli/commands`.
- Satisfy the workflows' effect types structurally; never import from `src/cli/commands`.
- Tested at the transport seam (`test/helpers/httpTestAdapter.ts`, `test/helpers/iapiTestClient.ts`), not with mocks.

## Systems

- `iapi`: internal API, hand-rolled over `@kontent-ai/core-sdk`, one file per endpoint. `schema` validators must be `zod/mini`; classic zod cannot infer the payload.
- `mapi`: Management API via `@kontent-ai/management-sdk`. `mapi/raw` is a passthrough behind `kontent mapi`: no schema, 4xx/5xx is a result, not an error. Why: doc comments in `raw/client.ts`, `raw/contentType.ts`.
- `learn`: tokenless Learn-MCP client behind `kontent docs`. Schemas declare only the fields read, so unknown keys survive to stdout; `runtimeValidation.validateResponses` must stay on.
- `config`: `cliConfig.ts` is the persisted CLI state (telemetry consent, ids).
- `telemetry`: see `TELEMETRY.md`.
