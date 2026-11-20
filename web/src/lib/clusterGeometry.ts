// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import type { Node } from '@xyflow/react'
import type { FamCluster, FamClusterKind, FamDocument, FamPhantomEdge } from '../types/fam'

/** Match layoutTree card size without importing it (avoid cycle). */
export const PERSON_W = 132
/** Fits PersonCardFace: photo 84 + role/name(2)/years text block (~84) + border. */
export const PERSON_H = 170
/** Same offset as PersonNode phantom handle (`left: calc(50% + SIBLING_PORT_DX)`). */
export const PHANTOM_PORT_DX = 14
/** Same as PersonNode phantom handle `top: -2` (RF top handle center). */
export const PHANTOM_PORT_DY = -2

type ClusterFlowLike = {
  memberIds: string[]
  collapsed: boolean
  compact?: boolean
}

export const CLUSTER_PAD = 10
/** Must match ClusterNode header `h-[32px]` / style height. */
export const CLUSTER_HEADER = 32
/** Cluster card CSS border width (`border` / border-box). */
export const CLUSTER_BORDER = 1
/** Outer width of cluster card (`style.width` + border-box). RF Handle 50% uses this. */
export const CLUSTER_WIDTH = CLUSTER_PAD * 2 + PERSON_W + 2 * CLUSTER_BORDER
export const MEMBER_GAP = 8
/** Mini row: 28px thumb + name/years stack with vertical padding. */
export const MEMBER_MINI_H = 48
/** Must match ClusterNode collapsed body height. */
export const CLUSTER_COLLAPSED_BODY = 28

const STUB = 20

export const DND_FROM_CLUSTER_MIME = 'application/x-pt-from-cluster'
export const DND_CANVAS_PERSON_MIME = 'application/x-pt-canvas-person'
/** Drag a new empty cluster template from the catalog onto the canvas. */
export const DND_CLUSTER_TEMPLATE_MIME = 'application/x-pt-cluster-template'

/** Kinds that only use phantom links (no «Применить связь»). */
export function isPhantomGroupKind(kind: FamClusterKind): boolean {
  return kind === 'custom' || kind === 'household'
}

export function clusterKindLabel(kind: FamClusterKind): string {
  switch (kind) {
    case 'children':
      return 'Дети'
    case 'parents':
      return 'Родители'
    case 'siblings':
      return 'Братья/сестры'
    case 'household':
      // Legacy kind — hidden from UI; same visual as custom.
      return 'Группа'
    default:
      return 'Группа'
  }
}

export function memberStride(compact?: boolean) {
  return (compact ? MEMBER_MINI_H : PERSON_H) + MEMBER_GAP
}

export function clusterBodyHeight(
  memberCount: number,
  collapsed: boolean,
  compact?: boolean,
): number {
  if (collapsed) return CLUSTER_COLLAPSED_BODY
  const n = Math.max(memberCount, 1)
  const row = compact ? MEMBER_MINI_H : PERSON_H
  return CLUSTER_PAD + n * row + Math.max(0, n - 1) * MEMBER_GAP + CLUSTER_PAD
}

export function clusterSize(
  memberCount: number,
  collapsed: boolean,
  compact?: boolean,
) {
  // border-box: include top+bottom border so header+body still fit the formula.
  return {
    w: CLUSTER_WIDTH,
    h:
      CLUSTER_HEADER +
      clusterBodyHeight(memberCount, collapsed, compact) +
      2 * CLUSTER_BORDER,
  }
}

/** Absolute top-left of nested member #index inside an expanded cluster. */
export function memberChipLocal(index: number, compact?: boolean) {
  const h = compact ? MEMBER_MINI_H : PERSON_H
  return {
    x: CLUSTER_PAD,
    y: CLUSTER_HEADER + CLUSTER_PAD + index * (h + MEMBER_GAP),
    w: PERSON_W,
    h,
  }
}

export function nestedPersonIds(doc: FamDocument | null | undefined): Set<string> {
  const set = new Set<string>()
  for (const c of doc?.clusters ?? []) {
    for (const id of c.memberIds) set.add(id)
  }
  return set
}

export function clusterOfPerson(
  doc: FamDocument | null | undefined,
  personId: string,
): FamCluster | undefined {
  return doc?.clusters?.find((c) => c.memberIds.includes(personId))
}

