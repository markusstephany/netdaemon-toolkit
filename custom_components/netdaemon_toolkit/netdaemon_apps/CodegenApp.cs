using System;
using System.Collections;
using System.IO;
using System.Linq;
using System.Reactive.Linq;
using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using NetDaemon.AppModel;
using NetDaemon.HassModel;

namespace HaNetDaemon.Apps.Toolkit;

/// <summary>
/// Regenerates the typed Home Assistant entities by running nd-codegen as a
/// plain subprocess of this already-running process — no Docker access
/// needed. Installs the tool fresh into a throwaway temp dir each run (mirrors
/// the previous throwaway-container behavior) and runs it from an empty
/// working directory, since nd-codegen otherwise scans its cwd recursively
/// for .csproj files and hangs on the big /data volume. Uses this process's
/// own HomeAssistant__* env vars — the same ones NetDaemon itself connects
/// with, no need to look them up anywhere. Triggered by an HA event; the
/// panel polls ResultFile for the outcome.
///
/// Process spawning goes through reflection (see ReflectedProcess below)
/// instead of a direct System.Diagnostics.Process reference: NetDaemon's
/// source-deploy compiler resolves types from a narrower reference set than
/// a normal SDK build, and doesn't include that assembly — confirmed live
/// (CS0246 on ProcessStartInfo/Process, while a plain `dotnet build` with the
/// same SDK compiles it fine). The type only needs to exist at runtime for
/// reflection, which it does — it's part of the shared framework.
/// </summary>
[NetDaemonApp]
public class CodegenApp
{
    public const string CodegenEvent = "netdaemon_toolkit_codegen";
    private const string ResultFile = "/data/.nd_codegen_result.json";
    private const string AppsDir = "/data/apps";
    private const string DefaultGeneratedRel = "apps/Generated/HomeAssistantGenerated.cs";
    private const string DefaultCodegenNamespace = "HaNetDaemon.HassModel";
    private const int TimeoutSeconds = 180;

    private readonly ILogger<CodegenApp> _log;
    private int _running;

    public CodegenApp(IHaContext ha, ILogger<CodegenApp> log)
    {
        _log = log;
        ha.Events
            .Where(evt => evt.EventType == CodegenEvent)
            .Subscribe(evt => _ = RunAsync());
        _log.LogInformation("CodegenApp: listening for HA event {Event}", CodegenEvent);
    }

    private async Task RunAsync()
    {
        if (Interlocked.Exchange(ref _running, 1) == 1)
        {
            // Don't write a result here: the already-in-flight run will write
            // the real outcome shortly, and every caller's poll loop (keyed
            // on its own start timestamp, before this duplicate trigger) will
            // pick that up correctly. Writing a "busy" result here would race
            // with — and could be overtaken while still being read as final
            // by — the real one, since a poller stops at the *first* result
            // newer than its own start_ts, not necessarily the last one written.
            _log.LogInformation("CodegenApp: ignoring trigger, a run is already in progress");
            return;
        }

        var runDir = Path.Combine(Path.GetTempPath(), $"nd-codegen-{Guid.NewGuid():N}");
        try
        {
            var host = Environment.GetEnvironmentVariable("HomeAssistant__Host");
            var port = Environment.GetEnvironmentVariable("HomeAssistant__Port");
            var ssl = Environment.GetEnvironmentVariable("HomeAssistant__Ssl") ?? "false";
            var token = Environment.GetEnvironmentVariable("HomeAssistant__Token");
            if (string.IsNullOrEmpty(host) || string.IsNullOrEmpty(port) || string.IsNullOrEmpty(token))
            {
                WriteResult(new
                {
                    success = false,
                    reason = "HomeAssistant__Host/Port/Token nicht als Umgebungsvariablen gesetzt.",
                    ts = Now(),
                });
                return;
            }

            var workDir = Path.Combine(runDir, "empty");
            var toolPath = Path.Combine(runDir, "tool");
            Directory.CreateDirectory(workDir);
            Directory.CreateDirectory(toolPath);

            var (outPath, ns) = ResolveTarget();
            Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);

            var install = await ReflectedProcess.RunAsync(
                "dotnet",
                new[] { "tool", "install", "NetDaemon.HassModel.CodeGen", "--tool-path", toolPath },
                workDir, TimeoutSeconds);
            if (!install.ok)
            {
                WriteResult(new { success = false, reason = "nd-codegen-Installation fehlgeschlagen.", logs = install.log, ts = Now() });
                return;
            }

            var ndCodegenBin = Path.Combine(toolPath, "nd-codegen");
            var run = await ReflectedProcess.RunAsync(
                ndCodegenBin,
                new[] { "-host", host, "-port", port, "-ssl", ssl, "-token", token, "-o", outPath, "-ns", ns },
                workDir, TimeoutSeconds);
            if (!run.ok)
            {
                WriteResult(new { success = false, reason = "nd-codegen meldete einen Fehler.", logs = run.log, ts = Now() });
                return;
            }

            var lines = File.Exists(outPath) ? File.ReadAllLines(outPath).Length : 0;
            WriteResult(new { success = true, file = Path.GetRelativePath("/data", outPath), lines, logs = run.log, ts = Now() });
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "CodegenApp: unexpected failure");
            WriteResult(new { success = false, reason = $"Unerwarteter Fehler: {ex.Message}", ts = Now() });
        }
        finally
        {
            try { Directory.Delete(runDir, recursive: true); } catch { /* best-effort cleanup */ }
            Interlocked.Exchange(ref _running, 0);
        }
    }

    // Regenerates the SAME file this setup already has, wherever it actually lives, instead of
    // assuming the historical fixed apps/Generated/ location -- same "detect, don't assume"
    // idiom as RebuildApp's FindSolutionProject. A hand-maintained solution (e.g. Source/'s own
    // Lib.HassModel/HomeAssistantGenerated.cs) is found and regenerated in place, namespace and
    // all; the fixed default is only used on a brand-new setup that's never run codegen before.
    private static (string outPath, string ns) ResolveTarget()
    {
        var existing = Directory.EnumerateFiles(AppsDir, "HomeAssistantGenerated.cs", SearchOption.AllDirectories).FirstOrDefault();
        if (existing is null)
            return (Path.Combine("/data", DefaultGeneratedRel), DefaultCodegenNamespace);

        var ns = DefaultCodegenNamespace;
        var match = Regex.Match(File.ReadAllText(existing), @"namespace\s+([\w.]+)\.Generated\s*;");
        if (match.Success) ns = match.Groups[1].Value;

        return (existing, ns);
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
            _log.LogWarning(ex, "CodegenApp: could not write {File}", ResultFile);
        }
    }
}

