// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
namespace ParentTree;

/// <summary>Toolbar status text with its own accent colour (dot is part of the text).</summary>
internal sealed class StatusLabel : ToolStripLabel
{
    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    public Color StatusColor { get; private set; } = Ui.Muted;

    public void SetStatus(string text, Color color)
    {
        Text = "● " + text;
        StatusColor = color;
        Invalidate();
    }
}
