using System;
using System.Reactive.Linq;
using Microsoft.Extensions.Logging;
using NetDaemon.AppModel;
using NetDaemon.HassModel;

namespace HaNetDaemon.Apps.Toolkit;

/// <summary>
/// Reloads NetDaemon on request. Listens for the HA event fired by the toolkit
/// panel and exits the process; the s6 supervisor restarts NetDaemon, which
/// recompiles the source apps — applying edits made via the panel. NetDaemon
/// has no runtime rescan, so restarting the process is the portable way.
/// </summary>
[NetDaemonApp]
public class ControlApp
{
    public const string ReloadEvent = "netdaemon_toolkit_reload";

    public ControlApp(IHaContext ha, ILogger<ControlApp> log)
    {
        ha.Events
            .Where(e => e.EventType == ReloadEvent)
            .Subscribe(_ =>
            {
                log.LogWarning("ControlApp: reload requested ({Event}) -> exiting to trigger restart", ReloadEvent);
                Environment.Exit(0);
            });
        log.LogInformation("ControlApp: listening for HA event {Event}", ReloadEvent);
    }
}
