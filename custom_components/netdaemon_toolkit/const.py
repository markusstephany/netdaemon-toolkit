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
TOOLKIT_APPS_FILES = ("ControlApp.cs", "StatusApp.cs", "CodegenApp.cs", "RebuildApp.cs")

# Compiled-build support: lets the SAME apps/ tree used for source-deploy also be built as a real,
# full-SDK-compiled NetDaemon host (full NuGet access, no narrow-compiler workarounds) -- see
# RebuildApp.cs's own doc comment for how. No config toggle for this -- same idiom as
# CONF_CONSOLE_LOG: the panel just checks whether the one-time docker-compose.yml edit has actually
# been made (NetDaemon__ApplicationAssembly pointing at ACTIVE_ASSEMBLY_REL, a symlink under the
# configured directory) and shows the Rebuild/switch/rollback actions only then. Once that symlink
# exists, switching between source-deploy and the compiled build, or rolling back, is just
# re-pointing it and asking NetDaemon to reload.
ACTIVE_ASSEMBLY_REL = "nd-active.dll"
# Part of the netdaemon6 image itself, not the volume -- always current after an image update.
SOURCE_HOST_ASSEMBLY = "/daemon/NetDaemon.Host.Default.dll"
APP_DIR_REL = "app"
APP_LAST_DIR_REL = "app-last"
APP_ENTRY_FILE = "Service.dll"

# The netdaemon container mounts the same host directory as this integration's own CONF_DIRECTORY,
# but at a different path (/data, not /config/netdaemon) -- symlink *targets* written from here
# must always be spelled from the container's point of view, never built from `base`.
CONTAINER_DATA_ROOT = "/data"
EXPECTED_APPLICATION_ASSEMBLY = f"{CONTAINER_DATA_ROOT}/{ACTIVE_ASSEMBLY_REL}"

REBUILD_EVENT = "netdaemon_toolkit_rebuild"
REBUILD_RESULT_REL = ".nd_rebuild_result.json"
# Generous: a first-ever rebuild also installs the .NET SDK onto the volume.
REBUILD_TIMEOUT = 300

# Frontend wiring
STATIC_URL = "/netdaemon_toolkit_static"
PANEL_URL = "netdaemon-toolkit"
PANEL_TITLE = "NetDaemon"
PANEL_ICON = "mdi:file-code"
WEBCOMPONENT = "netdaemon-toolkit-panel"
