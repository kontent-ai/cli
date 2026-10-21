# `kontent docs object <query>`

<!-- reference:start -->
Show matching API reference objects and their properties

## Usage

```sh
kontent docs object <query> [options]
```

## Arguments

| Argument | Type | Description |
| --- | --- | --- |
| `<query>` | string | The object to look up, in plain language |

## Options

| Option | Type | Description |
| --- | --- | --- |
| `--limit` | number | Maximum number of candidates to print (1-10). Default: `1`. |
| `--compact` | boolean | Print the JSON on one line, no indentation |
| `--api` | `delivery_api` \| `content_management_api_v2` \| `subscription_api` \| `sync_api_v2` | **Required.** API reference to search in |

## Examples

```sh
# List the properties of an API object
kontent docs object 'language variant' --api content_management_api_v2

# Describe the element as the Delivery API returns it
kontent docs object 'text element' --api delivery_api
```
<!-- reference:end -->
