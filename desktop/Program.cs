// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
namespace ParentTree;
internal static class Program
{
    [STAThread] private static void Main()
    {
        ApplicationConfiguration.Initialize();
        try
        {
            Directory.CreateDirectory(ClientSettings.DataDirectory);
            using (var test = File.Create(Path.Combine(ClientSettings.DataDirectory, ".write-test"))) {}
            File.Delete(Path.Combine(ClientSettings.DataDirectory, ".write-test"));
            if (!RuntimeBundle.Ensure()) return;
            var settings = ClientSettings.Load();
            if (string.IsNullOrWhiteSpace(settings.LastLocalFile) || !File.Exists(settings.LastLocalFile))
            {
                var demo = Path.Combine(Path.GetDirectoryName(Environment.ProcessPath!)!, "Демонстрационное древо.fam");
                if (!File.Exists(demo))
                {
                    using var source = typeof(Program).Assembly.GetManifestResourceStream("ParentTree.Desktop.demo.fam")!;
                    using var output = File.Create(demo); source.CopyTo(output);
                }
                settings.LastLocalFile = File.Exists(Path.Combine(ClientSettings.DataDirectory, "autosave", "recovery.fam")) ? null : demo;
                settings.Save();
            }
            Application.Run(new MainForm(settings));
        }
        catch (Exception ex)
        {
            MessageBox.Show("Не удалось запустить ParentTree. Положите EXE в папку, доступную для записи.\n\n" + ex.Message,
                "ParentTree", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
