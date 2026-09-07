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
| `--limit` | number | Maximum number of results (1-10). Default: `10`. |

## Examples

```sh
# Find the pages that answer a question
kontent docs search 'how to filter by taxonomy'

# Keep only the three best matches
kontent docs search 'language variant' --limit 3
```
<!-- reference:end -->
