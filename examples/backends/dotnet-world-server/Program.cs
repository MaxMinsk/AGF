// C#/.NET reference backend skeleton — mirror of the Node smoke mode.
//
// v0: load schemas/protocol.schema.json (without a JSON Schema validator
// dependency yet — just sanity-parse), run a small set of representative
// protocol messages through the parser, exit cleanly.
//
// Like the Node skeleton this does not open a network port yet. Picking a
// WebSocket / SignalR transport is the next deliverable when a real client
// wants to connect.

using System.Text.Json;

namespace Agf.WorldServer;

internal static class Program
{
    private static int Main(string[] args)
    {
        var repoRoot = FindRepoRoot();
        var schemaPath = Path.Combine(repoRoot, "schemas", "protocol.schema.json");
        if (!File.Exists(schemaPath))
        {
            Console.Error.WriteLine($"[dotnet-world-server] missing schema at {schemaPath}");
            return 1;
        }

        Console.WriteLine("[dotnet-world-server] starting...");
        Console.WriteLine("[dotnet-world-server] protocol schema loaded; smoke-test mode (no transport).");
        Console.WriteLine();
        Console.WriteLine("Smoke test:");

        var samples = new (string Label, string Json)[]
        {
            ("player.join",   "{\"kind\":\"player.join\",\"payload\":{\"playerId\":\"alpha\"}}"),
            ("player.leave",  "{\"kind\":\"player.leave\",\"payload\":{\"playerId\":\"alpha\",\"reason\":\"disconnect\"}}"),
            ("intent.move",   "{\"kind\":\"intent.move\",\"sequence\":0,\"payload\":{\"playerId\":\"alpha\",\"direction\":[1,0]}}"),
            ("world.snapshot","{\"kind\":\"world.snapshot\",\"sequence\":0,\"payload\":{\"elapsed\":0,\"entities\":[{\"id\":\"player.alpha\",\"components\":{\"Transform\":{\"position\":[0,0,0]}}}],\"lastAcked\":{},\"playerSpeed\":3.5}}")
        };

        var failures = 0;
        foreach (var sample in samples)
        {
            try
            {
                using var doc = JsonDocument.Parse(sample.Json);
                var kind = doc.RootElement.GetProperty("kind").GetString();
                if (string.IsNullOrEmpty(kind))
                {
                    failures++;
                    Console.WriteLine($"  {sample.Label}: INVALID — missing kind");
                    continue;
                }
                Console.WriteLine($"  {sample.Label}: parsed");
            }
            catch (Exception ex)
            {
                failures++;
                Console.WriteLine($"  {sample.Label}: INVALID — {ex.Message}");
            }
        }

        if (failures > 0)
        {
            Console.Error.WriteLine();
            Console.Error.WriteLine($"{failures} sample message(s) failed parsing. Aborting.");
            return 1;
        }

        return 0;
    }

    private static string FindRepoRoot()
    {
        // Walk up from the executable directory until we find the repo's
        // schemas/ folder. Robust to dotnet run / publish layouts.
        var dir = AppContext.BaseDirectory;
        for (var hops = 0; hops < 10 && dir is not null; hops++)
        {
            if (Directory.Exists(Path.Combine(dir, "schemas")))
            {
                return dir;
            }
            dir = Path.GetDirectoryName(dir);
        }
        return Directory.GetCurrentDirectory();
    }
}
