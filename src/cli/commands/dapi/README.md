# `kontent dapi <endpoint>`

Sends a GET request to an environment's Delivery API and prints the JSON response.
Use it to read content the way a website gets it: published content by default, or
the latest unpublished changes with `--preview`. To change content, use `kontent mapi`.

## Keys

A key is needed for `--preview` and for environments with secure access. The CLI uses
the first of:

1. an `Authorization` header passed with `-H`,
2. `--dapiKey <key>`,
3. the `KONTENT_DAPI_KEY` environment variable.

`--dapiKey` ends up in shell history and the process list. To set the variable without
either, run the line for your shell. Each one does the same thing: it asks for the key
without showing it or saving it to history, and sets it for the current terminal session.

```sh
# bash, zsh
read -rs KONTENT_DAPI_KEY && export KONTENT_DAPI_KEY

# PowerShell 7.1+
$env:KONTENT_DAPI_KEY = Read-Host -MaskInput "Delivery API key"
```

## Paging

`--paginate` follows every page (the `next_page` URL, or the `X-Continuation` header for
`items-feed` and `used-in`) and prints each page as it arrives, one JSON document per page. `--slurp`
wraps them in one JSON array. `--maxPages <n>` stops early and prints the command that
continues from there. If a page fails, the pages before it stay printed, and the CLI
prints the command that retries from the failed page.

<!-- reference:start -->
Send a request to the Delivery API

## Usage

```sh
kontent dapi <endpoint> [options]
```

## Arguments

| Argument | Type | Description |
| --- | --- | --- |
| `<endpoint>` | string | Delivery API path relative to the environment, e.g. "items" or "types/article", not "<environment_id>/items".
The environment comes from --envId or the default set by `kontent environment use`. |

## Options

| Option | Type | Description |
| --- | --- | --- |
| `--envId` | string | Environment ID (Guid). Falls back to the default set by `kontent environment use` |
| `--preview` | boolean | Use the Delivery Preview API for the latest, unpublished content. Needs a key with Content preview access |
| `--dapiKey` | string | Delivery API key, needed for preview and for environments with secure access. Visible in shell history and the process list; prefer the KONTENT_DAPI_KEY environment variable |
| `--header`, `-H` | string[] | Request header in the "Name: value" format. Repeatable. An Authorization header takes precedence over --dapiKey and KONTENT_DAPI_KEY |
| `--include`, `-i` | boolean | Print the status line and response headers before the body |
| `--waitForNewContent` | boolean | Wait for the latest content instead of a cached copy; use it right after changing content |
| `--paginate` | boolean | Fetch every page and print each as it arrives, one JSON document per page. Use --slurp for a single array |
| `--slurp` | boolean | With --paginate, print all pages as one JSON array |
| `--maxPages` | number | With --paginate, stop after this many pages |

## Examples

```sh
# List the first 10 published content items
kontent dapi 'items?limit=10' --envId <id>

# Get the latest version of an item
kontent dapi items/my_article --preview

# Print the codename of every item
kontent dapi items-feed --paginate | jq '.items[].system.codename'

# Save every article as one JSON array
kontent dapi 'items?system.type=article' --paginate --slurp > articles.json

# List published items that reference an item
kontent dapi items/my_article/used-in

# List published items that reference an asset
kontent dapi assets/my_image/used-in

# Set the key without echoing it or writing it to shell history
read -rs KONTENT_DAPI_KEY && export KONTENT_DAPI_KEY
```
<!-- reference:end -->
