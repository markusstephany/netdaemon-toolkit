"""WebSocket commands for listing, reading and writing NetDaemon source files.

All file access is confined to the configured base directory and to the allowed
file extensions, so the panel cannot reach the rest of the config tree.
"""
import asyncio
import json
import os
import re
import shutil
import time
from pathlib import Path

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .const import (
    ACTIVE_ASSEMBLY_REL,
    APP_DIR_REL,
    APP_ENTRY_FILE,
    APP_LAST_DIR_REL,
    CODEGEN_EVENT,
    CODEGEN_RESULT_REL,
    CODEGEN_TIMEOUT,
    CONF_CONSOLE_LOG,
    CONF_DIRECTORY,
    CONTAINER_DATA_ROOT,
    DEFAULT_CONSOLE_LOG,
    DEFAULT_DIRECTORY,
    DEFAULT_EXTENSIONS,
    DOMAIN,
    EXPECTED_APPLICATION_ASSEMBLY,
    REBUILD_EVENT,
    REBUILD_RESULT_REL,
    REBUILD_TIMEOUT,
    SOURCE_HOST_ASSEMBLY,
    TOOLKIT_APPS_REL,
)

_ANSI = re.compile(r"\x1b\[[0-9;]*m")
# Trace files live in <base>/.traces/<app-slug>.jsonl; the slug is class-name
# snake_case, so this also guards against path traversal in the app id.
_TRACE_SLUG = re.compile(r"^[a-z0-9_]+$")


def _lang(hass: HomeAssistant) -> str:
    """Match the frontend's own hass.language check (English fallback)."""
    return "de" if (hass.config.language or "en").startswith("de") else "en"


def _is_reserved(rel: Path) -> bool:
    """Only the toolkit's own managed folder (apps/_toolkit) is protected —
    not every "_"-prefixed name, so a user's own such folders behave like
    any other folder instead of silently disappearing."""
    reserved = Path(TOOLKIT_APPS_REL)
    return rel == reserved or reserved in rel.parents


def _reject_if_reserved(hass, connection, msg, *paths: Path) -> bool:
    """Send a "reserved" error and return True if any of the given
    (already base-relative-safe) absolute paths falls inside apps/_toolkit —
    that folder is managed by the integration itself and read-only here."""
    base = _base_dir(hass)
    for p in paths:
        if _is_reserved(p.relative_to(base)):
            connection.send_error(
                msg["id"], "reserved", "managed by the integration; read-only in the panel"
            )
            return True
    return False


def _read_console_log(path: Path, tail: int) -> str:
    """Read the last `tail` entries of the mounted NetDaemon console log.

    Supports two formats, auto-detected per line:
    - Docker's own json-file container log — one JSON object per line
      ({"log": "...", "stream": "...", "time": "..."}), written by Docker
      itself independently of anything NetDaemon does. This is what makes
      it work even for a compile failure that crashes before any of our own
      code runs. No size cap here; if the file has no docker-level log
      rotation configured it can grow large — see the README.
    - Plain text — e.g. from a `docker logs -f <name> >> file` tail that
      survives container recreation (unlike a direct bind mount of Docker's
      own log file, which is tied to the container's ID and goes stale the
      moment it's recreated). A line that isn't valid JSON is used as-is.
    """
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    out = []
    for line in lines[-tail:]:
        stripped = line.strip()
        if not stripped:
            continue
        try:
            entry = json.loads(stripped)
        except ValueError:
            out.append(line + "\n")
            continue
        out.append(entry.get("log", ""))
    return _ANSI.sub("", "".join(out))


def _base_dir(hass: HomeAssistant) -> Path:
    cfg = hass.data.get(DOMAIN, {}).get("config", {})
    return Path(cfg.get(CONF_DIRECTORY, DEFAULT_DIRECTORY)).resolve()


def _safe_path(hass: HomeAssistant, rel: str) -> Path:
    """Resolve a relative path inside the base dir, rejecting escapes.

    File type is not restricted here: the base directory itself is the
    security boundary (the "show all files" toggle lets the panel edit any
    file under it, not just .cs).
    """
    base = _base_dir(hass)
    target = (base / rel).resolve()
    if target != base and base not in target.parents:
        raise ValueError("path outside of base directory")
    return target


