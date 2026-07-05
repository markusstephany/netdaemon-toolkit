# Architecture

Deeper details on how NetDaemon Toolkit works and what it assumes about your
NetDaemon setup — split out of the README to keep that one skimmable.

## Source-deploy mode

This panel only makes sense if your NetDaemon instance runs in **source-deploy**
mode — compiling the `.cs` apps at runtime instead of loading a pre-built DLL.
A few things worth knowing if you're setting that up:

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

## NetDaemon-side apps

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

## Log view setup

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
when the reload button in this panel restarts the process inside it.
Recreation happens if you change that service's definition in
`docker-compose.yml` (image tag, env vars, volumes, …) and run
`docker-compose up -d` again, or manually `docker rm` + `docker run` it. If
that happens, repeat step 1 for the new ID, update the volume line in step 2,
and restart Home Assistant.

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
