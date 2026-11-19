/** Where a kind's entities sit in its Management API response. */
export type ResponseShape =
  | Readonly<{ kind: "wrapper"; key: string }>
  | Readonly<{ kind: "array" }>
  | Readonly<{ kind: "entity" }>;

export type SnapshotKind = Readonly<{
  name: string;
  /** In `kontent mapi` form, resolved with `resolveMapiEndpoint`. */
  endpoint: string;
  response: ResponseShape;
}>;

/** The kinds of format version 1, in the order the manifest lists them. */
export const snapshotKinds = [
  { name: "environment", endpoint: "projects/{environment_id}", response: { kind: "entity" } },
  { name: "types", endpoint: "types", response: { kind: "wrapper", key: "types" } },
  { name: "snippets", endpoint: "snippets", response: { kind: "wrapper", key: "snippets" } },
  { name: "taxonomies", endpoint: "taxonomies", response: { kind: "wrapper", key: "taxonomies" } },
  { name: "languages", endpoint: "languages", response: { kind: "wrapper", key: "languages" } },
  {
    name: "collections",
    endpoint: "collections",
    response: { kind: "wrapper", key: "collections" },
  },
  { name: "workflows", endpoint: "workflows", response: { kind: "array" } },
] as const satisfies ReadonlyArray<SnapshotKind>;
