# `kontent model snapshot`

<!-- reference:start -->
Save the environment's content model as JSON files, one per entity

## Usage

```sh
kontent model snapshot [options]
```

## Options

| Option | Type | Description |
| --- | --- | --- |
| `--path` | string | Folder for the snapshot. Created when missing; otherwise it must be empty or hold a previous snapshot. Default: `./model-snapshot`. |
| `--envId` | string | Environment ID (Guid). Falls back to the default set by `kontent environment use` |
| `--mapiKey` | string | Management API key. Falls back to the KONTENT_MAPI_KEY environment variable, then to the logged-in user's token |

## Examples

```sh
# Snapshot the default environment into ./model-snapshot
kontent model snapshot

# Snapshot an environment into a folder of your choice
kontent model snapshot --envId <id> --path content-model
```
<!-- reference:end -->

## What a snapshot is

A snapshot is a folder with the environment's content model as Management API JSON,
one file per entity: the environment, content types, snippets, taxonomies, languages,
collections and workflows. Model generators and other tools read it instead of
calling the API, so they need no key. The format is described in
[SNAPSHOT.md](../../../../../SNAPSHOT.md).

Commit the folder next to the generated models. A content model change then shows
up in review as a diff, and CI can regenerate models without credentials.

## What the command writes

- Everything is fetched before the folder is touched. A failed request leaves the
  previous snapshot as it was.
- Only what changed is written, and the files of deleted entities are removed. A run
  against an unchanged environment writes nothing.
- Other files in the folder are never touched. A folder that holds other files and
  isn't a snapshot is refused.
- A custom element's `json_parameters` is left out, because it can hold API keys.
  The command says on stderr how many it left out.

## Output

stdout gets the contents of `manifest.json`. What happened to the folder goes to
stderr, and `--logLevel none` still prints the manifest.
