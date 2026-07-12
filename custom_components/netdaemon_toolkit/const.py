"""Constants for the NetDaemon Toolkit integration."""

DOMAIN = "netdaemon_toolkit"

# Config entry keys
CONF_DIRECTORY = "directory"
CONF_WEBHOOK_RELAYS = "webhook_relays"
CONF_CONSOLE_LOG = "console_log"

DEFAULT_DIRECTORY = "/config/netdaemon"
DEFAULT_WEBHOOK_RELAYS = ""
DEFAULT_CONSOLE_LOG = ""

# .cs is what the tree shows by default; the panel's "show all files" toggle
# switches to listing/editing every file under the base directory instead
# (still confined to that directory — see _safe_path in websocket.py).
DEFAULT_EXTENSIONS = (".cs",)

# "Regenerate entities": ws_codegen fires CODEGEN_EVENT, a NetDaemon-side app
# (CodegenApp) runs nd-codegen as a plain subprocess of itself (no Docker
# access needed) and writes its outcome to CODEGEN_RESULT_REL, which ws_codegen
# polls for. GENERATED_REL is where the typed-entities file ends up, relative
# to the base directory; NetDaemon picks it up on the next reload.
CODEGEN_EVENT = "netdaemon_toolkit_codegen"
CODEGEN_RESULT_REL = ".nd_codegen_result.json"
GENERATED_REL = "apps/Generated/HomeAssistantGenerated.cs"
# Hard cap (mirrored on the NetDaemon side) so a stuck nd-codegen can't hang
# forever, plus a little slack here for ws_codegen's poll loop to notice.
CODEGEN_TIMEOUT = 180

# Bundled NetDaemon apps (reload listener, status heartbeat, codegen runner)
# get installed into this folder, relative to the configured directory, if
# missing — see netdaemon_apps/ and _ensure_toolkit_apps() in __init__.py.
TOOLKIT_APPS_REL = "apps/_toolkit"
TOOLKIT_APPS_FILES = ("ControlApp.cs", "StatusApp.cs", "CodegenApp.cs")

# Frontend wiring
STATIC_URL = "/netdaemon_toolkit_static"
PANEL_URL = "netdaemon-toolkit"
PANEL_TITLE = "NetDaemon"
PANEL_ICON = "mdi:file-code"
WEBCOMPONENT = "netdaemon-toolkit-panel"
