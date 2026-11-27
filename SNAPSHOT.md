# Content model snapshot

A content model snapshot is a folder that holds one environment's content model as plain Management API JSON, one file per entity. The Kontent.ai CLI writes it. Model generators read it, and so does any other tool that needs the content model. This spec calls all of them readers.

**Status:** draft of format version 1.0. Nothing here is final until the [open decisions](#open-decisions) are settled.

## Why a snapshot

- **Generators only read files.** They need no API key, no environment id and no network.
- **Fetching lives in one place.** The CLI already handles sign-in, the default environment, paging and retries.
- **The sign-in never leaves the CLI.** `kontent login` keeps its token in the system's credential store, and no command prints it. If the CLI ran the generators itself, it would have to hand them that token, and it's the user's own sign-in, valid for every environment they can access. With a snapshot, the generators get plain files with no credential in them.
- **Changes become reviewable.** A committed snapshot shows every content model change as a diff, and CI can regenerate models from it without credentials.

## What a snapshot looks like

```text
model-snapshot/
├── manifest.json        what this snapshot contains
├── environment.json     the environment it came from
├── types/               one file per content type
│   ├── article.json
│   └── author.json
├── snippets/            one file per content type snippet
├── taxonomies/          one file per taxonomy group
├── languages/           one file per language, named by id
├── collections/         one file per collection
└── workflows/           one file per workflow
```

## What version 1 contains

Version 1 contains seven kinds of entity. Each kind comes from one Management API v2 endpoint:

| Kind | Stored in | Endpoint | The API answers with | Paged |
|---|---|---|---|---|
| `environment` | `environment.json` | [`GET /projects/{environment_id}`](https://kontent.ai/learn/docs/apis/management-api-v2/environments#retrieve-environment-information) | one object | no |
| `types` | `types/` | [`GET …/types`](https://kontent.ai/learn/docs/apis/management-api-v2/content-types#list-content-types) | `{ types, pagination }` | yes |
| `snippets` | `snippets/` | [`GET …/snippets`](https://kontent.ai/learn/docs/apis/management-api-v2/content-type-snippets#list-content-type-snippets) | `{ snippets, pagination }` | yes |
| `taxonomies` | `taxonomies/` | [`GET …/taxonomies`](https://kontent.ai/learn/docs/apis/management-api-v2/taxonomy-groups#list-taxonomy-groups) | `{ taxonomies, pagination }` | yes |
| `languages` | `languages/` | [`GET …/languages`](https://kontent.ai/learn/docs/apis/management-api-v2/languages#list-languages) | `{ languages, pagination }` | yes |
| `collections` | `collections/` | [`GET …/collections`](https://kontent.ai/learn/docs/apis/management-api-v2/collections#list-collections) | `{ collections, last_modified }` | no |
| `workflows` | `workflows/` | [`GET …/workflows`](https://kontent.ai/learn/docs/apis/management-api-v2/workflows#retrieve-workflows) | an array | no |

The CLI reads paged endpoints to the last page: it sends `pagination.continuation_token` back in the `x-continuation` header until the token is `null`.

These seven kinds are what the generators read today. The JS generator's Delivery models use all of them; the .NET generator uses types and snippets.

### Left out on purpose

- **Content** (content items, language variants, assets). It isn't part of the content model, and it has no size limit.
- **Webhooks.** The webhook object contains the webhook's `secret`.
- **Roles, spaces, asset folders, custom apps and preview configuration.** No generator needs them yet, and roles exist only on some plans. Any of them can be added later in a minor version.

## Entity files

- **One entity per file.** The file holds the entity exactly as the Management API v2 reference documents it, for example the [content type object](https://kontent.ai/learn/docs/apis/management-api-v2/content-types#content-type-object).
- **No response wrapper.** The wrapper's array (`types`, `snippets` and so on) and its `pagination` are gone. For collections, the environment-wide `last_modified` from the response is dropped too.
- **JSON as the API sent it.** Keys are snake_case, and every field the API returned is kept, including `last_modified` and fields this spec never mentions. It is not the shape of any SDK's models.
- **One field is left out.** A custom element's `json_parameters` is never written. It is free-form configuration that can hold API keys, the field is optional in the API's own object, and no generator reads it.

### File names

A file is named after its entity:

- **Languages:** always `<id>.json`. Language codenames don't follow the codename rules: they're generated from the language's name (`French_–_Switzerland`), and the docs recommend replacing them with a short one (`fr-CH`). An id keeps the file name the same when that happens.
- **Every other kind:** `<codename>.json` when the codename contains only lowercase letters, digits and underscores, and isn't a name Windows reserves (`con`, `prn`, `aux`, `nul`, `com1`–`com9`, `lpt1`–`lpt9`). `<id>.json` otherwise.

Codenames that follow the [Kontent.ai codename rules](https://kontent.ai/learn/docs/apis/management-api-v2/references) always get a `<codename>.json` file, unless the codename is one of the Windows reserved names.

**Readers must not rely on file names.** Read every `*.json` in a kind's folder, and take the codename and id from inside the file.

## environment.json

The [environment information](https://kontent.ai/learn/docs/apis/management-api-v2/environments#retrieve-environment-information) response as the API returned it: `id`, `name`, `environment` and `is_production`.

## manifest.json

```json
{
  "format_version": "1.0",
  "environment_id": "975bf280-fd91-488c-994c-2f04416e5ee3",
  "management_api_version": "v2",
  "kinds": [
    "environment",
    "types",
    "snippets",
    "taxonomies",
    "languages",
    "collections",
    "workflows"
  ]
}
```

| Field | Meaning |
|---|---|
| `format_version` | The version of this spec the snapshot follows, as `MAJOR.MINOR`. |
| `environment_id` | The environment the snapshot was taken from. |
| `management_api_version` | The Management API version the entity files come from. |
| `kinds` | Every kind the snapshot contains. A kind that isn't listed wasn't snapshotted. A kind that is listed but has no files is empty. |

- Keys are snake_case like the API's own JSON, so a reader can use one naming policy for the whole folder.
- There's no timestamp and no CLI version. Both would change on every run and turn an unchanged environment into a diff.

## Writing rules

- UTF-8 without a BOM, 2-space indentation, `\n` line endings, and a newline at the end of every file.
- Object keys stay in the order the API returned them.
- Snapshotting an unchanged environment twice gives byte-identical files, and the second run writes nothing.

## How a snapshot is updated

- **Nothing is written until everything is fetched.** The CLI fetches every kind before it touches the folder. A failed request leaves the previous snapshot as it was.
- **Only changed files are touched.** New and changed files are written, and the files of entities deleted from the environment are removed. A file whose content didn't change stays as it is, modified time included, so build tools and file watchers that compare timestamps see no change.
- **Only snapshot files are managed.** The CLI writes and removes only `manifest.json`, `environment.json` and the `*.json` files directly inside the kind folders. Anything else in the folder stays.
- **Only snapshots are updated.** The target must be missing, empty, or a previous snapshot: a folder whose `manifest.json` has `format_version`, `environment_id` and `kinds`. Any other `manifest.json`, such as a web app's, doesn't count. The CLI refuses any other target and touches nothing.
- **An interrupted run is fixed by the next one.** If the CLI stops while writing, the folder can hold a mix of old and new files. The manifest is always written first, so the next run still recognises the folder as a snapshot and completes it.
- **No partial snapshots.** Any failed request fails the run, including a 403 or 404 for a single kind.

## Reading a snapshot

- Read `manifest.json` first. Fail with a clear message when its major version is one you don't know.
- Ignore fields, files and kinds you don't know. A minor version only adds things.
- Fail with a clear message when a kind you need isn't in `kinds`.
- Treat a listed kind whose folder is missing as empty. Git doesn't keep empty folders, so a committed snapshot loses them on clone.
- Find a kind's folder through the table in [What version 1 contains](#what-version-1-contains), never by using a `kinds` value as a path. Read only `manifest.json`, `environment.json` and the `*.json` files directly inside the kind folders.
- Accept `\r\n` line endings too. Git on Windows may convert line endings on checkout.
- Put the entities in an order of your own, such as by codename, when your output depends on it. The order of files in a folder differs between file systems, and the snapshot doesn't record the order the API returned them in. See open decision 7.

## Versioning

- **Minor** (`1.0` → `1.1`): new kinds, new manifest fields. Readers of `1.x` keep working.
- **Major** (`1.x` → `2.0`): anything that could break an existing reader, such as a renamed or removed folder, file or manifest field, a different file name rule, or a changed meaning.
- A field the Management API adds to its objects isn't a format change. It appears in the files.

## Making a snapshot

```sh
kontent model snapshot [--path <dir>] [--envId <id>] [--mapiKey <key>]
```

- **Path:** `--path`, where to write the snapshot. Default: `./model-snapshot`.
- **Environment:** `--envId`, or the default set by `kontent environment use`.
- **Credentials:** `--mapiKey`, then the `KONTENT_MAPI_KEY` environment variable, then the `kontent login` session. The first one found wins. A signed-in user needs no key.
- **Output:** stdout gets the contents of `manifest.json`. Progress and errors go to stderr.

The command name isn't final yet (see open decision 3).

## Committing a snapshot

We recommend committing the snapshot next to the generated models. Content model changes then show up in review, and CI can regenerate models from it without credentials.

The snapshot leaves out the custom elements' `json_parameters`, where some integrations keep API keys, so a committed snapshot doesn't carry them.

## Open decisions

Decision 2 is made. The proof-of-concept CLI doesn't apply it yet and still writes the field. Decision 6 decides what else to trim, and it's made before release.

1. **File names.** Use the codename when it's safe and the id otherwise, with languages always by id (as above), or use ids everywhere. Ids are always safe, but you can't tell which file is which by its name.
2. **`json_parameters`. Decided:** the CLI leaves it out. The field is optional in the documented object, no generator reads it, and a key committed to git can't be taken back. It can come back behind an option in a minor version if a reader needs it.
3. **Command name and default path.** Proposed: `kontent model snapshot` and `./model-snapshot`. The folder name says what it holds and mirrors the command; `kontent-model` reads like generated models, and `schema` clashes with GraphQL and JSON schemas.
4. **Recording the producer.** A `producer` field in the manifest would help when debugging a snapshot, but it would change with every CLI upgrade.
5. **A 403 on one kind.** Failing the whole run is simple. But if some roles can't read, say, workflows, those users get no snapshot at all.
6. **`environment.json`.** Only the JS generator reads it, for the Project, Environment and Id lines in the header of every generated file, and the id is already in the manifest. Keep it if the JS generator's output should stay identical. Otherwise drop it now: adding a kind later is a minor version, removing one is a major version.
7. **Entity order.** The Management API returns each kind's entities in an order of its own, and one file per entity can't keep it. The JS generator writes that order into its codename arrays, so they come out in a different order from a snapshot than from the API. Record the order in the manifest, or leave it to readers to sort. Adding it later is a minor version.

## Sign-off

- [ ] CLI owner
- [ ] .NET model generator owner
- [ ] JS model generator owner