def _safe_dir(hass: HomeAssistant, rel: str) -> Path:
    """Resolve a directory inside the base dir (never the base itself)."""
    base = _base_dir(hass)
    target = (base / rel).resolve()
    if target == base or base not in target.parents:
        raise ValueError("path outside of base directory")
    return target


def _list_files(base: Path, all_files: bool) -> list[str]:
    if not base.exists():
        return []
    out = []
    for p in sorted(base.rglob("*")):
        if not p.is_file():
            continue
        if not all_files and p.suffix not in DEFAULT_EXTENSIONS:
            continue
        out.append(p.relative_to(base).as_posix())
    return out


def _list_folders(base: Path) -> list[str]:
    """List every folder, including empty ones — the file list alone can't
    surface a folder with no .cs files in it yet."""
    if not base.exists():
        return []
    out = []
    for p in sorted(base.rglob("*")):
        if not p.is_dir():
            continue
        out.append(p.relative_to(base).as_posix())
    return out


def _is_admin(connection) -> bool:
    return connection.user is not None and connection.user.is_admin


def _read_application_assembly(base: Path) -> str | None:
    p = base / ".nd_status.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8")).get("applicationAssembly")
    except Exception:
        return None


async def _compiled_build_ready(hass: HomeAssistant, base: Path) -> bool:
    application_assembly = await hass.async_add_executor_job(_read_application_assembly, base)
    return application_assembly == EXPECTED_APPLICATION_ASSEMBLY


def _read_current_mode(base: Path) -> str | None:
    """Read the ActiveAssemblyPath symlink's *current target* directly off the shared volume --
    no need to ask the container at all, this is just a file. "compiled" only when the symlink
    exists and points at our own build; "source" both when it points at the vendor's own host AND
    when the symlink doesn't exist at all yet (NetDaemon__ApplicationAssembly unset entirely is
    functionally the same source-deploy path, just via the run script's other branch -- see
    const.py). None only for a genuinely unexpected target -- should no longer happen for rollback
    since that now swaps app/<->app-last/ in place rather than pointing the symlink at app-last."""
    try:
        target = os.readlink(base / ACTIVE_ASSEMBLY_REL)
    except OSError:
        return "source"
    if target == SOURCE_HOST_ASSEMBLY:
        return "source"
    if target == f"{CONTAINER_DATA_ROOT}/{APP_DIR_REL}/{APP_ENTRY_FILE}":
        return "compiled"
    return None


def _not_ready_reason(hass: HomeAssistant) -> str:
    return {
        "en": f"NetDaemon__ApplicationAssembly isn't set to {EXPECTED_APPLICATION_ASSEMBLY} yet in "
        "docker-compose.yml. Add it and restart the container once -- after that, this takes effect.",
        "de": f"NetDaemon__ApplicationAssembly steht in der docker-compose.yml noch nicht auf "
        f"{EXPECTED_APPLICATION_ASSEMBLY}. Einmal eintragen und den Container neu starten -- danach wirkt das.",
    }[_lang(hass)]


@websocket_api.websocket_command(
    {
        vol.Required("type"): "netdaemon_toolkit/list",
        vol.Optional("all_files", default=False): bool,
    }
)
@websocket_api.async_response
async def ws_list(hass, connection, msg):
    if not _is_admin(connection):
        connection.send_error(msg["id"], "unauthorized", "admin required")
        return
    base = _base_dir(hass)
    files = await hass.async_add_executor_job(_list_files, base, msg["all_files"])
    folders = await hass.async_add_executor_job(_list_folders, base)
    connection.send_result(
        msg["id"],
        {
            "directory": str(base),
            "files": files,
            "folders": folders,
            # Managed by this integration itself — shown read-only in the panel.
            "reserved": [TOOLKIT_APPS_REL],
        },
    )


