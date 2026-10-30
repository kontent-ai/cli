# src/core

- Pure: no I/O, no Node built-ins, no imports from `src/cli`. Kontent.ai SDKs (`@kontent-ai/*`) are imported as types only. Time, randomness and environment arrive as parameters (e.g. `nowMs`), never read inside.
- Holds decisions, domain types, validation and parsing of domain values, pure transformations, and domain data. User-facing wording belongs to `src/cli/commands`, API wire schemas to `src/cli/adapters`.
- One folder per domain, one concept per file, named after the concept. No `shared/` or `utils/`; generic helpers go in `core/lib`.
- Decisions are named `decide*`/`plan*`. When the order or combination of effects matters, return a plan (data the workflow applies), not a boolean.
- Model a decision as data when at least one holds: it has three or more outcomes or combines several inputs; the order or combination of effects matters; it is a product rule users would notice breaking; it deserves a table test. A lone `if` does not qualify.
- Every decision has table tests in `test/unit`: no fakes, no mocks.
- `kontentUrl/kontentUrl.ts` allowlists the domains the CLI may talk to (plus this machine's loopback addresses for a local stack), never bypass it.
