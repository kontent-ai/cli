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
| `--api` | `delivery_api` \| `content_management_api_v2` \| `subscription_api` \| `sync_api_v2` | Restrict results to one API reference |

## Examples

```sh
# Show how to call the upsert endpoint
kontent docs endpoint 'upsert language variant'

# Compare the three best-scoring endpoints
kontent docs endpoint 'add a content type' --limit 3
```
<!-- reference:end -->
