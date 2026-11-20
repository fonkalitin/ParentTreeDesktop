// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
using System.Drawing.Drawing2D;
using System.Reflection;
using System.Runtime.InteropServices;

namespace ParentTree;

/// <summary>Consistent dark, rounded window chrome on Windows 10 and 11.</summary>
internal class DarkWindow : Form
{
    protected readonly Panel ContentArea = new() { Dock = DockStyle.Fill };
    private readonly Panel _caption = new() { Dock = DockStyle.Top, Height = 36 };
    private readonly Label _captionText = new() { Dock = DockStyle.Fill, AutoEllipsis = true, TextAlign = ContentAlignment.MiddleLeft };
    private readonly PictureBox _captionIcon = new() { Dock = DockStyle.Left, Width = 32, SizeMode = PictureBoxSizeMode.CenterImage };
    private readonly Button _close;
    private readonly Button _minimize;
    private readonly List<CaptionSurface> _captionSurfaces = new();
    private bool _inSystemMove;
    private readonly Button _maximize;
    private readonly ToolTip _tips = new();
    internal bool Resizable = true;


    public DarkWindow()
    {
        FormBorderStyle = FormBorderStyle.None;
        Padding = new Padding(6);
        BackColor = Ui.Elevated;
        ForeColor = Ui.Text;
        Font = Ui.BaseFont;
        DoubleBuffered = true;
        SetStyle(ControlStyles.ResizeRedraw, true);
        _caption.BackColor = Ui.Elevated;
        _captionText.ForeColor = Ui.Text;
        _caption.Controls.Add(_captionText);
        _caption.Controls.Add(_captionIcon);
        _close = AddCaptionButton("×", "Закрыть", () => Close(), close: true);
        _maximize = AddCaptionButton("□", "Развернуть / восстановить", ToggleMaximize);
        _minimize = AddCaptionButton("−", "Свернуть", () => WindowState = FormWindowState.Minimized);
        Controls.Add(ContentArea);
        Controls.Add(_caption);
        ContentArea.BringToFront();
        _captionText.BringToFront();
        // Route non-interactive title surfaces to the top-level HWND for native
        // drag/resize/Snap. Caption buttons retain their own click and paint handlers.
        foreach (Control control in new Control[] { _caption, _captionText, _captionIcon })
            _captionSurfaces.Add(new CaptionSurface(control));
        using var iconStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("ParentTree.Desktop.app.ico");
        if (iconStream is not null)
        {
            using var source = new Icon(iconStream);
            Icon = (Icon)source.Clone();
            _captionIcon.Image = new Bitmap(source.ToBitmap(), new Size(20, 20));
        }
        TextChanged += (_, _) => _captionText.Text = Text;
    }

    private Button AddCaptionButton(string glyph, string tooltip, Action action, bool close = false)
    {
        var button = new Button
        {
            Text = glyph, Dock = DockStyle.Right, Width = 42, TabStop = false,
            FlatStyle = FlatStyle.Flat, BackColor = Ui.Elevated, ForeColor = Ui.Text,
            Font = new Font("Segoe UI", 12f), UseVisualStyleBackColor = false,
            AccessibleName = tooltip,
        };
        button.FlatAppearance.BorderSize = 0;
        button.FlatAppearance.MouseOverBackColor = close ? Color.FromArgb(190, 50, 60) : Ui.Hover;
        button.FlatAppearance.MouseDownBackColor = close ? Color.FromArgb(150, 35, 45) : Ui.Panel;
        // Paint caption symbols ourselves, including restore. No font/OS caption
        // glyph is allowed to introduce a white native button over the dark frame.
        button.Paint += (_, e) =>
        {
            var hover = button.ClientRectangle.Contains(button.PointToClient(Cursor.Position));
            e.Graphics.Clear(hover ? (close ? Color.FromArgb(190, 50, 60) : Ui.Hover) : Ui.Elevated);
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using var pen = new Pen(Ui.Text, 1.2f);
            var x = button.Width / 2f; var y = button.Height / 2f;
            if (close)
            {
                e.Graphics.DrawLine(pen, x - 4, y - 4, x + 4, y + 4);
                e.Graphics.DrawLine(pen, x + 4, y - 4, x - 4, y + 4);
            }
            else if (glyph == "−") e.Graphics.DrawLine(pen, x - 5, y + 2, x + 5, y + 2);
            else if (WindowState == FormWindowState.Maximized)
            {
                e.Graphics.DrawLines(pen, new[] { new PointF(x - 2, y - 5), new PointF(x + 5, y - 5),
                    new PointF(x + 5, y + 2), new PointF(x + 3, y + 2) });
                e.Graphics.DrawRectangle(pen, x - 5, y - 2, 8, 7);
            }
            else e.Graphics.DrawRectangle(pen, x - 5, y - 5, 10, 10);
        };
        button.Click += (_, _) => action();
        _tips.SetToolTip(button, tooltip);
        _caption.Controls.Add(button);
        button.BringToFront();
        return button;
    }

