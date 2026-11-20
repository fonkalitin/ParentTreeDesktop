// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
using System.Text.Json;
using System.Text.Json.Nodes;

namespace ParentTree;

internal static class LocalDocument
{
    internal const long MaxBytes = 256L * 1024 * 1024;
    internal static string Detached(string json)
    {
        var root = JsonNode.Parse(json) as JsonObject ?? throw new JsonException("Неверный файл древа.");
        if (root["nodes"] is not JsonArray || root["metadata"] is not JsonObject metadata)
            throw new JsonException("Это не файл древа ParentTree.");
        metadata.Remove("treeId");
        metadata.Remove("archivedAt");
        return root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
    }
    internal static string SafeName(string title)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var safe = new string(title.Select(c => invalid.Contains(c) || char.IsControl(c) ? '_' : c).ToArray()).Trim().TrimEnd('.');
        return string.IsNullOrEmpty(safe) ? "Древо" : safe[..Math.Min(safe.Length, 100)];
    }
    internal static async Task AtomicWriteAsync(string file, string json)
    {
        var temporary = file + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            await File.WriteAllTextAsync(temporary, json, new System.Text.UTF8Encoding(false));
            File.Move(temporary, file, true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}
