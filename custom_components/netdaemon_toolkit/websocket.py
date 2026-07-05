"""WebSocket commands for listing, reading and writing NetDaemon source files.

All file access is confined to the configured base directory and to the allowed
file extensions, so the panel cannot reach the rest of the config tree.
"""
import asyncio
import json
import re
import shutil
import time
from pathlib import Path

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .const import (
    ALLOWED_EXTENSIONS,
    CODEGEN_EVENT,
    CODEGEN_RESULT_REL,
    CODEGEN_TIMEOUT,
    CONF_CONSOLE_LOG,
    CONF_DIRECTORY,
    DEFAULT_CONSOLE_LOG,
    DEFAULT_DIRECTORY,
    DOMAIN,
)

_ANSI = re.compile(r"\x1b\[[0-9;]*m")
# Trace files live in <base>/.traces/<app-slug>.jsonl; the slug is class-name
# snake_case, so this also guards against path traversal in the app id.
_TRACE_SLUG = re.compile(r"^[a-z0-9_]+$")


def _lang(hass: HomeAssistant) -> str:
    """Match the frontend's own hass.language check (English fallback)."""
    return "de" if (hass.config.language or "en").startswith("de") else "en"


def _read_console_log(path: Path, tail: int) -> str:
    """Read the last `tail` entries of Docker's own json-file container log.

    One JSON object per line ({"log": "...", "stream": "...", "time": "..."}),
    written by Docker itself independently of anything NetDaemon does — this
    is what makes it work even for a compile failure that crashes before any
    of our own code runs. No size cap here; if the file has no docker-level
    log rotation configured it can grow large — see the README.
    """
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    out = []
    for line in lines[-tail:]:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        out.append(entry.get("log", ""))
    return _ANSI.sub("", "".join(out))


def _base_dir(hass: HomeAssistant) -> Path:
    cfg = hass.data.get(DOMAIN, {}).get("config", {})
    return Path(cfg.get(CONF_DIRECTORY, DEFAULT_DIRECTORY)).resolve()


def _safe_path(hass: HomeAssistant, rel: str) -> Path:
    """Resolve a relative path inside the base dir, rejecting escapes and types."""
    base = _base_dir(hass)
    target = (base / rel).resolve()
    if target != base and base not in target.parents:
        raise ValueError("path outside of base directory")
    if target.suffix not in ALLOWED_EXTENSIONS:
        raise ValueError("file type not allowed")
    return target


def _safe_dir(hass: HomeAssistant, rel: str) -> Path:
    """Resolve a directory inside the base dir (never the base itself)."""
    base = _base_dir(hass)
    target = (base / rel).resolve()
    if target == base or base not in target.parents:
        raise ValueError("path outside of base directory")
    return target


def _list_files(base: Path) -> list[str]:
    if not base.exists():
        return []
    out = []
    for p in sorted(base.rglob("*")):
        if not p.is_file() or p.suffix not in ALLOWED_EXTENSIONS:
            continue
        rel = p.relative_to(base)
        # Hide anything inside an "_"-prefixed folder/file (e.g. _toolkit infra apps).
        if any(part.startswith("_") for part in rel.parts):
            continue
        out.append(rel.as_posix())
    return out


def _is_admin(connection) -> bool:
    return connection.user is not None and connection.user.is_admin


@websocket_api.websocket_command({vol.Required("type"): "netdaemon_toolkit/list"})
@websocket_api.async_response
async def ws_list(hass, connection, msg):
    if not _is_admin(connection):
        connection.send_error(msg["id"], "unauthorized", "admin required")
        return
    base = _base_dir(hass)
    files = await hass.async_add_executor_job(_list_files, base)
    connection.send_result(msg["id"], {"directory": str(base), "files": files})


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
    if not path.is_dir():
        connection.send_error(msg["id"], "not_found", "folder does not exist")
        return
    await hass.async_add_executor_job(lambda: shutil.rmtree(path))
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command({vol.Required("type"): "netdaemon_toolkit/status"})
@websocket_api.async_response
async def ws_status(hass, connection, msg):
    """Read the NetDaemon heartbeat file (.nd_status.json) and report liveness."""
    if not _is_admin(connection):
        connection.send_error(msg["id"], "unauthorized", "admin required")
        return
    base = _base_dir(hass)

    def _read():
        import json

        p = base / ".nd_status.json"
        if not p.exists():
            return None
        try:
            return int(json.loads(p.read_text(encoding="utf-8")).get("ts"))
        except Exception:
            return None

    import time

    ts = await hass.async_add_executor_job(_read)
    age = None if ts is None else max(0, int(time.time()) - ts)
    connection.send_result(
        msg["id"], {"ts": ts, "age": age, "alive": age is not None and age <= 30}
    )


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
    websocket_api.async_register_command(hass, ws_traces)
    websocket_api.async_register_command(hass, ws_list)
    websocket_api.async_register_command(hass, ws_read)
    websocket_api.async_register_command(hass, ws_write)
    websocket_api.async_register_command(hass, ws_create)
    websocket_api.async_register_command(hass, ws_rename)
    websocket_api.async_register_command(hass, ws_delete)
    websocket_api.async_register_command(hass, ws_rename_folder)
    websocket_api.async_register_command(hass, ws_delete_folder)