/// <summary>
/// Runs a subprocess via System.Diagnostics.Process, resolved through
/// reflection so this file never names that type directly — see the note on
/// CodegenApp for why. The assembly is guaranteed present at runtime (it's
/// part of the shared framework NetDaemon itself runs on). Genuinely async
/// (WaitForExitAsync/ReadToEndAsync, also via reflection -- their *return
/// values* are plain Task/Task&lt;string&gt;, already used everywhere in this
/// file, so nothing new needs to resolve at compile time) rather than
/// blocking a thread-pool worker for the whole subprocess lifetime, which a
/// long-running one (an SDK bootstrap, a `dotnet build`) previously did for
/// up to minutes at a time -- starving anything else sharing the pool, e.g.
/// StatusApp's own 10s heartbeat timer.
/// </summary>
internal static class ReflectedProcess
{
    private static readonly Assembly Asm = Assembly.Load("System.Diagnostics.Process");
    private static readonly Type PsiType = Asm.GetType("System.Diagnostics.ProcessStartInfo")!;
    private static readonly Type ProcType = Asm.GetType("System.Diagnostics.Process")!;

    public static async Task<(bool ok, string log)> RunAsync(string file, string[] args, string workDir, int timeoutSeconds)
    {
        var psi = Activator.CreateInstance(PsiType)!;
        PsiType.GetProperty("FileName")!.SetValue(psi, file);
        PsiType.GetProperty("WorkingDirectory")!.SetValue(psi, workDir);
        PsiType.GetProperty("RedirectStandardOutput")!.SetValue(psi, true);
        PsiType.GetProperty("RedirectStandardError")!.SetValue(psi, true);
        PsiType.GetProperty("UseShellExecute")!.SetValue(psi, false);
        var argList = (IList)PsiType.GetProperty("ArgumentList")!.GetValue(psi)!;
        foreach (var a in args) argList.Add(a);

        var proc = ProcType.GetMethod("Start", new[] { PsiType })!.Invoke(null, new object[] { psi })!;
        try
        {
            var stdout = ProcType.GetProperty("StandardOutput")!.GetValue(proc)!;
            var stderr = ProcType.GetProperty("StandardError")!.GetValue(proc)!;
            var readToEndAsync = stdout.GetType().GetMethod("ReadToEndAsync", Type.EmptyTypes)!;

            // Read both streams concurrently so a full pipe buffer on one of them can never
            // deadlock a process that's still writing to the other one.
            var outTask = (Task<string>)readToEndAsync.Invoke(stdout, null)!;
            var errTask = (Task<string>)readToEndAsync.Invoke(stderr, null)!;

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(timeoutSeconds));
            var waitForExitAsync = ProcType.GetMethod("WaitForExitAsync", new[] { typeof(CancellationToken) })!;
            try
            {
                await (Task)waitForExitAsync.Invoke(proc, new object[] { cts.Token })!;
            }
            catch (OperationCanceledException)
            {
                // Kill before anything waits on the pipe reads -- they'd otherwise block
                // forever on a still-running process, same reason the old thread-based
                // version had to join them *before* even checking whether it had timed out.
                try { ProcType.GetMethod("Kill", Type.EmptyTypes)!.Invoke(proc, null); } catch { /* best-effort */ }
                return (false, $"Zeitüberschreitung nach {timeoutSeconds}s.");
            }

            var outText = await outTask;
            var errText = await errTask;

            var exitCode = (int)ProcType.GetProperty("ExitCode")!.GetValue(proc)!;
            return (exitCode == 0, (outText + errText).Trim());
        }
        finally
        {
            (proc as IDisposable)?.Dispose();
        }
    }
}
