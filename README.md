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

## Features

- Sidebar panel with a file list (`.cs` only) and a plain-text editor.
- Reads/writes files confined to one configured directory (default
  `/config/netdaemon`) — no path traversal, no other file types.
- Shows configured NetDaemon **status entities** (reload status / compile
  errors) next to the editor, so you don't edit blind.
- Regenerates typed Home Assistant entities (codegen) and reloads the
  NetDaemon runtime, both from the panel — neither needs Docker access; both
  run as plain NetDaemon-side subprocesses/events (see below).
- Optional webhook relay: forward one or more HA webhooks onto the event bus
  so NetDaemon apps can react to them without an `automations.yaml` shim.
- Admin-only access throughout. No build step, no external dependencies.

## NetDaemon setup (source-deploy mode)

This panel only makes sense if your NetDaemon instance runs in **source-deploy**
mode — compiling the `.cs` apps at runtime instead of loading a pre-built DLL.
A few things to know if you're setting that up:

- Set `NetDaemon__AppSource=/path/to/apps` (env var) instead of pointing
  NetDaemon at a built app. This switches it to compile your `.cs` files
  in-memory (Roslyn) at startup.
- **No custom NuGet packages** — source-deploy only has access to whatever's
  already in the base image, there's no `dotnet restore` step. NetDaemon's
  own docs call this mode "not recommended for production" for that reason;
  it's a deliberate trade-off here in exchange for editing/reloading from HA.
  This reference set is also narrower than a normal SDK build in less obvious
  ways — e.g. `System.Diagnostics.Process` doesn't resolve at compile time
  even though the assembly is present at runtime (`CodegenApp.cs` works
  around this with reflection instead of a direct type reference).
