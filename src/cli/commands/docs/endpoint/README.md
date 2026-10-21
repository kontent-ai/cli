# `kontent docs endpoint <query>`

<!-- reference:start -->
Show matching API endpoints: method, URL, parameters, responses, code samples

## Usage

```sh
kontent docs endpoint <query> [options]
```

## Arguments

| Argument | Type | Description |
| --- | --- | --- |
| `<query>` | string | The operation to look up, in plain language |

## Options

| Option | Type | Description |
| --- | --- | --- |
| `--limit` | number | Maximum number of candidates to print (1-10). Default: `1`. |
| `--compact` | boolean | Print the JSON on one line, no indentation |
| `--api` | `delivery_api` \| `content_management_api_v2` \| `subscription_api` \| `sync_api_v2` | **Required.** API reference to search in |

## Examples

```sh
# Show how to call the upsert endpoint
kontent docs endpoint 'upsert language variant' --api content_management_api_v2

# Compare the three best-scoring endpoints
kontent docs endpoint 'add a content type' --api content_management_api_v2 --limit 3
```
<!-- reference:end -->
