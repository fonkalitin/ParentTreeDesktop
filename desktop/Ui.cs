// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
using System.Runtime.InteropServices;
using System.Drawing.Drawing2D;

namespace ParentTree;

/// <summary>Dark palette matching the web UI (web/src/index.css).</summary>
internal static class Ui
{
    public static readonly Color Bg = Color.FromArgb(15, 20, 25);        // #0f1419
    public static readonly Color Elevated = Color.FromArgb(23, 29, 37);  // #171d25
    public static readonly Color Panel = Color.FromArgb(28, 36, 48);     // #1c2430
    public static readonly Color Border = Color.FromArgb(42, 52, 68);    // #2a3444
    public static readonly Color Text = Color.FromArgb(232, 238, 247);   // #e8eef7
    public static readonly Color Muted = Color.FromArgb(147, 160, 180);  // #93a0b4
    public static readonly Color Accent = Color.FromArgb(91, 159, 212);  // #5b9fd4
    public static readonly Color Hover = Color.FromArgb(38, 47, 61);
    public static readonly Color Ok = Color.FromArgb(74, 222, 128);
    public static readonly Color Error = Color.FromArgb(248, 113, 113);
    public static readonly Color Warn = Color.FromArgb(224, 184, 74);

    public static readonly Font BaseFont = new("Segoe UI", 9f);

    private const int DwmUseImmersiveDarkMode = 20;
    private const int DwmUseImmersiveDarkModeLegacy = 19;

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    /// <summary>Paint the native title bar dark (Windows 10 1809+ and Windows 11).</summary>
    public static void ApplyDarkTitleBar(Form form)
    {
        void Apply()
        {
            try
            {
                var enabled = 1;
                if (DwmSetWindowAttribute(form.Handle, DwmUseImmersiveDarkMode, ref enabled, sizeof(int)) != 0)
                {
                    DwmSetWindowAttribute(form.Handle, DwmUseImmersiveDarkModeLegacy, ref enabled, sizeof(int));
                }
            }
            catch
            {
                /* older Windows: keep the default title bar */
            }
        }

        if (form.IsHandleCreated) Apply();
        else form.HandleCreated += (_, _) => Apply();
    }

    public static Bitmap FileIcon(bool save)
    {
        var image = new Bitmap(20, 20);
        using var graphics = Graphics.FromImage(image);
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using var pen = new Pen(Text, 1.5f);
        if (save)
        {
            graphics.DrawRectangle(pen, 3, 2, 14, 16);
            graphics.DrawRectangle(pen, 6, 2, 8, 5);
            graphics.DrawRectangle(pen, 6, 11, 8, 7);
        }
        else graphics.DrawPolygon(pen, new[] { new Point(2, 6), new Point(2, 17), new Point(17, 17),
            new Point(19, 7), new Point(9, 7), new Point(7, 4), new Point(2, 4), new Point(2, 6) });
        return image;
    }

    public static Bitmap ToolbarIcon(bool gear)
    {
        var image = new Bitmap(20, 20);
        using var graphics = Graphics.FromImage(image);
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using var pen = new Pen(Text, 1.6f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        if (gear)
        {
            var points = Enumerable.Range(0, 32).Select(i =>
            {
                var angle = i * Math.PI / 16;
                var radius = i % 4 is 1 or 2 ? 8.4 : 6.5;
                return new PointF(10 + (float)(Math.Cos(angle) * radius), 10 + (float)(Math.Sin(angle) * radius));
            }).ToArray();
            graphics.DrawPolygon(pen, points);
            graphics.DrawEllipse(pen, 7, 7, 6, 6);
        }
        else
        {
            graphics.DrawArc(pen, 3, 3, 14, 14, 35, 290);
            graphics.DrawLines(pen, new[] { new PointF(12, 2), new PointF(16, 4), new PointF(16, 0.8f) });
        }
        return image;
    }

    public static void StyleTextBox(TextBox box)
    {
        box.BackColor = Elevated;
        box.ForeColor = Text;
        box.BorderStyle = BorderStyle.FixedSingle;
    }

    public static void StyleButton(Button button, bool primary = false)
    {
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderColor = primary ? Accent : Border;
        button.FlatAppearance.MouseOverBackColor = primary ? ControlPaint.Light(Accent) : Hover;
        button.FlatAppearance.MouseDownBackColor = primary ? ControlPaint.Dark(Accent) : Panel;
        button.BackColor = primary ? Accent : Elevated;
        button.ForeColor = primary ? Color.FromArgb(15, 20, 25) : Text;
        button.UseVisualStyleBackColor = false;
    }
}

/// <summary>Dark renderer for the slim top toolbar.</summary>
internal sealed class DarkToolStripRenderer : ToolStripProfessionalRenderer
{
    public DarkToolStripRenderer() : base(new DarkColorTable())
    {
        RoundedEdges = false;
    }

    protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e)
    {
        using var brush = new SolidBrush(Ui.Elevated);
        e.Graphics.FillRectangle(brush, e.AffectedBounds);
    }

    protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
    {
        using var pen = new Pen(Ui.Border);
        var y = e.ToolStrip.Height - 1;
        e.Graphics.DrawLine(pen, 0, y, e.ToolStrip.Width, y);
    }

    protected override void OnRenderButtonBackground(ToolStripItemRenderEventArgs e)
    {
        if (!e.Item.Selected && !e.Item.Pressed) return;
        var bounds = new Rectangle(2, 2, e.Item.Width - 4, e.Item.Height - 4);
        using var brush = new SolidBrush(e.Item.Pressed ? Ui.Panel : Ui.Hover);
        using var path = RoundedRect(bounds, 4);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        e.Graphics.FillPath(brush, path);
    }

    protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
    {
        e.TextColor = e.Item is StatusLabel status
            ? status.StatusColor
            : e.Item.Enabled
                ? Ui.Text
                : Ui.Muted;
        base.OnRenderItemText(e);
    }

    protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e)
    {
        using var pen = new Pen(Ui.Border);
        var x = e.Item.Width / 2;
        e.Graphics.DrawLine(pen, x, 6, x, e.Item.Height - 6);
    }

    private static GraphicsPath RoundedRect(Rectangle bounds, int radius)
    {
        var path = new GraphicsPath();
        var d = radius * 2;
        path.AddArc(bounds.X, bounds.Y, d, d, 180, 90);
        path.AddArc(bounds.Right - d, bounds.Y, d, d, 270, 90);
        path.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90);
        path.AddArc(bounds.X, bounds.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }
}

internal sealed class DarkColorTable : ProfessionalColorTable
{
    public override Color ToolStripGradientBegin => Ui.Elevated;
    public override Color ToolStripGradientMiddle => Ui.Elevated;
    public override Color ToolStripGradientEnd => Ui.Elevated;
    public override Color ToolStripBorder => Ui.Border;
    public override Color ToolStripDropDownBackground => Ui.Panel;
    public override Color ImageMarginGradientBegin => Ui.Panel;
    public override Color ImageMarginGradientMiddle => Ui.Panel;
    public override Color ImageMarginGradientEnd => Ui.Panel;
    public override Color MenuBorder => Ui.Border;
    public override Color MenuItemSelected => Ui.Hover;
    public override Color ButtonSelectedHighlight => Ui.Hover;
    public override Color ButtonSelectedGradientBegin => Ui.Hover;
    public override Color ButtonSelectedGradientEnd => Ui.Hover;
    public override Color ButtonPressedGradientBegin => Ui.Panel;
    public override Color ButtonPressedGradientEnd => Ui.Panel;
}