@websocket_api.websocket_command(
    {vol.Required("type"): "netdaemon_toolkit/read", vol.Required("path"): str}
)
@websocket_api.async_response
async def ws_read(hass, connection, msg):
    if not _is_admin(connection):
        connection.send_error(msg["id"], "unauthorized", "admin required")
        return
    try:
        path = _safe_path(hass, msg["path"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_path", str(err))
        return
    content = await hass.async_add_executor_job(
        lambda: path.read_text(encoding="utf-8") if path.exists() else ""
    )
    connection.send_result(msg["id"], {"path": msg["path"], "content": content})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "netdaemon_toolkit/write",
        vol.Required("path"): str,
        vol.Required("content"): str,
    }
)
@websocket_api.async_response
async def ws_write(hass, connection, msg):
    # Writing config files is admin-only.
    if connection.user is None or not connection.user.is_admin:
        connection.send_error(msg["id"], "unauthorized", "admin required")
        return
    try:
        path = _safe_path(hass, msg["path"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_path", str(err))
        return
    if _reject_if_reserved(hass, connection, msg, path):
        return

    def _write() -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(msg["content"], encoding="utf-8")

    await hass.async_add_executor_job(_write)
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "netdaemon_toolkit/create",
        vol.Required("path"): str,
        vol.Optional("content", default=""): str,
    }
)
@websocket_api.async_response
async def ws_create(hass, connection, msg):
    if not _is_admin(connection):
        connection.send_error(msg["id"], "unauthorized", "admin required")
        return
    try:
        path = _safe_path(hass, msg["path"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_path", str(err))
        return
    if _reject_if_reserved(hass, connection, msg, path):
        return
    if path.exists():
        connection.send_error(msg["id"], "exists", "file already exists")
        return

    def _do() -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(msg.get("content", ""), encoding="utf-8")

    await hass.async_add_executor_job(_do)
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "netdaemon_toolkit/create_folder",
        vol.Required("path"): str,
    }
)
@websocket_api.async_response
async def ws_create_folder(hass, connection, msg):
    if not _is_admin(connection):
        connection.send_error(msg["id"], "unauthorized", "admin required")
        return
    try:
        path = _safe_dir(hass, msg["path"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_path", str(err))
        return
    if _reject_if_reserved(hass, connection, msg, path):
        return
    if path.exists():
        connection.send_error(msg["id"], "exists", "folder already exists")
        return
    await hass.async_add_executor_job(lambda: path.mkdir(parents=True))
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "netdaemon_toolkit/rename",
        vol.Required("path"): str,
        vol.Required("new_path"): str,
    }
)
@websocket_api.async_response
async def ws_rename(hass, connection, msg):
    if not _is_admin(connection):
        connection.send_error(msg["id"], "unauthorized", "admin required")
        return
    try:
        src = _safe_path(hass, msg["path"])
        dst = _safe_path(hass, msg["new_path"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_path", str(err))
        return
    if _reject_if_reserved(hass, connection, msg, src, dst):
        return
    if not src.exists():
        connection.send_error(msg["id"], "not_found", "source does not exist")
        return
    if dst.exists():
        connection.send_error(msg["id"], "exists", "target already exists")
        return

    def _do() -> None:
        dst.parent.mkdir(parents=True, exist_ok=True)
        src.rename(dst)

    await hass.async_add_executor_job(_do)
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "netdaemon_toolkit/delete",
        vol.Required("path"): str,
    }
)
@websocket_api.async_response
async def ws_delete(hass, connection, msg):
    if not _is_admin(connection):
        connection.send_error(msg["id"], "unauthorized", "admin required")
        return
    try:
        path = _safe_path(hass, msg["path"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_path", str(err))
        return
    if _reject_if_reserved(hass, connection, msg, path):
        return
    if not path.exists():
        connection.send_error(msg["id"], "not_found", "file does not exist")
        return
    await hass.async_add_executor_job(path.unlink)
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "netdaemon_toolkit/rename_folder",
        vol.Required("path"): str,
        vol.Required("new_path"): str,
    }
)
@websocket_api.async_response
async def ws_rename_folder(hass, connection, msg):
    if not _is_admin(connection):
        connection.send_error(msg["id"], "unauthorized", "admin required")
        return
    try:
        src = _safe_dir(hass, msg["path"])
        dst = _safe_dir(hass, msg["new_path"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_path", str(err))
        return
    if _reject_if_reserved(hass, connection, msg, src, dst):
        return
    if not src.is_dir():
        connection.send_error(msg["id"], "not_found", "folder does not exist")
        return
    if dst.exists():
        connection.send_error(msg["id"], "exists", "target already exists")
        return

    def _do() -> None:
        dst.parent.mkdir(parents=True, exist_ok=True)
        src.rename(dst)

    await hass.async_add_executor_job(_do)
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "netdaemon_toolkit/delete_folder",
        vol.Required("path"): str,
    }
)
@websocket_api.async_response
async def ws_delete_folder(hass, connection, msg):
    if not _is_admin(connection):
        connection.send_error(msg["id"], "unauthorized", "admin required")
        return
    try:
        path = _safe_dir(hass, msg["path"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_path", str(err))
        return
    if _reject_if_reserved(hass, connection, msg, path):
        return
    if not path.is_dir():
        connection.send_error(msg["id"], "not_found", "folder does not exist")
        return
    await hass.async_add_executor_job(lambda: shutil.rmtree(path))
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command({vol.Required("type"): "netdaemon_toolkit/status"})
@websocket_api.async_response
async def ws_status(hass, connection, msg):
    """Read the NetDaemon heartbeat file (.nd_status.json) and report liveness.

    Also reports whether NetDaemon__ApplicationAssembly is set to the expected symlink path --
    same idiom as CONF_CONSOLE_LOG (see const.py): no separate on/off setting, the panel just
    shows the Rebuild/switch/rollback actions once this one-time docker-compose.yml edit has
    actually been made, and stays exactly as it is today otherwise.
    """
    if not _is_admin(connection):
        connection.send_error(msg["id"], "unauthorized", "admin required")
        return
    base = _base_dir(hass)

    def _read_ts():
        p = base / ".nd_status.json"
        if not p.exists():
            return None
        try:
            return int(json.loads(p.read_text(encoding="utf-8")).get("ts"))
        except Exception:
            return None

    ts = await hass.async_add_executor_job(_read_ts)
    application_assembly = await hass.async_add_executor_job(_read_application_assembly, base)
    current_mode = await hass.async_add_executor_job(_read_current_mode, base)
    age = None if ts is None else max(0, int(time.time()) - ts)
    connection.send_result(
        msg["id"],
        {
            "ts": ts,
            "age": age,
            "alive": age is not None and age <= 30,
            "compiled_build_ready": application_assembly == EXPECTED_APPLICATION_ASSEMBLY,
            "current_mode": current_mode,
            "expected_application_assembly": EXPECTED_APPLICATION_ASSEMBLY,
        },
    )


@websocket_api.websocket_command({vol.Required("type"): "netdaemon_toolkit/rebuild"})
@websocket_api.async_response
async def ws_rebuild(hass, connection, msg):
    """Trigger a rebuild of the compiled host from source (needs the compiled-build symlink set up, see const.py).

    No Docker access involved: fires an HA event a NetDaemon-side app (RebuildApp) listens for,
    then polls the result file it writes when done -- same shape as ws_codegen. A failed build
    leaves the running deployment untouched; a successful one re-points the ActiveAssemblyPath
    symlink and restarts, so the container relaunches into the new build automatically.
    """
    if not _is_admin(connection):
        connection.send_error(msg["id"], "unauthorized", "admin required")
        return
    base = _base_dir(hass)
    if not await _compiled_build_ready(hass, base):
        connection.send_result(msg["id"], {"success": False, "reason": _not_ready_reason(hass)})
        return
    result_path = base / REBUILD_RESULT_REL
    start_ts = int(time.time())

    hass.bus.async_fire(REBUILD_EVENT)

    def _read():
        if not result_path.exists():
            return None
        try:
            data = json.loads(result_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        return data if data.get("ts", 0) >= start_ts - 1 else None

    deadline = start_ts + REBUILD_TIMEOUT + 10
    while time.time() < deadline:
        data = await hass.async_add_executor_job(_read)
        if data is not None:
            connection.send_result(msg["id"], data)
            return
        await asyncio.sleep(2)

    timeout_reason = {
        "en": "Timed out waiting for the rebuild result.",
        "de": "Zeitüberschreitung beim Warten auf das Build-Ergebnis.",
    }
    connection.send_result(
        msg["id"],
        {"success": False, "reason": timeout_reason[_lang(hass)]},
    )


def _point_active_assembly(base: Path, target: str) -> None:
    """Re-point the ActiveAssemblyPath symlink at `target` (a container-side absolute path, e.g.
    "/data/app/Service.dll" -- never built from `base`, which is this integration's own,
    differently-mounted view of the same host directory)."""
    link = base / ACTIVE_ASSEMBLY_REL
    try:
        link.unlink()
    except FileNotFoundError:
        pass
    os.symlink(target, link)


@websocket_api.websocket_command(
    {vol.Required("type"): "netdaemon_toolkit/switch_mode", vol.Required("mode"): str}
)
@websocket_api.async_response
async def ws_switch_mode(hass, connection, msg):
    """Switch between source-deploy and the compiled build (needs the compiled-build symlink set up, see const.py).

    Pure symlink re-point on the shared volume, done directly here (no dotnet build involved, so
    no need to round-trip through a NetDaemon-side app) -- then asks NetDaemon to reload so the
    container relaunches through the newly-pointed symlink.
    """
    if not _is_admin(connection):
        connection.send_error(msg["id"], "unauthorized", "admin required")
        return
    mode = msg["mode"]
    base = _base_dir(hass)
    if not await _compiled_build_ready(hass, base):
        connection.send_result(msg["id"], {"success": False, "reason": _not_ready_reason(hass)})
        return

    if mode == "source":
        target = SOURCE_HOST_ASSEMBLY
    elif mode == "compiled":
        entry = base / APP_DIR_REL / APP_ENTRY_FILE
        if not await hass.async_add_executor_job(entry.exists):
            connection.send_result(
                msg["id"], {"success": False, "reason": "No compiled build exists yet -- use Rebuild first."}
            )
            return
        target = f"{CONTAINER_DATA_ROOT}/{APP_DIR_REL}/{APP_ENTRY_FILE}"
    else:
        connection.send_error(msg["id"], "invalid_mode", f"Unknown mode '{mode}'")
        return

    await hass.async_add_executor_job(_point_active_assembly, base, target)
    hass.bus.async_fire("netdaemon_toolkit_reload", {})
    connection.send_result(msg["id"], {"success": True, "mode": mode})


@websocket_api.websocket_command({vol.Required("type"): "netdaemon_toolkit/rollback"})
@websocket_api.async_response
async def ws_rollback(hass, connection, msg):
    """Roll back to the last build that preceded the currently active one (needs the compiled-build symlink set up, see const.py).

    Swaps app/ and app-last/ in place (three renames through a temp name) rather than pointing the
    ActiveAssemblyPath symlink at app-last/ directly. A symlink re-point would leave app/ holding
    the bad build while RebuildApp always retires *app/* into app-last/ on the next Rebuild -- so a
    second Rebuild after a rollback would destroy the very build just rolled back to. Swapping
    keeps app/ meaning "the build that's active" and app-last/ meaning "the one before it", which
    is RebuildApp's own invariant, so a later Rebuild can't clobber it and the symlink never needs
    a third target -- deliberately still independent of the running container's cooperation, since
    the whole point is recovering from a build that compiled fine but doesn't come up at runtime
    (container crash-looping). The next automatic Docker restart picks up the swap on its own.
    """
    if not _is_admin(connection):
        connection.send_error(msg["id"], "unauthorized", "admin required")
        return
    base = _base_dir(hass)
    app_dir = base / APP_DIR_REL
    app_last_dir = base / APP_LAST_DIR_REL
    entry = app_last_dir / APP_ENTRY_FILE
    if not await hass.async_add_executor_job(entry.exists):
        connection.send_result(msg["id"], {"success": False, "reason": "No previous build to roll back to."})
        return

    def _swap():
        tmp = base / f"{APP_DIR_REL}-rollback-tmp"
        if tmp.exists():
            shutil.rmtree(tmp)
        app_dir.rename(tmp)
        app_last_dir.rename(app_dir)
        tmp.rename(app_last_dir)

    await hass.async_add_executor_job(_swap)
    target = f"{CONTAINER_DATA_ROOT}/{APP_DIR_REL}/{APP_ENTRY_FILE}"
    await hass.async_add_executor_job(_point_active_assembly, base, target)
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command({vol.Required("type"): "netdaemon_toolkit/reload"})
@websocket_api.async_response
async def ws_reload(hass, connection, msg):
    """Ask NetDaemon to reload by firing an HA event a control app listens for."""
    if not _is_admin(connection):
        connection.send_error(msg["id"], "unauthorized", "admin required")
        return
    hass.bus.async_fire("netdaemon_toolkit_reload", {})
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command(
    {vol.Required("type"): "netdaemon_toolkit/logs", vol.Optional("tail", default=200): int}
)
@websocket_api.async_response
async def ws_logs(hass, connection, msg):
    """Return NetDaemon's console log.

    No Docker socket/API involved: reads a file directly, the one you've
    bind-mounted read-only into HA at CONF_CONSOLE_LOG — typically Docker's
    own <id>-json.log for the NetDaemon container. See the README for how to
    find that path and set up the mount.
    """
    if not _is_admin(connection):
        connection.send_error(msg["id"], "unauthorized", "admin required")
        return
    cfg = hass.data.get(DOMAIN, {}).get("config", {})
    console_log = cfg.get(CONF_CONSOLE_LOG, DEFAULT_CONSOLE_LOG)
    if not console_log:
        no_log = {
            "en": "No console log configured (see README: bind-mount NetDaemon's "
            "Docker log file read-only and enter the mount target in the "
            "integration).",
            "de": "Kein Konsolen-Log konfiguriert (siehe README: NetDaemons "
            "Docker-Log-Datei read-only mounten und den Mount-Zielpfad in der "
            "Integration eintragen).",
        }
        connection.send_result(
            msg["id"],
            {"available": False, "reason": no_log[_lang(hass)]},
        )
        return
    path = Path(console_log)
    if not path.exists():
        not_found = {
            "en": f"File not found: {console_log}",
            "de": f"Datei nicht gefunden: {console_log}",
        }
        connection.send_result(
            msg["id"],
            {"available": False, "reason": not_found[_lang(hass)]},
        )
        return
    text = await hass.async_add_executor_job(_read_console_log, path, int(msg.get("tail", 200)))
    connection.send_result(msg["id"], {"available": True, "logs": text})


@websocket_api.websocket_command({vol.Required("type"): "netdaemon_toolkit/codegen"})
@websocket_api.async_response
async def ws_codegen(hass, connection, msg):
    """Regenerate the typed Home Assistant entities (admin only).

    No Docker access involved: fires an HA event that a NetDaemon-side app
    (CodegenApp) listens for, then polls the result file it writes when done.
    CodegenApp runs nd-codegen as a plain subprocess of itself, using its own
    HomeAssistant__* env vars — the same ones NetDaemon already connects with.
    """
    if not _is_admin(connection):
        connection.send_error(msg["id"], "unauthorized", "admin required")
        return
    base = _base_dir(hass)
    result_path = base / CODEGEN_RESULT_REL
    start_ts = int(time.time())

    hass.bus.async_fire(CODEGEN_EVENT)

    def _read():
        if not result_path.exists():
            return None
        try:
            data = json.loads(result_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        # Reject a leftover result from a previous run; -1s covers the
        # int()-truncation gap between this timestamp and CodegenApp's.
        return data if data.get("ts", 0) >= start_ts - 1 else None

    deadline = start_ts + CODEGEN_TIMEOUT + 10
    while time.time() < deadline:
        data = await hass.async_add_executor_job(_read)
        if data is not None:
            connection.send_result(msg["id"], data)
            return
        await asyncio.sleep(1)

    timeout_reason = {
        "en": "Timed out waiting for the codegen result.",
        "de": "Zeitüberschreitung beim Warten auf das Codegen-Ergebnis.",
    }
    connection.send_result(
        msg["id"],
        {"success": False, "reason": timeout_reason[_lang(hass)]},
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "netdaemon_toolkit/traces",
        vol.Optional("app"): str,
        vol.Optional("tail", default=100): int,
        # Unix-seconds range filter (inclusive); either end may be omitted.
        vol.Optional("since"): int,
        vol.Optional("until"): int,
        # Case-insensitive substring match against summary/trigger/kind/outcome.
        vol.Optional("q"): str,
    }
)
@websocket_api.async_response
async def ws_traces(hass, connection, msg):
    """List apps that have decision traces, or read one app's recent (optionally
    time- and text-filtered) traces. Retention is ~100 days (see Tracer.cs), so
    filters matter once a run picks a specific slice out of months of history."""
    if not _is_admin(connection):
        connection.send_error(msg["id"], "unauthorized", "admin required")
        return
    tdir = _base_dir(hass) / ".traces"
    app = msg.get("app")

    if app:
        if not _TRACE_SLUG.match(app):
            connection.send_error(msg["id"], "invalid_path", "bad app id")
            return
        # Higher cap than the no-filter default: a text/time-narrowed query over
        # months of history may legitimately want more than the default 100.
        tail = max(1, min(int(msg.get("tail", 100)), 5000))
        since = msg.get("since")
        until = msg.get("until")
        q = (msg.get("q") or "").strip().lower()

        def _read():
            p = tdir / f"{app}.jsonl"
            if not p.exists():
                return []
            lines = [l for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]
            matched = []
            for line in lines:
                try:
                    e = json.loads(line)
                except ValueError:
                    continue
                ts = e.get("ts")
                if since is not None and (ts is None or ts < since):
                    continue
                if until is not None and (ts is None or ts > until):
                    continue
                if q:
                    hay = " ".join(
                        str(e.get(k, "")) for k in ("summary", "trigger", "kind", "outcome")
                    ).lower()
                    if q not in hay:
                        continue
                matched.append(e)
            return matched[-tail:]

        entries = await hass.async_add_executor_job(_read)
        connection.send_result(msg["id"], {"app": app, "entries": entries})
        return

    def _list():
        if not tdir.is_dir():
            return []
        res = []
        for p in sorted(tdir.glob("*.jsonl")):
            try:
                lines = [l for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]
            except OSError:
                continue
            last_ts = None
            if lines:
                try:
                    last_ts = json.loads(lines[-1]).get("ts")
                except ValueError:
                    pass
            res.append({"app": p.stem, "count": len(lines), "last_ts": last_ts})
        return res

    apps = await hass.async_add_executor_job(_list)
    connection.send_result(msg["id"], {"apps": apps})


def async_register_websocket_commands(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_status)
    websocket_api.async_register_command(hass, ws_reload)
    websocket_api.async_register_command(hass, ws_logs)
    websocket_api.async_register_command(hass, ws_codegen)
    websocket_api.async_register_command(hass, ws_rebuild)
    websocket_api.async_register_command(hass, ws_switch_mode)
    websocket_api.async_register_command(hass, ws_rollback)
    websocket_api.async_register_command(hass, ws_traces)
    websocket_api.async_register_command(hass, ws_list)
    websocket_api.async_register_command(hass, ws_read)
    websocket_api.async_register_command(hass, ws_write)
    websocket_api.async_register_command(hass, ws_create)
    websocket_api.async_register_command(hass, ws_create_folder)
    websocket_api.async_register_command(hass, ws_rename)
    websocket_api.async_register_command(hass, ws_delete)
    websocket_api.async_register_command(hass, ws_rename_folder)
    websocket_api.async_register_command(hass, ws_delete_folder)
