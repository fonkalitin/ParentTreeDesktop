// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
using System.IO.Compression;
using System.Reflection;

namespace ParentTree;

internal static class OfflineWeb
{
    private static readonly Lazy<Dictionary<string, byte[]>> Files = new(() =>
    {
        using var source = Assembly.GetExecutingAssembly().GetManifestResourceStream("ParentTree.Desktop.OfflineWeb.zip")
            ?? throw new InvalidOperationException("В сборке отсутствует автономный интерфейс.");
        using var archive = new ZipArchive(source, ZipArchiveMode.Read);
        return archive.Entries.Where(e => e.Name.Length > 0).ToDictionary(
            e => e.FullName.Replace('\\', '/'),
            e => { using var stream = e.Open(); using var copy = new MemoryStream(); stream.CopyTo(copy); return copy.ToArray(); },
            StringComparer.Ordinal);
    });

    internal static bool TryRead(string path, out byte[] bytes, out string mime)
    {
        path = Uri.UnescapeDataString(path).TrimStart('/');
        if (path.Length == 0) path = "index.html";
        mime = Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".html" => "text/html; charset=utf-8", ".js" => "text/javascript; charset=utf-8",
            ".css" => "text/css; charset=utf-8", ".svg" => "image/svg+xml", ".png" => "image/png",
            ".ico" => "image/x-icon", ".woff2" => "font/woff2", _ => "application/octet-stream",
        };
        return Files.Value.TryGetValue(path, out bytes!);
    }
}
