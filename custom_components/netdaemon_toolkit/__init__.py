"""NetDaemon Toolkit — an in-HA panel for managing a NetDaemon instance.

Registers a sidebar panel with a minimal file editor and exposes WebSocket
commands to list/read/write files, trigger codegen/reload, and read status
in a configured directory (default /config/netdaemon). Pairs with NetDaemon
running in source-deploy mode.
"""
import logging
from datetime import timedelta
from pathlib import Path

from homeassistant.components import frontend, panel_custom, persistent_notification
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.loader import async_get_integration

from .const import (
    CONF_DIRECTORY,
    CONF_WEBHOOK_RELAYS,
    DEFAULT_DIRECTORY,
    DEFAULT_WEBHOOK_RELAYS,
    DOMAIN,
    GENERATED_REL,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL,
    STATIC_URL,
    TOOLKIT_APPS_FILES,
    TOOLKIT_APPS_REL,
    WEBCOMPONENT,
)
from .websocket import async_register_websocket_commands
from .webhook_relay import (
    async_register_webhook_relays,
    async_unregister_webhook_relays,
    parse_relays,
)

_LOGGER = logging.getLogger(__name__)

_FIRST_RESTART_NOTIFICATION = {
    "en": {
        "title": "NetDaemon Toolkit: restart NetDaemon once",
        "message": (
            "NetDaemon Toolkit just installed its reload/status/codegen apps "
            "into `{directory}`. Restart NetDaemon yourself now (Docker, the "
            "add-on, however you normally do it) — not from the panel, since "
            "its reload button depends on these apps already running. Every "
            "restart after this one can go through the panel."
        ),
    },
    "de": {
        "title": "NetDaemon Toolkit: NetDaemon einmal neu starten",
        "message": (
            "NetDaemon Toolkit hat gerade die Reload-/Status-/Codegen-Apps in "
            "`{directory}` installiert. Starte NetDaemon jetzt selbst neu "
            "(Docker, Add-on, wie auch immer du das sonst machst) — nicht "
            "über das Panel, denn dessen Reload-Button setzt voraus, dass "
            "diese Apps schon laufen. Jeder Neustart danach kann über das "
            "Panel laufen."
        ),
    },
}


def _first_restart_notification_text(hass: HomeAssistant, directory: str) -> tuple[str, str]:
    lang = "de" if (hass.config.language or "en").startswith("de") else "en"
    strings = _FIRST_RESTART_NOTIFICATION[lang]
    return strings["title"], strings["message"].format(directory=directory)


async def _ensure_toolkit_apps(hass: HomeAssistant, directory: str) -> bool:
    """Write the bundled reload/status apps into the configured directory,
    but only the ones missing — never touch files the user already has
    (e.g. because they customized them). Returns True if any file was
    actually created, i.e. this looks like a first-time setup for this
    directory."""
    src_dir = Path(__file__).parent / "netdaemon_apps"
    dst_dir = Path(directory) / TOOLKIT_APPS_REL

    def _do() -> bool:
        created = False
        for name in TOOLKIT_APPS_FILES:
            dst = dst_dir / name
            if dst.exists():
                continue
            dst_dir.mkdir(parents=True, exist_ok=True)
            dst.write_text((src_dir / name).read_text(encoding="utf-8"), encoding="utf-8")
            _LOGGER.info("Installed missing NetDaemon app %s into %s", name, dst_dir)
            created = True
        return created

    return await hass.async_add_executor_job(_do)


async def _ensure_generated_placeholder(hass: HomeAssistant, directory: str) -> None:
    """Create an empty generated-entities file if none exists yet, so the
    panel's regenerate button (attached to that file in the tree) has
    something to attach to on a brand-new setup — before the "regenerate
    entities" button has ever been used, that file wouldn't otherwise exist."""
    dst = Path(directory) / GENERATED_REL

    def _do() -> None:
        if dst.exists():
            return
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(
            "// Placeholder — populated by the panel's \"regenerate entities\" button.\n",
            encoding="utf-8",
        )
        _LOGGER.info("Created placeholder generated-entities file at %s", dst)

    await hass.async_add_executor_job(_do)


