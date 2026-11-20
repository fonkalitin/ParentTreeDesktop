// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace ParentTree;
/// <summary>Desktop editor using embedded UI and portable files.</summary>
internal sealed partial class MainForm : DarkWindow
{
    private readonly ClientSettings _settings;
    private readonly WebView2 _web = new() { Dock = DockStyle.Fill };
    private readonly StatusLabel _status = new();
    private string _treeTitle = "Без названия";

    public MainForm(ClientSettings settings)
    {
        _settings = settings;
        Text = "ParentTree — Семейное древо";
        ClientSize = new Size(1360, 900); MinimumSize = new Size(500, 360);
        StartPosition = FormStartPosition.CenterScreen; Font = Ui.BaseFont;
        ContentArea.Controls.Add(_web);
        var bar = new ToolStrip { GripStyle = ToolStripGripStyle.Hidden, Renderer = new DarkToolStripRenderer(), BackColor = Ui.Elevated, ForeColor = Ui.Text, Padding = new Padding(8,4,8,4) };
        void Add(string text, string hint, Action click, Bitmap? icon = null)
        {
            var item = new ToolStripButton(text) { ToolTipText = hint, AccessibleName = hint, Image = icon, DisplayStyle = icon is null ? ToolStripItemDisplayStyle.Text : ToolStripItemDisplayStyle.Image };
            item.Click += (_, _) => click(); bar.Items.Add(item);
        }
        Add("Новое", "Создать пустое древо", () => {
            if (!ConfirmLeave()) return;
            _localDocumentPath = null; _settings.LastLocalFile = null; _settings.Save();
            SendHost(new { type = "tree:new" }); LocalStatus();
        });
        Add("Открыть", "Открыть файл древа", async () => await OpenLocalAsync(), Ui.FileIcon(false));
        Add("Сохранить как", "Сохранить копию древа (.fam)", () => SendHost(new { type="command", name="saveAs" }), Ui.FileIcon(true));
        _status.Alignment = ToolStripItemAlignment.Right; bar.Items.Add(_status);
        ContentArea.Controls.Add(bar); LocalStatus();
    }

    protected override async void OnShown(EventArgs e)
    {
        base.OnShown(e);
        try
        {
            // Use the installed Evergreen runtime; do not unpack a browser beside the app.
            var options = new CoreWebView2EnvironmentOptions("--disable-background-networking --disable-component-update --disable-sync --no-proxy-server --no-first-run --host-resolver-rules=MAP * ~NOTFOUND");
            var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(ClientSettings.DataDirectory, "webview"), options);
            await _web.EnsureCoreWebView2Async(env);
            var core = _web.CoreWebView2;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsPasswordAutosaveEnabled = false; core.Settings.IsGeneralAutofillEnabled = false;
            core.Settings.IsStatusBarEnabled = false; core.Settings.AreDefaultContextMenusEnabled = false;
            core.NewWindowRequested += (_, args) => args.Handled = true;
            core.PermissionRequested += (_, args) => args.State = CoreWebView2PermissionState.Deny;
            core.NavigationStarting += (_, args) => {
                if (!IsLocal(args.Uri)) args.Cancel = true;
                else _editorReady = false;
            };
            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += (_, args) => {
                if (Uri.TryCreate(args.Request.Uri, UriKind.Absolute, out var inline) && inline.Scheme is "data" or "blob" &&
                    args.ResourceContext is CoreWebView2WebResourceContext.Image or CoreWebView2WebResourceContext.Media or CoreWebView2WebResourceContext.Font) return;
                if (IsLocal(args.Request.Uri) && OfflineWeb.TryRead(new Uri(args.Request.Uri).AbsolutePath, out var bytes, out var mime))
                {
                    var headers = "Content-Type: " + mime + "\r\nCache-Control: no-store";
                    if (mime.StartsWith("text/html")) headers += "\r\nContent-Security-Policy: default-src 'self'; connect-src 'none'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'";
                    args.Response = env.CreateWebResourceResponse(new MemoryStream(bytes,false), 200, "OK", headers);
                }
                else args.Response = env.CreateWebResourceResponse(Stream.Null, 403, "Local only", "");
            };
            core.WebMessageReceived += async (_, args) => {
                if (!IsLocal(args.Source)) return;
                var message = args.WebMessageAsJson; await Task.Yield();
                try
                {
                    using var parsed = JsonDocument.Parse(message);
                    var root = parsed.RootElement; var type = root.GetProperty("type").GetString();
                    if (await HandleLocalMessageAsync(type, root)) return;
                    if (type == "parenttree:title") {
                        var title = root.GetProperty("title").GetString() ?? "";
                        _treeTitle = new string(title.Where(c => !char.IsControl(c)).Take(200).ToArray());
                        Text = "ParentTree — Семейное древо — " + _treeTitle;
                    }
                }
                catch (Exception ex) { Log.Write("message: " + ex.Message); }
            };
            using var bridge = new StreamReader(typeof(Program).Assembly.GetManifestResourceStream("ParentTree.Desktop.bridge.js")!);
            await core.AddScriptToExecuteOnDocumentCreatedAsync(await bridge.ReadToEndAsync());
            core.NavigationCompleted += async (_, args) => {
                if (!args.IsSuccess) return;
                await Task.Delay(600); SendHost(new { type="command", name="fit" });
            };
            core.Navigate("https://parenttree.local/");
            Log.Write("UI started; installed WebView2 " + RuntimeBundle.GetInstalledVersion());
        }
        catch (Exception ex) { MessageBox.Show(this, ex.Message, "ParentTree — запуск", MessageBoxButtons.OK, MessageBoxIcon.Error); Close(); }
    }

    private static bool IsLocal(string value) => Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
        uri.Scheme == "https" && uri.Host == "parenttree.local" && uri.IsDefaultPort && uri.UserInfo.Length == 0;

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (e.CloseReason == CloseReason.UserClosing && !ConfirmLeave()) { e.Cancel = true; return; }
        base.OnFormClosing(e);
    }
}
