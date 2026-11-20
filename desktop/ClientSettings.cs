// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
using System.Text.Json;
namespace ParentTree;
/** Portable preferences stored beside the application. */
public sealed class ClientSettings
{
    public static string DataDirectory => Path.Combine(Path.GetDirectoryName(Environment.ProcessPath!)!, "ParentTreeData");
    public string? LastLocalFile { get; set; }
    private static string FilePath => Path.Combine(DataDirectory, "settings.json");
    public static ClientSettings Load()
    {
        try { return JsonSerializer.Deserialize<ClientSettings>(File.ReadAllText(FilePath)) ?? new(); }
        catch { return new(); }
    }
    public void Save() => File.WriteAllText(FilePath, JsonSerializer.Serialize(new { LastLocalFile }));
}
internal static class Log
{
    internal static void Write(string message) => File.AppendAllText(Path.Combine(ClientSettings.DataDirectory, "desktop.log"), DateTimeOffset.Now + " " + message + Environment.NewLine);
}