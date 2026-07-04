"""Relays Home Assistant webhook payloads onto the event bus.

Lets NetDaemon react to an externally-triggered webhook without an
automations.yaml shim: NetDaemon apps can't register a raw HTTP webhook
themselves (that registration has to happen from code running inside HA's
own process), but they CAN subscribe to a plain bus event, which is all
this does. Deliberately kept isolated from the rest of the toolkit
integration — a bug here should never be able to touch the panel/editor.

Relays are configured (not hardcoded) via the integration's config entry,
one per line as "<webhook_id>:<event_type>" — see CONF_WEBHOOK_RELAYS.
"""
import logging

from aiohttp import web
from homeassistant.components import webhook
from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


def parse_relays(raw: str) -> list[tuple[str, str]]:
    """Parse the "<webhook_id>:<event_type>"-per-line config value."""
    relays = []
    for line in (raw or "").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        webhook_id, _, event_type = line.partition(":")
        webhook_id, event_type = webhook_id.strip(), event_type.strip()
        if webhook_id and event_type:
            relays.append((webhook_id, event_type))
    return relays


def async_register_webhook_relays(hass: HomeAssistant, relays: list[tuple[str, str]]) -> None:
    """Register every configured webhook -> event relay."""
    for webhook_id, event_type in relays:
        webhook.async_register(
            hass,
            "netdaemon_toolkit",
            f"NetDaemon relay: {event_type}",
            webhook_id,
            _make_handler(event_type),
        )
        _LOGGER.debug("Registered webhook relay %s -> event %s", webhook_id, event_type)


def _make_handler(event_type: str):
    async def handle(hass: HomeAssistant, webhook_id: str, request) -> web.Response:
        try:
            data = await request.json()
        except ValueError:
            _LOGGER.warning("Webhook relay %s: invalid JSON body", webhook_id)
            return web.Response(status=400)
        if not isinstance(data, dict):
            _LOGGER.warning("Webhook relay %s: JSON body is not an object", webhook_id)
            return web.Response(status=400)
        hass.bus.async_fire(event_type, data)
        return web.Response(status=200)

    return handle