/** Free person ids on canvas + everyone nested in clusters. */
export function fieldPersonIds(
  doc: FamDocument | null | undefined,
  canvasNodes: { id: string; type?: string }[],
): string[] {
  const free = canvasNodes.filter((n) => n.type !== 'cluster').map((n) => n.id)
  const nested = [...nestedPersonIds(doc)]
  return [...new Set([...free, ...nested])]
}

export type AbsBox = {
  id: string
  x: number
  y: number
  w: number
  h: number
  kind: 'person' | 'cluster'
}

export function resolveAbsBoxes(
  doc: FamDocument | null,
  nodes: Node[],
): Map<string, AbsBox> {
  const map = new Map<string, AbsBox>()

  for (const n of nodes) {
    if (n.type === 'cluster') {
      const data = n.data as ClusterFlowLike
      const size = clusterSize(
        data.memberIds.length,
        data.collapsed,
        data.compact,
      )
      // Always use clusterSize — same constants ClusterNode forces on style.width/height.
      // RF measured height drifts when content ≠ formula; Handle % is relative to the
      // cluster-card box, so geometry must match that forced size (not measured).
      const w = size.w
      const h = size.h
      map.set(n.id, {
        id: n.id,
        x: n.position.x,
        y: n.position.y,
        w,
        h,
        kind: 'cluster',
      })
      if (!data.collapsed) {
        data.memberIds.forEach((mid, i) => {
          const chip = memberChipLocal(i, data.compact)
          map.set(mid, {
            id: mid,
            x: n.position.x + chip.x,
            y: n.position.y + chip.y,
            w: chip.w,
            h: chip.h,
            kind: 'person',
          })
        })
      } else {
        for (const mid of data.memberIds) {
          map.set(mid, {
            id: mid,
            x: n.position.x + w * 0.15,
            y: n.position.y + h * 0.35,
            w: w * 0.7,
            h: h * 0.4,
            kind: 'person',
          })
        }
      }
    } else {
      const w = n.measured?.width ?? PERSON_W
      const h = n.measured?.height ?? PERSON_H
      map.set(n.id, {
        id: n.id,
        x: n.position.x,
        y: n.position.y,
        w,
        h,
        kind: 'person',
      })
    }
  }

  for (const c of doc?.clusters ?? []) {
    if (map.has(c.id)) continue
    const size = clusterSize(c.memberIds.length, c.collapsed, c.compact)
    map.set(c.id, {
      id: c.id,
      x: c.position.x,
      y: c.position.y,
      w: size.w,
      h: size.h,
      kind: 'cluster',
    })
  }

  return map
}

/** Fan-out positions when dissolving a cluster — one horizontal row (wrap if long). */
export function dissolveMemberPositions(
  origin: { x: number; y: number },
  count: number,
  opts?: { snap?: (v: number) => number; cols?: number },
): { x: number; y: number }[] {
  const snap = opts?.snap ?? ((v: number) => v)
  const cols = Math.max(1, opts?.cols ?? Math.min(6, Math.max(1, count)))
  const gapX = PERSON_W + 24
  const gapY = PERSON_H + 28
  const out: { x: number; y: number }[] = []
  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    out.push({
      x: snap(origin.x + CLUSTER_WIDTH + 36 + col * gapX),
      y: snap(origin.y + row * gapY),
    })
  }
  return out
}

export function boxCx(b: AbsBox) {
  return b.x + b.w / 2
}

export function boxTopY(b: AbsBox) {
  return b.y
}

export function boxBottomY(b: AbsBox) {
  return b.y + b.h
}

export function boxMidY(b: AbsBox) {
  return b.y + b.h / 2
}

/** Exact gray phantom port on a person card (top, offset right of center). */
export function personPhantomPort(box: AbsBox): { x: number; y: number } {
  return {
    x: boxCx(box) + PHANTOM_PORT_DX,
    y: box.y + PHANTOM_PORT_DY,
  }
}

/**
 * Cluster gray ports — centers of RF Handles on the cluster-card.
 * ClusterNode forces style width/height = clusterSize; Handles use RF defaults with
 * translate(-50%,-50%) (or ±50% on the outward axis). Absolute % is vs the padding box,
 * so visible circle centers sit on the padding edge (= outer edge ± CLUSTER_BORDER).
 */
