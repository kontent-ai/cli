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
> **Looking for the previous CLI?** The content-migration and environment
> backup/restore commands from earlier `@kontent-ai/cli` versions are
> deprecated. That functionality now lives in
> [`@kontent-ai/data-ops`](https://github.com/kontent-ai/data-ops).

## Prerequisites

- [Node.js](https://nodejs.org) LTS or newer
- A [Kontent.ai](https://app.kontent.ai) account

## Installation

Run without installing:

```sh
npx @kontent-ai/cli@latest <command>
```

Or install globally to get the `kontent` command:

```sh
npm install -g @kontent-ai/cli
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

The CLI collects anonymous usage data. See [TELEMETRY.md](./TELEMETRY.md) for details and opt-out.

## Contributing

Contributions are welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for details.

## License

Distributed under the MIT License. See [`LICENSE.md`](./LICENSE.md).

<!-- MARKDOWN LINKS & IMAGES -->
[stars-shield]: https://img.shields.io/github/stars/kontent-ai/cli.svg?style=for-the-badge
[stars-url]: https://github.com/kontent-ai/cli/stargazers
[license-shield]: https://img.shields.io/github/license/kontent-ai/cli.svg?style=for-the-badge
[license-url]: https://github.com/kontent-ai/cli/blob/master/LICENSE.md
[discussion-shield]: https://img.shields.io/discord/821885171984891914?color=%237289DA&label=Kontent%2Eai%20Discord&logo=discord&style=for-the-badge
[discussion-url]: https://discord.com/invite/SKCxwPtevJ
