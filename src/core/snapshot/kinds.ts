/** Where a kind's entities sit in its Management API response. */
export type ResponseShape =
  | Readonly<{ kind: "wrapper"; key: string }>
  | Readonly<{ kind: "array" }>
  | Readonly<{ kind: "entity" }>;

/**
 * How a folder names its files: by codename, falling back to the id when the codename isn't a
 * safe file name, or always by id.
 */
export type FileNaming = "codename" | "id";

/** Where a kind's entities go in the snapshot folder. */
export type StoredIn =
  | Readonly<{ kind: "file"; name: string }>
  | Readonly<{ kind: "folder"; name: string; namedBy: FileNaming }>;

export type SnapshotKind = Readonly<{
  name: string;
  /** In `kontent mapi` form, resolved with `resolveMapiEndpoint`. */
  endpoint: string;
  response: ResponseShape;
  storedIn: StoredIn;
}>;

/** The kinds of format version 1, in the order the manifest lists them. */
export const snapshotKinds = [
  {
    name: "environment",
    endpoint: "projects/{environment_id}",
    response: { kind: "entity" },
    storedIn: { kind: "file", name: "environment.json" },
  },
  {
    name: "types",
    endpoint: "types",
    response: { kind: "wrapper", key: "types" },
    storedIn: { kind: "folder", name: "types", namedBy: "codename" },
  },
  {
    name: "snippets",
    endpoint: "snippets",
    response: { kind: "wrapper", key: "snippets" },
    storedIn: { kind: "folder", name: "snippets", namedBy: "codename" },
  },
  {
    name: "taxonomies",
    endpoint: "taxonomies",
    response: { kind: "wrapper", key: "taxonomies" },
    storedIn: { kind: "folder", name: "taxonomies", namedBy: "codename" },
  },
  {
    name: "languages",
    endpoint: "languages",
    response: { kind: "wrapper", key: "languages" },
    storedIn: { kind: "folder", name: "languages", namedBy: "id" },
  },
  {
    name: "collections",
    endpoint: "collections",
    response: { kind: "wrapper", key: "collections" },
    storedIn: { kind: "folder", name: "collections", namedBy: "codename" },
  },
  {
    name: "workflows",
    endpoint: "workflows",
    response: { kind: "array" },
    storedIn: { kind: "folder", name: "workflows", namedBy: "codename" },
  },
] as const satisfies ReadonlyArray<SnapshotKind>;
