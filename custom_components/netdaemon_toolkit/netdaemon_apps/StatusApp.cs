using System;
using System.IO;
using System.Reactive.Linq;
using Microsoft.Extensions.Logging;
using NetDaemon.AppModel;

namespace HaNetDaemon.Apps.Toolkit;

/// <summary>
/// Writes a small heartbeat file next to the apps folder every few seconds so
/// the NetDaemon Toolkit panel can show whether the runtime is alive. If the
/// source fails to compile, NO app runs (not even this one), the file goes
/// stale, and the panel turns red — exactly the "did my last edit break it?"
/// signal. Portable: just a file in the shared data folder, no Docker needed.
/// </summary>
[NetDaemonApp]
public class StatusApp
{
    // Data root (parent of the apps folder); HA sees the same folder via its
    // /config/netdaemon mount, so the panel can read this file.
    private const string StatusFile = "/data/.nd_status.json";

    private readonly ILogger<StatusApp> _log;

    public StatusApp(ILogger<StatusApp> log)
    {
        _log = log;
        Write();
        Observable.Interval(TimeSpan.FromSeconds(10)).Subscribe(_ => Write());
        _log.LogInformation("StatusApp: heartbeat writer started ({File})", StatusFile);
    }

    private void Write()
    {
        try
        {
            var ts = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            File.WriteAllText(StatusFile, $"{{\"ts\":{ts}}}");
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "StatusApp: could not write {File}", StatusFile);
        }
    }
}