export function clusterPhantomPorts(box: AbsBox) {
  const b = CLUSTER_BORDER
  const cx = box.x + box.w / 2
  const my = box.y + box.h / 2
  return {
    top: { x: cx, y: box.y + b },
    bottom: { x: cx, y: box.y + box.h - b },
    left: { x: box.x + b, y: my },
    right: { x: box.x + box.w - b, y: my },
  }
}

export type DockSide = 'top' | 'bottom' | 'left' | 'right'

function sideFromHandle(handle?: string | null): DockSide | null {
  if (!handle) return null
  if (handle.includes('bottom')) return 'bottom'
  if (handle.includes('left')) return 'left'
  if (handle.includes('right')) return 'right'
  if (handle.includes('top') || handle.includes('phantom')) return 'top'
  return null
}

function areHorizontalNeighbors(box: AbsBox, other: AbsBox): boolean {
  return Math.abs(boxCx(other) - boxCx(box)) >= Math.abs(boxMidY(other) - boxMidY(box))
}

/** Resolve which side a phantom endpoint should dock to. */
export function phantomDockSide(
  box: AbsBox,
  other: AbsBox,
  handle?: string | null,
): DockSide {
  // Person phantom port is always the gray top handle.
  if (box.kind === 'person') return 'top'

  const side = sideFromHandle(handle)
  // Explicit handle wins — keep intentional left/right docking.
  if (side) return side

  // No handle: side-by-side → top ports for a classic orthogonal U bus.
  if (areHorizontalNeighbors(box, other)) return 'top'

  const dy = boxMidY(other) - boxMidY(box)
  return dy >= 0 ? 'bottom' : 'top'
}

function dockPointForSide(box: AbsBox, side: DockSide): { x: number; y: number } {
  if (box.kind === 'person') return personPhantomPort(box)
  return clusterPhantomPorts(box)[side]
}

/** Dock point for a phantom endpoint using stored handle or nearest side. */
export function phantomDockPoint(
  box: AbsBox,
  other: AbsBox,
  handle?: string | null,
): { x: number; y: number } {
  return dockPointForSide(box, phantomDockSide(box, other, handle))
}

/** First waypoint outside the node — never toward the card interior. */
function outwardPoint(
  x: number,
  y: number,
  side: DockSide,
): { x: number; y: number } {
  switch (side) {
    case 'top':
      return { x, y: y - STUB }
    case 'bottom':
      return { x, y: y + STUB }
    case 'left':
      return { x: x - STUB, y }
    case 'right':
      return { x: x + STUB, y }
  }
}

/**
 * Orthogonal phantom path. First / last stubs always leave the port
 * outward (away from the node face) before any turn.
 */
export function orthogonalPhantom(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  fromSide?: DockSide | null,
  toSide?: DockSide | null,
): string {
  if (Math.abs(sx - tx) < 1 && Math.abs(sy - ty) < 1) return `M ${sx} ${sy}`

  const fs: DockSide = fromSide ?? (ty >= sy ? 'bottom' : 'top')
  const ts: DockSide = toSide ?? (sy >= ty ? 'bottom' : 'top')
  const s = outwardPoint(sx, sy, fs)
  const t = outwardPoint(tx, ty, ts)

  // Top↔top: stub up, horizontal bus above both, stub down into target.
  if (fs === 'top' && ts === 'top') {
    if (Math.abs(sx - tx) < 1) return `M ${sx} ${sy} V ${ty}`
    const busY = Math.min(s.y, t.y)
    return `M ${sx} ${sy} V ${busY} H ${tx} V ${ty}`
  }

  // Bottom↔bottom: stub down, horizontal bus below both, stub up into target.
  if (fs === 'bottom' && ts === 'bottom') {
    if (Math.abs(sx - tx) < 1) return `M ${sx} ${sy} V ${ty}`
    const busY = Math.max(s.y, t.y)
    return `M ${sx} ${sy} V ${busY} H ${tx} V ${ty}`
  }

  // Left↔left: stub left, vertical bus west of both, stub right into target.
  if (fs === 'left' && ts === 'left') {
    if (Math.abs(sy - ty) < 1) return `M ${sx} ${sy} H ${tx}`
    const busX = Math.min(s.x, t.x)
    return `M ${sx} ${sy} H ${busX} V ${ty} H ${tx}`
  }

  // Right↔right: stub right, vertical bus east of both, stub left into target.
  if (fs === 'right' && ts === 'right') {
    if (Math.abs(sy - ty) < 1) return `M ${sx} ${sy} H ${tx}`
    const busX = Math.max(s.x, t.x)
    return `M ${sx} ${sy} H ${busX} V ${ty} H ${tx}`
  }

  const fromHoriz = fs === 'left' || fs === 'right'
  const toHoriz = ts === 'left' || ts === 'right'

  // Facing sides (e.g. right↔left): exit outward first, then vertical, then in.
  if (fromHoriz && toHoriz) {
    if (Math.abs(sy - ty) < 1) return `M ${sx} ${sy} H ${tx}`
    // Step to outward stub before any mid routing (never H across the card).
    return `M ${sx} ${sy} H ${s.x} V ${ty} H ${tx}`
  }

  // Side → top/bottom: horizontal out, then vertical to approach, then into port.
  if (fromHoriz) {
    return `M ${sx} ${sy} H ${s.x} V ${t.y} H ${tx} V ${ty}`
  }

  // Top/bottom → side: vertical out, then to approach X, then into port.
  if (toHoriz) {
    return `M ${sx} ${sy} V ${s.y} H ${t.x} V ${ty} H ${tx}`
  }

  // Opposite vertical (top↔bottom): exit out, side-jog, approach out, land.
  if (Math.abs(sx - tx) < 1) {
    const jogX = sx + STUB
    return `M ${sx} ${sy} V ${s.y} H ${jogX} V ${t.y} H ${tx} V ${ty}`
  }
  const midX = (sx + tx) / 2
  return `M ${sx} ${sy} V ${s.y} H ${midX} V ${t.y} H ${tx} V ${ty}`
}

