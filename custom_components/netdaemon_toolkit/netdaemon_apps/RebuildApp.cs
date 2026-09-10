using System;
using System.IO;
using System.Reactive.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using NetDaemon.AppModel;
using NetDaemon.HassModel;

namespace HaNetDaemon.Apps.Toolkit;

/// <summary>
/// Builds the SAME apps/ tree as a real, full-SDK-compiled NetDaemon host, instead of relying on
/// NetDaemon's own narrower source-deploy compiler -- full NuGet access, no reflection workarounds
/// needed in the resulting build. Generates a throwaway wrapper project (Program.cs + .csproj) in
/// an empty temp directory that glob-includes AppsDir, builds it via `dotnet build` (subprocess,
/// same ReflectedProcess idiom as CodegenApp, for the same reason -- see its own doc comment), and
/// on success promotes the result and re-points ActiveAssemblyPath at it before exiting so the
/// container relaunches through the newly-pointed symlink.
///
/// A failed build never touches the running deployment or the symlink: it builds into a scratch
/// directory first (AppNextDir) and only promotes that once `dotnet build` has actually succeeded.
///
/// Only relevant once NetDaemon__ApplicationAssembly has been pointed at ActiveAssemblyPath (a
/// one-time docker-compose.yml edit) -- the panel checks that before ever firing RebuildEvent, see
/// websocket.py's _compiled_build_ready.
///
/// Runtime failures after a successful build (the new version compiles fine but doesn't come up)
/// are NOT this app's problem to solve -- see the panel's separate rollback action, which
/// re-points the symlink at app-last directly on the shared volume and therefore works even while
/// this container is crash-looping.
/// </summary>
[NetDaemonApp]
public class RebuildApp
{
    public const string RebuildEvent = "netdaemon_toolkit_rebuild";

    private const string AppsDir = "/data/apps";
    private const string ActiveAssemblyPath = "/data/nd-active.dll";
    private const string AppDir = "/data/app";
    private const string AppNextDir = "/data/app-next";
    private const string AppLastDir = "/data/app-last";
    private const string AppEntryFile = "Service.dll";
    private const string ResultFile = "/data/.nd_rebuild_result.json";
    private const string NetDaemonVersion = "26.21.0";
    private const int TimeoutSeconds = 300;

    private readonly ILogger<RebuildApp> _log;
    private int _running;

    public RebuildApp(IHaContext ha, ILogger<RebuildApp> log)
    {
        _log = log;
        ha.Events
            .Where(evt => evt.EventType == RebuildEvent)
            .Subscribe(evt => _ = RunAsync());
        _log.LogInformation("RebuildApp: listening for HA event {Event}", RebuildEvent);
    }

