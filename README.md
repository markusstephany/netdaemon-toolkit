# NetDaemon Toolkit

A tiny Home Assistant custom integration that adds a sidebar panel for managing
a [NetDaemon](https://netdaemon.xyz/) instance running in **source-deploy**
mode — straight from the HA frontend (and therefore from anywhere via Nabu
Casa, no VPN/port-forward needed).

It started as an **emergency single-file editor** and has grown to cover the
day-to-day loop around it: triggering entity codegen, reloading the runtime,
and reading its status. Real development still happens in VS Code / Rider —
this is for the "I'm away and one app won't compile" moment, or a quick edit
without opening an IDE.

📖 Deeper dive into how it's built: [docs/architecture.md](docs/architecture.md) (English) · [Blogbeitrag auf Deutsch](https://blog.stephanys.de/2026/07/netdaemon-toolkit-netdaemon-apps-direkt-aus-home-assistant-heraus-verwalten)

## Features

- Sidebar panel with a file list (`.cs` only) and a plain-text editor.
- Reads/writes files confined to one configured directory (default
  `/config/netdaemon`) — no path traversal, no other file types.
- Shows configured NetDaemon **status entities** (reload status / compile
  errors) next to the editor, so you don't edit blind.
- Regenerates typed Home Assistant entities (codegen) and reloads the
  NetDaemon runtime, both from the panel.
- Optional log view and webhook relay (forward HA webhooks onto the event
  bus so NetDaemon apps can react to them without an `automations.yaml` shim).
- No Docker socket or API access anywhere in this integration.
- Admin-only access throughout. No build step, no external dependencies.

## Requirements

- NetDaemon running in **source-deploy** mode. See
  [docs/architecture.md](docs/architecture.md) for what that entails and its
  trade-offs.
- Home Assistant must be able to see the NetDaemon source folder — bind-mount
  it into the HA container, e.g. `/path/to/netdaemon:/config/netdaemon`.
- Reload, status, and codegen need three small NetDaemon-side apps, which the
  integration installs into your NetDaemon folder automatically on setup (see
  Installation below). Without them the panel still works as a plain file
  editor.

## Installation (HACS, custom repository)

1. HACS → Integrations → ⋮ → Custom repositories → add this repo as type
   *Integration*.
2. Install "NetDaemon Toolkit", restart Home Assistant.
3. Settings → Devices & Services → Add Integration → "NetDaemon Toolkit".
4. Set the directory and, optionally, the console log path and any webhook
   relays (see Configuration below).
5. Restart NetDaemon once, **the normal way you already restart it** (Docker,
   the add-on, however you manage it — not from inside the panel). The
   integration writes `ControlApp.cs`, `StatusApp.cs`, and `CodegenApp.cs`
   into `apps/_toolkit/` under your configured directory on setup — but only
   the ones missing, so it never overwrites files you've customized. This
   first restart is what gets these apps running in the first place; the
   panel's own reload button won't do anything yet, since it works by
   asking `ControlApp` to restart NetDaemon, and `ControlApp` isn't running
   until after this restart. Every restart after this first one can go
   through the panel. (Home Assistant will also show a persistent
   notification as a reminder whenever this applies.)

## Configuration

| Option | Default | Meaning |
|---|---|---|
| `directory` | `/config/netdaemon` | Folder whose `.cs` files are editable |
| `console_log` | — | Optional, path (from HA's own point of view) to NetDaemon's console log. Setup steps: [docs/architecture.md](docs/architecture.md#log-view-setup) |
| `webhook_relays` | — | Optional, one relay per line: `<webhook_id>:<event_type>`. Each configured webhook fires the given event on HA's event bus with the webhook's JSON body as event data, so a NetDaemon app can subscribe to it directly. Changes take effect as soon as you save (reconfigure), no restart needed. |

## Security

Access is restricted to the configured directory and to `.cs` files, paths
are resolved and checked against escaping, and every WebSocket command
(reads included) requires an admin user. No feature needs Docker socket or
API access — see [docs/architecture.md](docs/architecture.md) for how
reload, codegen, and the log view work.

## License

MIT.
