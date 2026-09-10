# `kontent docs search <query>`

<!-- reference:start -->
Search Kontent.ai Learn docs and API reference, ranked by relevance

## Usage

```sh
kontent docs search <query> [options]
```

## Arguments

| Argument | Type | Description |
| --- | --- | --- |
| `<query>` | string | What to look for, in plain language |

## Options

| Option | Type | Description |
| --- | --- | --- |
| `--limit` | number | Maximum number of candidates to print (1-10). Default: `10`. |
| `--compact` | boolean | Print the JSON on one line, no indentation |
| `--api` | `delivery_api` \| `content_management_api_v2` \| `subscription_api` \| `sync_api_v2` | Restrict results to one API reference; conceptual guides are excluded when set |

## Examples

```sh
# Find the pages that answer a question
kontent docs search 'how to filter by taxonomy'

# Keep only the three best matches
kontent docs search 'language variant' --limit 3

# Keep only Delivery API reference pages
kontent docs search 'webhook' --api delivery_api
```
<!-- reference:end -->