    private async Task RunAsync()
    {
        if (Interlocked.Exchange(ref _running, 1) == 1)
        {
            _log.LogInformation("RebuildApp: ignoring trigger, a build is already in progress");
            return;
        }

        var runDir = Path.Combine(Path.GetTempPath(), $"nd-rebuild-{Guid.NewGuid():N}");
        try
        {
            Directory.CreateDirectory(runDir);
            WriteWrapperProject(runDir);

            if (Directory.Exists(AppNextDir)) Directory.Delete(AppNextDir, recursive: true);

            var (ok, log) = await Task.Run(() => ReflectedProcess.Run(
                "dotnet",
                new[] { "build", Path.Combine(runDir, "Service.csproj"), "-c", "Release", "-o", AppNextDir },
                runDir, TimeoutSeconds));

            if (!ok)
            {
                if (Directory.Exists(AppNextDir)) Directory.Delete(AppNextDir, recursive: true);
                WriteResult(new { success = false, reason = "dotnet build failed.", log, ts = Now() });
                return;
            }

            if (Directory.Exists(AppLastDir)) Directory.Delete(AppLastDir, recursive: true);
            if (Directory.Exists(AppDir)) Directory.Move(AppDir, AppLastDir);
            Directory.Move(AppNextDir, AppDir);

            try { File.Delete(ActiveAssemblyPath); } catch { /* wasn't there, or a broken symlink -- fine either way */ }
            File.CreateSymbolicLink(ActiveAssemblyPath, Path.Combine(AppDir, AppEntryFile));

            WriteResult(new { success = true, log, ts = Now() });
            _log.LogWarning("RebuildApp: build succeeded, symlink re-pointed, exiting to relaunch the new version");
            Environment.Exit(0);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "RebuildApp: unexpected failure");
            WriteResult(new { success = false, reason = $"Unexpected failure: {ex.Message}", ts = Now() });
        }
        finally
        {
            try { Directory.Delete(runDir, recursive: true); } catch { /* best-effort cleanup */ }
            Interlocked.Exchange(ref _running, 0);
        }
    }

    // Same idiom as the reference NetDaemon3Automations-main host project: a plain top-level-
    // statement Program.cs calling AddAppsFromAssembly, an .csproj whose only non-standard bit is
    // <Compile Include> pointing at AppsDir (default MSBuild globbing can't reach outside this
    // throwaway project's own directory). apps/_toolkit is included deliberately -- that's where
    // this very file (and the rest of the toolkit apps) live, so the compiled host gets them too.
    private static void WriteWrapperProject(string dir)
    {
        File.WriteAllText(Path.Combine(dir, "Service.csproj"), $"""
            <Project Sdk="Microsoft.NET.Sdk">
              <PropertyGroup>
                <OutputType>Exe</OutputType>
                <TargetFramework>net10.0</TargetFramework>
                <ImplicitUsings>enable</ImplicitUsings>
                <Nullable>enable</Nullable>
                <RootNamespace>HaNetDaemon.Apps</RootNamespace>
                <AssemblyName>Service</AssemblyName>
              </PropertyGroup>
              <ItemGroup>
                <PackageReference Include="NetDaemon.AppModel" Version="{NetDaemonVersion}" />
                <PackageReference Include="NetDaemon.Runtime" Version="{NetDaemonVersion}" />
                <PackageReference Include="NetDaemon.HassModel" Version="{NetDaemonVersion}" />
                <PackageReference Include="NetDaemon.Client" Version="{NetDaemonVersion}" />
                <PackageReference Include="NetDaemon.Extensions.Scheduling" Version="{NetDaemonVersion}" />
                <PackageReference Include="NetDaemon.Extensions.Logging" Version="{NetDaemonVersion}" />
              </ItemGroup>
              <ItemGroup>
                <Compile Include="{AppsDir}/**/*.cs" />
              </ItemGroup>
            </Project>
            """);

        File.WriteAllText(Path.Combine(dir, "Program.cs"), """
            using System.Reflection;
            using HaNetDaemon.HassModel;
            using Microsoft.Extensions.Hosting;
            using NetDaemon.AppModel;
            using NetDaemon.Extensions.Logging;
            using NetDaemon.Runtime;

            await Host.CreateDefaultBuilder(args)
                .UseNetDaemonAppSettings()
                .UseNetDaemonDefaultLogging()
                .UseNetDaemonRuntime()
                .ConfigureServices((_, services) =>
                    services.AddAppsFromAssembly(Assembly.GetExecutingAssembly())
                             .AddNetDaemonStateManager()
                             .AddNetDaemonScheduler()
                             .AddHomeAssistantGenerated())
                .Build()
                .RunAsync();
            """);

        File.WriteAllText(Path.Combine(dir, "appsettings.json"), """
            { "NetDaemon": { "ApplicationConfigurationFolder": "/data" } }
            """);
    }

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeSeconds();

    private void WriteResult(object result)
    {
        try
        {
            File.WriteAllText(ResultFile, JsonSerializer.Serialize(result));
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "RebuildApp: could not write {File}", ResultFile);
        }
    }
}
