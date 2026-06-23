[![Stargazers][stars-shield]][stars-url]
[![MIT License][license-shield]][license-url]
[![Discord][discussion-shield]][discussion-url]

# Kontent.ai CLI

Command-line interface for [Kontent.ai](https://kontent.ai).

> [!WARNING]
> **Under active development.** The command surface is incomplete and may change
> between releases. More commands are added incrementally. Breaking changes may
> occur.

> [!IMPORTANT]
> **Looking for the previous CLI?** The legacy `@kontent-ai/cli` commands for
> content migrations and environment backup/restore are deprecated. That
> functionality now lives in
> [`@kontent-ai/data-ops`](https://github.com/kontent-ai/data-ops).

## Prerequisites

- [Node.js](https://nodejs.org) LTS or newer
- A [Kontent.ai](https://app.kontent.ai) account

## Installation

Run without installing:

```sh
npx kontent-cli@latest <command>
```

Or install globally to get the `kontent` command:

```sh
npm install -g kontent-cli
kontent <command>
```

Using `@latest` ensures you run the newest version.

## Authentication

Most commands require you to be signed in.

```sh
kontent login
kontent logout
```

## Commands

Run `kontent --help` for the full, always-current list.
Each command supports `--help` for its own options.

## Global options

- `--logLevel`, `-ll` — detail level: `none`, `standard` (default), `verbose`
- `--verbose` — shortcut for `--logLevel verbose`
- `--configFile` — path to a JSON file with CLI parameters
- `--help`, `-h` / `--version`, `-v`

Options can also be supplied via `KONTENT_*` environment variables.

## Telemetry

The CLI collects anonymous usage data. See [telemetry.md](./telemetry.md) for details and opt-out.

## Contributing

Contributions are welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for details.

## License

Distributed under the MIT License. See [`LICENSE.md`](./LICENSE.md).

<!-- MARKDOWN LINKS & IMAGES -->
[stars-shield]: https://img.shields.io/github/stars/kontent-ai/kontent-cli.svg?style=for-the-badge
[stars-url]: https://github.com/kontent-ai/kontent-cli/stargazers
[license-shield]: https://img.shields.io/github/license/kontent-ai/kontent-cli.svg?style=for-the-badge
[license-url]: https://github.com/kontent-ai/kontent-cli/blob/main/LICENSE.md
[discussion-shield]: https://img.shields.io/discord/821885171984891914?color=%237289DA&label=Kontent%2Eai%20Discord&logo=discord&style=for-the-badge
[discussion-url]: https://discord.com/invite/SKCxwPtevJ