export function phantomPath(
  a: AbsBox,
  b: AbsBox,
  sourceHandle?: string | null,
  targetHandle?: string | null,
): string {
  const s0 = phantomDockSide(a, b, sourceHandle)
  const s1 = phantomDockSide(b, a, targetHandle)
  const p0 = dockPointForSide(a, s0)
  const p1 = dockPointForSide(b, s1)
  return orthogonalPhantom(p0.x, p0.y, p1.x, p1.y, s0, s1)
}

/** Drop person↔person phantoms where both ends are in `memberIds`. */
export function stripMemberPairPhantoms(
  doc: FamDocument,
  memberIds: string[],
): FamDocument {
  const set = new Set(memberIds)
  if (set.size < 2) return doc
  return {
    ...doc,
    phantoms: (doc.phantoms ?? []).filter((p) => {
      if (p.sourceKind !== 'person' || p.targetKind !== 'person') return true
      return !(set.has(p.source) && set.has(p.target))
    }),
  }
}

/**
 * Remove person↔person phantoms that connect two members of the same cluster.
 * External phantoms (cluster↔person / cluster↔cluster) are kept.
 */
export function stripIntraClusterMemberPhantoms(doc: FamDocument): FamDocument {
  let next = doc
  for (const c of doc.clusters ?? []) {
    next = stripMemberPairPhantoms(next, c.memberIds)
  }
  return next
}

export function newClusterId(): string {
  return `cluster-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function newPhantomId(): string {
  return `phantom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function makePhantomEdge(
  source: string,
  target: string,
  sourceKind: 'person' | 'cluster',
  targetKind: 'person' | 'cluster',
  sourceHandle?: string | null,
  targetHandle?: string | null,
): FamPhantomEdge {
  return {
    id: newPhantomId(),
    source,
    target,
    sourceKind,
    targetKind,
    sourceHandle: sourceHandle ?? undefined,
    targetHandle: targetHandle ?? undefined,
  }
}

/** Hit-test: is flow point inside a cluster node? */
export function hitClusterAt(
  clusters: Node[],
  flowX: number,
  flowY: number,
): Node | null {
  for (let i = clusters.length - 1; i >= 0; i--) {
    const c = clusters[i]
    if (c.type !== 'cluster') continue
    const data = c.data as ClusterFlowLike
    const size = clusterSize(
      data.memberIds.length,
      data.collapsed,
      data.compact,
    )
    const w = size.w
    const h = size.h
    if (
      flowX >= c.position.x &&
      flowX <= c.position.x + w &&
      flowY >= c.position.y &&
      flowY <= c.position.y + h
    ) {
      return c
    }
  }
  return null
}
