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
| `--path` | string | Folder for the snapshot. Created when missing; otherwise it must be empty or hold a previous snapshot. Default: `./kontent-snapshot`. |
| `--envId` | string | Environment ID (Guid). Falls back to the default set by `kontent environment use` |
| `--mapiKey` | string | Management API key. Falls back to the KONTENT_MAPI_KEY environment variable, then to the logged-in user's token |

## Examples

```sh
# Snapshot the default environment into ./kontent-snapshot
kontent model snapshot

# Snapshot an environment into a folder of your choice
kontent model snapshot --envId <id> --path content-model
```
<!-- reference:end -->
