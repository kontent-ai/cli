# Telemetry

The Kontent.ai CLI collects anonymous usage telemetry. This document explains
what is collected, what is not, how it is identified, and how to turn it off.

## Why we collect telemetry

Telemetry helps us understand which commands are used, how often they succeed or
fail, and how long they take, so we can prioritize fixes and improvements.
Collection is best-effort and never affects command behavior: if telemetry fails
or is disabled, commands run exactly the same.

## Consent

Telemetry is **opt-out**: it is on by default in release builds unless one of the
conditions in [How to disable telemetry](#how-to-disable-telemetry) applies. The
first time the CLI sends telemetry, it prints a one-time notice:

```text
The Kontent.ai CLI sends anonymous usage telemetry (command name, success/failure,
duration) to help improve it. Opt out: kontent telemetry disable
```

## What is collected

Every event carries a small, fixed set of properties:

| Property      | Description                                            |
| ------------- | ------------------------------------------------------ |
| `outcome`     | `success` or `error`                                   |
| `error-code`  | A machine-readable error code (only when `outcome` is `error`) |
| `duration-ms` | Command execution time in milliseconds                 |
| `device_id`   | Anonymous, randomly generated device identifier        |
| `user_id`     | Your Kontent.ai user id (only when you are logged in)  |
| `platform`    | Always `CLI`                                           |
| `app_version` | CLI version                                            |
| `os_name`     | Operating system name (e.g. `darwin`, `linux`, `win32`)|
| `os_version`  | Operating system release version                       |

### Events

Commands that send telemetry emit a single event named `cli__<command-path>` —
the command and any subcommands in kebab-case (e.g. `kontent login` →
`cli__login`, `kontent project sample bootstrap` → `cli__project-sample-bootstrap`).
Not every command sends telemetry.

Beyond the fixed properties above, some commands attach a few Kontent.ai resource
identifiers (GUIDs) for the resource they act on — e.g. bootstrap adds `project`,
`subscription`, `sample-project-type`. These are never content, credentials, or
command argument values.

## What is NOT collected

- Credentials of any kind: API keys, access tokens, passwords.
- The contents of your project, items, assets, or any managed content.
- Command argument values (only the fixed properties listed above are sent).
- Your email address or other personal information beyond the `user_id`.

## Identifiers

- **`device_id`** — a random UUID generated on first run and stored locally. It
  identifies a machine, not a person.
- **`user_id`** — your Kontent.ai user id, attached only while you are logged in.
  It is cleared on `logout` so telemetry stops identifying the previous user.

The `device_id` is a random value with no link to your machine's hardware,
network, or account, so an event cannot be traced back to a specific person
through it. The `user_id` is your Kontent.ai user id and is only ever attached
while you are signed in.

Both values are stored in the CLI config file with owner-only permissions
(`0600`):

- Linux: `$XDG_CONFIG_HOME/kontent/cli/config.json` (defaults to
  `~/.config/kontent/cli/config.json`)
- macOS: `~/.config/kontent/cli/config.json`
- Windows: `%APPDATA%\kontent\cli\config.json`

If `XDG_CONFIG_HOME` is set, it takes precedence over the default location on all
platforms.

## How to disable telemetry

Telemetry is automatically off when:

- the `DO_NOT_TRACK` environment variable is set;
- the `KONTENT_DO_NOT_TRACK` environment variable is set;
- it has been disabled in the config file (`telemetryEnabled: false`);
- a CI environment is detected;
- the build has no telemetry API key (e.g. local development builds).

The resolution order is: `DO_NOT_TRACK` → `KONTENT_DO_NOT_TRACK` → config file →
CI detection → missing API key. Any one of these turns telemetry off.

### CLI commands

```sh
kontent telemetry enable    # opt in
kontent telemetry disable   # opt out
kontent telemetry status    # show current state and the reason
```

The setting is stored in the config file. Note that the environment variables
above always take precedence: if `DO_NOT_TRACK` or `KONTENT_DO_NOT_TRACK` is
set, telemetry stays off even after `kontent telemetry enable`.

### Environment variables

| Variable                  | Effect                                                       |
| ------------------------- | ----------------------------------------------------------- |
| `DO_NOT_TRACK`            | Disables telemetry (industry-standard opt-out).             |
| `KONTENT_DO_NOT_TRACK`    | Disables telemetry (Kontent.ai-specific opt-out).           |
| `KONTENT_TELEMETRY_DEBUG` | Prints events to stderr without sending them (dry run).     |

## Retention

Telemetry data is retained in line with the Kontent.ai
[Privacy Policy](https://kontent.ai/privacy/).

## Third-party provider

Telemetry is processed by [Amplitude](https://amplitude.com/) in the United
States (US) data center.

## Privacy

Telemetry is processed in the US and handled in line with the GDPR. We collect
the minimum needed to improve the CLI, you can opt out at any time (see above),
and we never sell or monetize the data.

For details on how Kontent.ai handles data, see the
[Privacy Policy](https://kontent.ai/privacy/).

Questions or concerns: <privacy@kontent.ai>