    private void ToggleMaximize()
    {
        if (!MaximizeBox || !Resizable) return;
        WindowState = WindowState == FormWindowState.Maximized
            ? FormWindowState.Normal : FormWindowState.Maximized;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using var pen = new Pen(ContainsFocus ? Color.FromArgb(94, 115, 140) : Color.FromArgb(73, 90, 112), 1.25f);
        var bounds = new RectangleF(0.75f, 0.75f, Width - 1.5f, Height - 1.5f);
        if (bounds.Width < 24 || bounds.Height < 24) return;
        if (WindowState != FormWindowState.Normal || IsSnapped()) e.Graphics.DrawRectangle(pen, bounds);
        else
        {
            var d = Math.Max(20, 24 * DeviceDpi / 96);
            using var outline = new GraphicsPath();
            outline.AddArc(bounds.X, bounds.Y, d, d, 180, 90);
            outline.AddArc(bounds.Right - d, bounds.Y, d, d, 270, 90);
            outline.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90);
            outline.AddArc(bounds.X, bounds.Bottom - d, d, d, 90, 90);
            outline.CloseFigure();
            e.Graphics.DrawPath(pen, outline);
        }
    }

    protected override void OnActivated(EventArgs e) { base.OnActivated(e); Invalidate(); }
    protected override void OnDeactivate(EventArgs e) { base.OnDeactivate(e); Invalidate(); }

    protected override void OnLoad(EventArgs e)
    {
        _minimize.Visible = MinimizeBox;
        _maximize.Visible = MaximizeBox && Resizable;
        _captionText.Text = Text;
        UpdateShape();
        base.OnLoad(e);
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        if (_maximize is not null) _maximize.Text = WindowState == FormWindowState.Maximized ? "❐" : "□";
        UpdateShape();
    }

    private void UpdateShape()
    {
        if (Width < 30 || Height < 30) return;
        var previous = Region;
        if (WindowState != FormWindowState.Normal || _inSystemMove || IsSnapped() || OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22000)) Region = null;
        else
        {
            var d = Math.Max(20, 24 * DeviceDpi / 96);
            using var path = new GraphicsPath();
            path.AddArc(0, 0, d, d, 180, 90);
            path.AddArc(Width - d, 0, d, d, 270, 90);
            path.AddArc(Width - d, Height - d, d, d, 0, 90);
            path.AddArc(0, Height - d, d, d, 90, 90);
            path.CloseFigure();
            Region = new Region(path);
        }
        previous?.Dispose();
    }

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ClassStyle |= 0x0008; // CS_DBLCLKS
            cp.Style &= ~(0x00040000 | 0x00020000 | 0x00010000);
            cp.Style &= ~0x00C00000; // No WS_CAPTION: DefWindowProc must never draw a second title bar.
            cp.Style |= 0x00080000; // WS_SYSMENU
            if (Resizable) cp.Style |= 0x00040000; // WS_THICKFRAME: native resize and Snap
            if (MinimizeBox) cp.Style |= 0x00020000;
            if (Resizable && MaximizeBox) cp.Style |= 0x00010000;
            return cp;
        }
    }

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        if (OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22000))
        {
            var round = 2; // DWMWCP_ROUND; system removes rounding while snapped/maximized.
            DwmSetWindowAttribute(Handle, 33, ref round, sizeof(int));
        }
    }

    private bool IsSnapped()
    {
        if (!Resizable || !IsHandleCreated || WindowState != FormWindowState.Normal) return false;
        var work = Screen.FromHandle(Handle).WorkingArea;
        // On Windows 10, omit the custom region at snapped edges. The region is
        // also removed for the entire native move/resize loop.
        var touchesSide = Math.Abs(Left - work.Left) <= 2 || Math.Abs(Right - work.Right) <= 2;
        var touchesVertical = Math.Abs(Top - work.Top) <= 2 || Math.Abs(Bottom - work.Bottom) <= 2;
        return touchesSide && touchesVertical && (Height >= work.Height - 2 || Width <= work.Width / 2 + 2);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativePoint { public int X; public int Y; public NativePoint(int x, int y) { X = x; Y = y; } }
    [StructLayout(LayoutKind.Sequential)]
    private struct MinMaxInfo
    {
        public NativePoint Reserved, MaxSize, MaxPosition, MinTrackSize, MaxTrackSize;
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == 0x00A3 && m.WParam.ToInt32() == 2 && Resizable && MaximizeBox)
        {
            ToggleMaximize();
            m.Result = IntPtr.Zero;
            return;
        }
        if (m.Msg == 0x0085) { m.Result = IntPtr.Zero; return; } // No native NC border over custom chrome.
        if (m.Msg == 0x0086)
        {
            m.LParam = new IntPtr(-1); // Update activation without repainting the native caption.
            base.WndProc(ref m);
            Invalidate();
            return;
        }
        if (m.Msg == 0x0083) // WM_NCCALCSIZE: keep native styles, draw the frame ourselves.
        {
            m.Result = IntPtr.Zero;
            return;
        }
        if (m.Msg == 0x0024 && Resizable && m.LParam != IntPtr.Zero)
        {
            base.WndProc(ref m);
            var info = Marshal.PtrToStructure<MinMaxInfo>(m.LParam);
            var monitor = Screen.FromHandle(Handle);
            var work = monitor.WorkingArea;
            info.MaxPosition = new NativePoint(work.Left - monitor.Bounds.Left, work.Top - monitor.Bounds.Top);
            info.MaxSize = new NativePoint(work.Width, work.Height);
            info.MinTrackSize = new NativePoint(Math.Max(1, MinimumSize.Width), Math.Max(1, MinimumSize.Height));
            Marshal.StructureToPtr(info, m.LParam, false);
            m.Result = IntPtr.Zero;
            return;
        }
        if (m.Msg == 0x0231) { _inSystemMove = true; UpdateShape(); } // WM_ENTERSIZEMOVE
        if (m.Msg == 0x0232)
        {
            base.WndProc(ref m);
            _inSystemMove = false;
            UpdateShape();
            Invalidate();
            return;
        }
        if (m.Msg == 0x0084)
        {
            var packed = m.LParam.ToInt64();
            var screenPoint = new Point((short)(packed & 0xffff), (short)((packed >> 16) & 0xffff));
            var point = PointToClient(screenPoint);
            if (Resizable && WindowState == FormWindowState.Normal)
            {
                var edge = Math.Max(6, 6 * DeviceDpi / 96);
                var left = point.X < edge; var right = point.X >= Width - edge;
                var top = point.Y < edge; var bottom = point.Y >= Height - edge;
                var hit = top && left ? 13 : top && right ? 14 : bottom && left ? 16 : bottom && right ? 17 :
                    left ? 10 : right ? 11 : top ? 12 : bottom ? 15 : 0;
                if (hit != 0) { m.Result = new IntPtr(hit); return; }
            }
            if (_maximize is not null && _maximize.Visible && Resizable && MaximizeBox &&
                _maximize.RectangleToScreen(_maximize.ClientRectangle).Contains(screenPoint))
            { m.Result = new IntPtr(1); return; } // Custom button owns click/paint; never draw a native duplicate.
            if ((_close is not null && _close.RectangleToScreen(_close.ClientRectangle).Contains(screenPoint)) ||
                (_minimize is not null && _minimize.Visible && _minimize.RectangleToScreen(_minimize.ClientRectangle).Contains(screenPoint)))
            { m.Result = new IntPtr(1); return; }
            if (_captionIcon is not null && _captionIcon.RectangleToScreen(_captionIcon.ClientRectangle).Contains(screenPoint))
            { m.Result = new IntPtr(3); return; } // HTSYSMENU
            if (_caption is not null && _caption.Bounds.Contains(point))
            { m.Result = new IntPtr(2); return; } // HTCAPTION: real system title-bar behavior.
        }
        base.WndProc(ref m);
    }

    private sealed class CaptionSurface : NativeWindow, IDisposable
    {
        private readonly Control _control;
        public CaptionSurface(Control control)
        {
            _control = control;
            control.HandleCreated += Created;
            control.HandleDestroyed += Destroyed;
            if (control.IsHandleCreated) AssignHandle(control.Handle);
        }
        private void Created(object? sender, EventArgs e) => AssignHandle(_control.Handle);
        private void Destroyed(object? sender, EventArgs e) { if (Handle != IntPtr.Zero) ReleaseHandle(); }
        protected override void WndProc(ref Message m)
        {
            if (m.Msg == 0x0084) { m.Result = new IntPtr(-1); return; } // HTTRANSPARENT to parent HWND.
            base.WndProc(ref m);
        }
        public void Dispose()
        {
            _control.HandleCreated -= Created;
            _control.HandleDestroyed -= Destroyed;
            if (Handle != IntPtr.Zero) ReleaseHandle();
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) { foreach (var surface in _captionSurfaces) surface.Dispose(); _tips.Dispose(); _captionIcon.Image?.Dispose(); }
        base.Dispose(disposing);
    }
}
