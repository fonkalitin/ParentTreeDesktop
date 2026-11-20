// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
using System.Runtime.InteropServices;
using ParentTree;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        using var window = new ProbeWindow
        {
            Size = new Size(1000, 700), Location = new Point(100, 100),
            MinimumSize = new Size(500, 360), Opacity = 0, ShowInTaskbar = false,
        };
        var style = window.StyleBits();
        Check((style & 0x000F0000) == 0x000F0000, "native resize/min/max/system styles missing");
        Check((style & 0x00C00000) == 0, "native caption will overlap dark caption");
        Check((window.ClassBits() & 8) != 0, "double-click class style missing");
        _ = window.Handle;
        window.Show(); // Opacity=0, WS_EX_NOACTIVATE, no taskbar entry: exercise a real visible HWND without desktop input.
        Application.DoEvents();
        Check((window.ActualStyle() & 0x00C00000) == 0, "real HWND has native caption");
        window.Text = "Loaded local file changes the title";
        Check((window.ActualStyle() & 0x00C00000) == 0, "title update restored native caption");
        window.PerformLayout();
        foreach (Control child in window.Controls) child.PerformLayout();
        var point = window.PointToScreen(new Point(120, 24));
        var packed = new IntPtr(((long)(ushort)point.Y << 16) | (ushort)point.X);
        Check(window.Dispatch(0x84, IntPtr.Zero, packed).ToInt32() == 2, "caption does not return HTCAPTION");
        var edge = window.PointToScreen(new Point(2, 100));
        var packedEdge = new IntPtr(((long)(ushort)edge.Y << 16) | (ushort)edge.X);
        Check(window.Dispatch(0x84, IntPtr.Zero, packedEdge).ToInt32() == 10, "left-edge resize hit test failed");
        Check(window.Dispatch(0x85, IntPtr.Zero, IntPtr.Zero) == IntPtr.Zero && !window.NativePaintDefault,
            "native caption paint leaks over custom frame");
        window.Dispatch(0x86, new IntPtr(1), IntPtr.Zero);
        Check(window.ActivationWithoutRedraw, "activation repaints native caption");
        window.Dispatch(0xA3, new IntPtr(2), packed); // WM_NCLBUTTONDBLCLK / HTCAPTION
        Check(window.WindowState == FormWindowState.Maximized, "caption double-click did not maximize");
        window.Dispatch(0xA3, new IntPtr(2), packed);
        Check(window.WindowState == FormWindowState.Normal, "caption double-click did not restore");
        window.ClickMaximize();
        Check(window.WindowState == FormWindowState.Maximized && window.ActuallyMaximized(), "maximize button did not maximize the actual HWND");
        Check((window.ActualStyle() & 0x00C00000) == 0, "maximizing restored native caption");
        window.ClickMaximize();
        Check(window.WindowState == FormWindowState.Normal && !window.ActuallyMaximized(), "maximize button did not restore the actual HWND");
        window.Dispatch(0xA1, new IntPtr(2), packed); // WM_NCLBUTTONDOWN / HTCAPTION
        Check(window.DefaultCaptionDrag, "caption drag was swallowed before DefWindowProc");
        Check(window.Dispatch(0x83, new IntPtr(1), IntPtr.Zero) == IntPtr.Zero, "custom client-frame calculation failed");
        var buffer = Marshal.AllocHGlobal(40);
        try
        {
            Marshal.Copy(new int[10], 0, buffer, 10);
            window.Dispatch(0x24, IntPtr.Zero, buffer);
            var values = new int[10]; Marshal.Copy(buffer, values, 0, 10);
            var monitor = Screen.FromHandle(window.Handle);
            Check(values[2] == monitor.WorkingArea.Width && values[3] == monitor.WorkingArea.Height,
                "maximized size does not respect monitor work area");
            Check(values[4] == monitor.WorkingArea.Left - monitor.Bounds.Left &&
                  values[5] == monitor.WorkingArea.Top - monitor.Bounds.Top, "monitor-relative maximize position incorrect");
            Check(values[6] == 500 && values[7] == 360, "minimum tracking size incorrect");
        }
        finally { Marshal.FreeHGlobal(buffer); }
        window.Dispatch(0x231, IntPtr.Zero, IntPtr.Zero);
        Check(window.Region is null, "custom region blocks native move/snap loop");
        window.Dispatch(0x232, IntPtr.Zero, IntPtr.Zero);
        using var dialog = new ProbeWindow { Resizable = false, MinimizeBox = false, MaximizeBox = false };
        Check((dialog.StyleBits() & 0x00070000) == 0, "fixed dialog unexpectedly resizable/maximizable");
        Console.WriteLine("PASS: no native caption before/after title update; real maximize-button and double-click state transitions; resize/drag styles; monitor bounds; fixed dialog");
    }
    private static void Check(bool value, string message) { if (!value) throw new Exception(message); }
}
internal sealed class ProbeWindow : DarkWindow
{
    internal bool DefaultCaptionDoubleClick, DefaultCaptionDrag, NativePaintDefault, ActivationWithoutRedraw;
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")]
    private static extern int GetWindowLong(IntPtr hwnd, int index);
    [DllImport("user32.dll")] private static extern bool IsZoomed(IntPtr hwnd);
    internal bool ActuallyMaximized() => IsZoomed(Handle);
    internal int ActualStyle() => GetWindowLong(Handle, -16);
    internal void ClickMaximize()
    {
        var field = typeof(DarkWindow).GetField("_maximize", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!;
        var button = (Button)field.GetValue(this)!;
        typeof(Button).GetMethod("OnClick", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!
            .Invoke(button, new object[] { EventArgs.Empty });
    }
    protected override CreateParams CreateParams
    {
        get { var cp = base.CreateParams; cp.ExStyle |= 0x08000000; return cp; } // No activation by test window.
    }
    internal int StyleBits() => CreateParams.Style;
    internal int ClassBits() => CreateParams.ClassStyle;
    internal IntPtr Dispatch(int id, IntPtr wParam, IntPtr lParam)
    {
        var message = Message.Create(Handle, id, wParam, lParam);
        WndProc(ref message);
        return message.Result;
    }
    protected override void DefWndProc(ref Message m)
    {
        // Observe routing without injecting desktop input or entering a real system drag loop.
        if (m.Msg == 0x85) { NativePaintDefault = true; m.Result = IntPtr.Zero; return; }
        if (m.Msg == 0x86) { ActivationWithoutRedraw = m.LParam == new IntPtr(-1); m.Result = new IntPtr(1); return; }
        if (m.Msg == 0xA3) { DefaultCaptionDoubleClick = true; m.Result = IntPtr.Zero; return; }
        if (m.Msg == 0xA1) { DefaultCaptionDrag = true; m.Result = IntPtr.Zero; return; }
        base.DefWndProc(ref m);
    }
}
