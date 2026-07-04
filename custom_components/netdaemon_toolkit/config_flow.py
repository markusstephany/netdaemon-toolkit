"""Config flow for NetDaemon Toolkit."""
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.helpers import selector

from .const import (
    CONF_CONSOLE_LOG,
    CONF_DIRECTORY,
    CONF_WEBHOOK_RELAYS,
    DEFAULT_CONSOLE_LOG,
    DEFAULT_DIRECTORY,
    DEFAULT_WEBHOOK_RELAYS,
    DOMAIN,
)


def _schema(defaults: dict) -> vol.Schema:
    return vol.Schema(
        {
            vol.Required(
                CONF_DIRECTORY, default=defaults.get(CONF_DIRECTORY, DEFAULT_DIRECTORY)
            ): str,
            vol.Optional(
                CONF_CONSOLE_LOG,
                default=defaults.get(CONF_CONSOLE_LOG, DEFAULT_CONSOLE_LOG),
            ): str,
            vol.Optional(
                CONF_WEBHOOK_RELAYS,
                default=defaults.get(CONF_WEBHOOK_RELAYS, DEFAULT_WEBHOOK_RELAYS),
            ): selector.TextSelector(selector.TextSelectorConfig(multiline=True)),
        }
    )


class NetDaemonToolkitConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle the config flow."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        if user_input is not None:
            await self.async_set_unique_id(DOMAIN)
            self._abort_if_unique_id_configured()
            return self.async_create_entry(title="NetDaemon Toolkit", data=user_input)
        return self.async_show_form(step_id="user", data_schema=_schema({}))

    async def async_step_reconfigure(self, user_input=None):
        entry = self._get_reconfigure_entry()
        if user_input is not None:
            return self.async_update_reload_and_abort(entry, data=user_input)
        return self.async_show_form(
            step_id="reconfigure", data_schema=_schema(dict(entry.data))
        )
