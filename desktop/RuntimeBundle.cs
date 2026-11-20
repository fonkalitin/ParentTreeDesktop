// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
using Microsoft.Web.WebView2.Core;
namespace ParentTree;
internal static class RuntimeBundle
{
    internal static string? GetInstalledVersion()
    {
        try { return CoreWebView2Environment.GetAvailableBrowserVersionString(); }
        catch (WebView2RuntimeNotFoundException) { return null; }
    }
    internal static bool Ensure()
    {
        if (!string.IsNullOrWhiteSpace(GetInstalledVersion())) return true;
        MessageBox.Show(
            "Для запуска ParentTree нужен компонент Microsoft Edge WebView2 Runtime.\n\n" +
            "Распакуйте лежащий рядом архив WebView2-Win10-x64.zip и запустите MicrosoftEdgeWebView2RuntimeInstallerX64.exe. " +
            "После установки снова откройте ParentTree. Интернет для установки из этого архива не требуется.",
            "ParentTree — необходим компонент WebView2", MessageBoxButtons.OK, MessageBoxIcon.Information);
        return false;
    }
}