def _reconcile_webhook_relays(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Register the currently-configured webhook relays, unregistering
    whatever this integration registered last time first. Runs on every
    setup (including a reconfigure-triggered reload), so changing
    webhook_relays takes effect immediately — no full HA restart needed."""
    store = hass.data.setdefault(DOMAIN, {})
    async_unregister_webhook_relays(hass, store.get("_webhook_ids", []))
    relays = parse_relays(entry.data.get(CONF_WEBHOOK_RELAYS, DEFAULT_WEBHOOK_RELAYS))
    async_register_webhook_relays(hass, relays)
    store["_webhook_ids"] = [webhook_id for webhook_id, _ in relays]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up the panel and WebSocket commands from a config entry."""
    store = hass.data.setdefault(DOMAIN, {})
    store["config"] = dict(entry.data)

    directory = entry.data.get(CONF_DIRECTORY, DEFAULT_DIRECTORY)
    first_install = await _ensure_toolkit_apps(hass, directory)
    await _ensure_generated_placeholder(hass, directory)

    if first_install:
        title, message = _first_restart_notification_text(hass, directory)
        persistent_notification.async_create(
            hass,
            message,
            title=title,
            notification_id="netdaemon_toolkit_first_restart",
        )

    # Serve the frontend and register the WebSocket commands once per HA start.
    if not store.get("_registered"):
        www = Path(__file__).parent / "www"
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL, str(www), False)]
        )
        async_register_websocket_commands(hass)
        store["_registered"] = True

    # Unlike the above, this re-runs on every setup so a reconfigure that
    # changes webhook_relays takes effect without a full HA restart.
    _reconcile_webhook_relays(hass, entry)

    # ?v= busts the frontend cache for the JS module. Tied to the integration
    # version (not a hand-bumped literal) so every release that touches the
    # JS automatically forces browsers to fetch the new file — a manually
    # maintained counter here was previously forgotten across releases,
    # leaving old cached JS in place after an update.
    integration = await async_get_integration(hass, DOMAIN)

    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL,
        webcomponent_name=WEBCOMPONENT,
        module_url=f"{STATIC_URL}/netdaemon-toolkit.js?v={integration.version}",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        require_admin=True,
        config={"directory": entry.data.get(CONF_DIRECTORY, DEFAULT_DIRECTORY)},
    )
    store["_panel"] = True

    # Keep the toolkit's own infrastructure apps (the hidden _toolkit/ helpers)
    # enabled: NetDaemon gates each app on an input_boolean and can leave them
    # off (its app-state race). This watcher lives in HA, so NetDaemon's toggle
    # mechanism can't disable it. User-facing apps are controlled in the panel.
    async def _keep_infra_enabled(_now=None) -> None:
        for state in hass.states.async_all("input_boolean"):
            eid = state.entity_id
            if "netdaemon_" in eid and "_apps_toolkit_" in eid and state.state == "off":
                await hass.services.async_call(
                    "input_boolean", "turn_on", {"entity_id": eid}, blocking=False
                )

    if not store.get("_infra_timer"):
        store["_infra_timer"] = async_track_time_interval(
            hass, _keep_infra_enabled, timedelta(seconds=30)
        )
        hass.async_create_task(_keep_infra_enabled())

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Remove the panel on unload/reconfigure."""
    store = hass.data.get(DOMAIN, {})
    if store.pop("_panel", None):
        frontend.async_remove_panel(hass, PANEL_URL)
    cancel = store.pop("_infra_timer", None)
    if cancel:
        cancel()
    # If this is a genuine removal (not a reconfigure, which re-registers
    # right after via _reconcile_webhook_relays), don't leave these active.
    async_unregister_webhook_relays(hass, store.pop("_webhook_ids", []))
    store.pop("config", None)
    return True