- **Don't drop a `.csproj` into the apps folder.** NetDaemon just scans it for
  `.cs` files; an extra `.csproj` there can also make `nd-codegen` (used by
  this panel's "regenerate entities" button) hang scanning it recursively.
- **No hot-reload** — even in source-deploy mode, code changes only take
  effect after a process restart. That's exactly what `ControlApp` (below)
  is for: it turns an HA event into a restart.
- The apps folder needs to be reachable from **both** containers — NetDaemon
  to run it, Home Assistant (this panel) to edit it — so bind-mount the same
  host directory into both.

## Requirements

Home Assistant must be able to see the NetDaemon source folder. If NetDaemon
runs in a separate container, bind-mount its app folder into the HA container,
e.g. `/path/to/netdaemon:/config/netdaemon`.

Reload, status, and codegen only work if three small NetDaemon apps are also
running inside your NetDaemon instance — see below. Without them the panel
still works as a plain file editor. The log view is optional and needs one
more thing set up — see "Log view setup" below — but **no Docker socket or
API access, ever**: not for this, not for anything else in this integration.

## Installation (HACS, custom repository)

1. HACS → Integrations → ⋮ → Custom repositories → add this repo as type
   *Integration*.
2. Install "NetDaemon Toolkit", restart Home Assistant.
3. Settings → Devices & Services → Add Integration → "NetDaemon Toolkit".
4. Set the directory and, optionally, the console log path and any webhook
   relays (see below).
5. On setup, the integration writes `apps/_toolkit/ControlApp.cs`,
   `StatusApp.cs`, and `CodegenApp.cs` into your configured directory
   automatically — but only the ones missing, so it never overwrites files
   you've customized. Restart NetDaemon once to pick them up; that gets you
   the reload button, the status/heartbeat display, and codegen in the panel.

## Configuration

| Option | Default | Meaning |
|---|---|---|
| `directory` | `/config/netdaemon` | Folder whose `.cs` files are editable |
| `console_log` | — | Optional, path (from HA's own point of view) to NetDaemon's console log — see "Log view setup" below |
| `webhook_relays` | — | Optional, one relay per line: `<webhook_id>:<event_type>`. Each configured webhook fires the given event on HA's event bus with the webhook's JSON body as event data, so a NetDaemon app can subscribe to it directly. |

Webhook relays need a full Home Assistant restart to pick up config changes
(they're registered once at startup, alongside the WebSocket commands).

## Log view setup (optional)

The log view needs one read-only bind mount — nothing else, no Docker socket,
no API access. Docker already writes every container's console output to a
plain JSON-lines file on the host (the default `json-file` logging driver);
this just reads that file directly.

1. Find the file (on the Docker host, not inside any container):
   ```
   docker inspect <netdaemon-container-name> --format '{{.LogPath}}'
   ```
2. Bind-mount that exact path **read-only** into Home Assistant's own
   container, at a path of your choosing:
   ```yaml
   homeassistant:
     volumes:
       - /var/lib/docker/containers/<id>/<id>-json.log:/config/netdaemon-console.log:ro
   ```
3. Set `console_log` in the integration's config to whatever path you chose
   on the HA side of that mount (`/config/netdaemon-console.log` in the
   example above — this is the path **inside the HA container**, not the
   host path from step 1).

**When the path from step 1 changes:** only when the NetDaemon container is
*recreated* (a new container, new ID) — not on a plain `docker restart`, not
when the reload button in this panel restarts the process inside it. Recreation
happens if you change that service's definition in `docker-compose.yml` (image
tag, env vars, volumes, …) and run `docker-compose up -d` again, or manually
`docker rm` + `docker run` it. If that happens, repeat step 1 for the new ID,
update the volume line in step 2, and restart Home Assistant.

Since this reads the container's raw output independently of NetDaemon's own
code, it works even for the case NetDaemon's own status/heartbeat file can't
cover: a broken build. If your last edit doesn't compile, no app — not even
StatusApp — ever gets to run, but Docker was already capturing console output
before that point, so the compiler's error still shows up here.

Docker's `json-file` driver has **no size cap by default** — consider adding
`logging: driver: json-file, options: {max-size: "10m", max-file: "3"}` to
the NetDaemon service in your `docker-compose.yml` if you don't already
rotate logs some other way; this is independent of the panel and worth doing
regardless.

## NetDaemon-side apps (installed automatically)

Three tiny NetDaemon apps that the panel talks to, separate from the HA
integration because they run inside NetDaemon itself, not inside HA. The
integration writes them into `apps/_toolkit/` under your configured
directory the first time it sets up (skipped if the files already exist):

- **ControlApp** — listens for the `netdaemon_toolkit_reload` HA event (fired
  by the panel's reload button) and exits the process; the container
  supervisor restarts NetDaemon, which recompiles the source apps.
- **StatusApp** — writes a heartbeat file (`.nd_status.json`) every few
  seconds so the panel can show whether NetDaemon is alive. If the source
  fails to compile, no app runs (not even this one), the file goes stale,
  and the panel's status turns red.
- **CodegenApp** — listens for the `netdaemon_toolkit_codegen` HA event
  (fired by the panel's regenerate-entities button), installs and runs
  `nd-codegen` as a plain subprocess of itself (no Docker access needed —
  it already has everything it needs: `dotnet`, network access, and its own
  `HomeAssistant__*` connection env vars), and writes the outcome to a
  result file the panel polls for.

They're ordinary NetDaemon apps — safe to move or edit once installed, the
integration only ever writes them if they're missing.

## Security

Access is restricted to the configured directory and to `.cs` files, paths are
resolved and checked against escaping, and every WebSocket command (reads
included) requires an admin user — matching the panel itself, which is
`require_admin`-gated.

No feature in this integration needs Docker socket or API access — reload and
codegen are plain NetDaemon-side events/subprocesses, and the log view (if
configured) reads one bind-mounted file directly. The log-view mount is
read-only and scoped to one specific file; the worst case if HA itself were
compromised is exposure of that one log's contents, not control over Docker
or the host.

## License

MIT.
