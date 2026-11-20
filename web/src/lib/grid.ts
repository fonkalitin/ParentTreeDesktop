// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
/** Default snap grid — cards and drops align to this pitch. */
export const DEFAULT_GRID_SIZE = 20

export function snapTo(value: number, grid: number): number {
  if (!grid || grid <= 0) return value
  return Math.round(value / grid) * grid
}

export function snapPoint(
  p: { x: number; y: number },
  grid: number,
): { x: number; y: number } {
  return { x: snapTo(p.x, grid), y: snapTo(p.y, grid) }
}
