// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
using System.Text.Json;

namespace ParentTree;

internal sealed partial class MainForm
{
    private bool _documentDirty;
    private bool _editorReady;
    private string? _localDocumentPath;
    private string? _pendingLocalJson;
    private string? _pendingLocalPath;
    private bool _pendingRecovery;

    private string RecoveryPath => Path.Combine(ClientSettings.DataDirectory, "autosave", "recovery.fam");

    private void LocalStatus()
    {
        _status.Text = _localDocumentPath is null ? "Новое древо" : Path.GetFileName(_localDocumentPath);
        _status.ForeColor = Ui.Muted;
    }


    private bool ConfirmLeave() => !_documentDirty || MessageBox.Show(this,
        "В дереве есть несохранённые изменения. Продолжить без их сохранения?",
        "ParentTree", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes;

    private void SendHost(object message)
    {
        if (_web.CoreWebView2 is not null)
            _web.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(message));
    }

    private async Task LoadLocalAsync(string file, bool recovery = false)
    {
        if (new FileInfo(file).Length > LocalDocument.MaxBytes) throw new IOException("Файл больше 256 МБ.");
        var json = LocalDocument.Detached(await File.ReadAllTextAsync(file));
        _localDocumentPath = recovery ? null : file;
        if (!recovery) { _settings.LastLocalFile = file; _settings.Save(); }
        if (_editorReady)
            SendHost(new { type = "tree:load", payload = JsonSerializer.Deserialize<JsonElement>(json), path = recovery ? null : file, recovery });
        else { _pendingLocalJson = json; _pendingLocalPath = recovery ? null : file; _pendingRecovery = recovery; }
        LocalStatus();
    }

    private async Task RestoreLocalAsync()
    {
        if (!string.IsNullOrWhiteSpace(_settings.LastLocalFile) && File.Exists(_settings.LastLocalFile))
            await LoadLocalAsync(_settings.LastLocalFile);
        else if (File.Exists(RecoveryPath))
            await LoadLocalAsync(RecoveryPath, recovery: true);
    }

    private async Task OpenLocalAsync()
    {
        if (!ConfirmLeave()) return;
        using var dialog = new OpenFileDialog
        {
            Title = "Открыть древо с компьютера",
            Filter = "Древо ParentTree (*.fam;*.json)|*.fam;*.json|Все файлы (*.*)|*.*",
            CheckFileExists = true, Multiselect = false,
        };
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        try { await LoadLocalAsync(dialog.FileName); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
        { MessageBox.Show(this, ex.Message, "Не удалось открыть файл", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    private async Task SaveLocalAsync(JsonElement payload, bool exportOnly, bool saveAs)
    {
        var json = LocalDocument.Detached(payload.GetRawText());
        if (System.Text.Encoding.UTF8.GetByteCount(json) > LocalDocument.MaxBytes) throw new IOException("Файл больше 256 МБ.");
        string? file = !exportOnly && !saveAs ? _localDocumentPath : null;
        if (file is null)
        {
            using var dialog = new SaveFileDialog
            {
                Title = exportOnly ? "Экспортировать древо на компьютер" : "Сохранить древо",
                Filter = "Древо ParentTree (*.fam)|*.fam|JSON (*.json)|*.json",
                DefaultExt = "fam", AddExtension = true, OverwritePrompt = true,
                FileName = LocalDocument.SafeName(_treeTitle) + ".fam",
            };
            if (dialog.ShowDialog(this) != DialogResult.OK) return;
            file = dialog.FileName;
        }
        await LocalDocument.AtomicWriteAsync(file, json);
        if (!exportOnly)
        {
            _localDocumentPath = file;
            _settings.LastLocalFile = file;
            _settings.Save();
            SendHost(new { type = "tree:saved", path = file });
            LocalStatus();
        }
    }

    private async Task<bool> HandleLocalMessageAsync(string? type, JsonElement root)
    {
        try
        {
            switch (type)
            {
                case "ready":
                    var firstReady = !_editorReady;
                    _editorReady = true;
                    Log.Write("editor ready");
                    if (_pendingLocalJson is { } pending)
                    {
                        SendHost(new { type = "tree:load", payload = JsonSerializer.Deserialize<JsonElement>(pending), path = _pendingLocalPath, recovery = _pendingRecovery });
                        _pendingLocalJson = null;
                    }
                    else if (firstReady) await RestoreLocalAsync();
                    return true;
                case "tree:changed":
                    _documentDirty = root.GetProperty("dirty").GetBoolean();
                    return true;
                case "file:open": await OpenLocalAsync(); return true;
                case "tree:export-local": await SaveLocalAsync(root.GetProperty("payload"), true, true); return true;
                case "tree:save":
                    await SaveLocalAsync(root.GetProperty("payload"), false,
                        root.TryGetProperty("saveAs", out var saveAs) && saveAs.ValueKind == JsonValueKind.True);
                    return true;
                case "tree:autosave":
                    var target = _localDocumentPath is not null ? _localDocumentPath : RecoveryPath;
                    Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                    await LocalDocument.AtomicWriteAsync(target, LocalDocument.Detached(root.GetProperty("payload").GetRawText()));
                    SendHost(new { type = "tree:autosaved", path = target, recovery = target == RecoveryPath, requestId = root.TryGetProperty("requestId", out var requestId) ? requestId.GetString() : null });
                    return true;
                case "export:file":
                    var dataUrl = root.GetProperty("dataUrl").GetString() ?? "";
                    var comma = dataUrl.IndexOf(',');
                    if (comma < 0 || !dataUrl[..comma].EndsWith(";base64", StringComparison.Ordinal)) throw new IOException("Неверные данные экспорта.");
                    var suggested = root.GetProperty("suggestedName").GetString() ?? "export.bin";
                    using (var dialog = new SaveFileDialog { Title = "Сохранить экспорт", FileName = Path.GetFileName(suggested), OverwritePrompt = true })
                        if (dialog.ShowDialog(this) == DialogResult.OK)
                            await File.WriteAllBytesAsync(dialog.FileName, Convert.FromBase64String(dataUrl[(comma + 1)..]));
                    return true;
                default: return false;
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException or FormatException)
        {
            if (type == "tree:autosave") SendHost(new { type = "tree:autosave-error", message = ex.Message, requestId = root.TryGetProperty("requestId", out var failedId) ? failedId.GetString() : null });
            else MessageBox.Show(this, ex.Message, "ParentTree — файл", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return true;
        }
    }
}
