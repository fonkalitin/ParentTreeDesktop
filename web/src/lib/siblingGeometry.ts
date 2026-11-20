// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import type { Node } from '@xyflow/react'
import type { PersonFlowData } from '../layout/layoutTree'
import { portSiblingX, portTopY } from './marriageGeometry'

const STUB = 24

export type SiblingJunction = {
  key: string
  /** All people in this sibling connected component (sorted by id). */
  memberIds: string[]
  midX: number
  midY: number
  /** SVG path for the shared sibling bracket / bus. */
  d: string
}

type EdgeRef = { source: string; target: string }

/** Parent ids for a person (parent edges: source=parent, target=child). */
function parentIdsOf(personId: string, parentEdges: EdgeRef[]): string[] {
  const out: string[] = []
  for (const e of parentEdges) {
    if (e.target === personId) out.push(e.source)
  }
  return out
}

/** True when A and B share ≥1 parent via parent edges (siblinghood implied by T/fork). */
export function shareCommonParent(
  a: string,
  b: string,
  parentEdges: EdgeRef[],
): boolean {
  const pa = parentIdsOf(a, parentEdges)
  if (!pa.length) return false
  const setB = new Set(parentIdsOf(b, parentEdges))
  return pa.some((p) => setB.has(p))
}

/**
 * Sibling edges that still need a bracket/●.
 * Keeps the data-model edge; only drops pairs already implied by shared parents.
 */
export function siblingEdgesNeedingVisual(
  siblingEdges: EdgeRef[],
  parentEdges: EdgeRef[],
): EdgeRef[] {
  return siblingEdges.filter(
    (e) => e.source !== e.target && !shareCommonParent(e.source, e.target, parentEdges),
  )
}

/** Connected components over undirected sibling edges (only nodes present on canvas). */
export function siblingGroups(
  nodes: Node<PersonFlowData>[],
  siblingEdges: EdgeRef[],
): string[][] {
  const onCanvas = new Set(nodes.map((n) => n.id))
  const adj = new Map<string, Set<string>>()
  const ensure = (id: string) => {
    if (!adj.has(id)) adj.set(id, new Set())
  }

  for (const e of siblingEdges) {
    if (!onCanvas.has(e.source) || !onCanvas.has(e.target)) continue
    if (e.source === e.target) continue
    ensure(e.source)
    ensure(e.target)
    adj.get(e.source)!.add(e.target)
    adj.get(e.target)!.add(e.source)
  }

  const seen = new Set<string>()
  const groups: string[][] = []
  for (const id of adj.keys()) {
    if (seen.has(id)) continue
    const stack = [id]
    const group: string[] = []
    seen.add(id)
    while (stack.length) {
      const cur = stack.pop()!
      group.push(cur)
      for (const n of adj.get(cur) ?? []) {
        if (seen.has(n)) continue
        seen.add(n)
        stack.push(n)
      }
    }
    if (group.length >= 2) {
      group.sort()
      groups.push(group)
    }
  }
  return groups
}

/** Orthogonal sibling bracket docking to teal sibling ports (left of top-center). */
export function siblingJunction(
  members: Node<PersonFlowData>[],
): SiblingJunction | null {
  if (members.length < 2) return null
  const sorted = [...members].sort((a, b) => a.position.x - b.position.x)
  // Must land on green sibling ports — NOT the blue parent/child top-center
  const tops = sorted.map((n) => ({ id: n.id, x: portSiblingX(n), y: portTopY(n) }))
  const busY = Math.min(...tops.map((t) => t.y)) - STUB
  const leftX = Math.min(...tops.map((t) => t.x))
  const rightX = Math.max(...tops.map((t) => t.x))
  const midX = (leftX + rightX) / 2
  const midY = busY

  const parts: string[] = []
  for (const t of tops) {
    parts.push(`M ${t.x} ${t.y} V ${busY}`)
  }
  if (rightX - leftX > 1) {
    parts.push(`M ${leftX} ${busY} H ${rightX}`)
  }

  const memberIds = [...members.map((m) => m.id)].sort()
  return {
    key: memberIds.join('|'),
    memberIds,
    midX,
    midY,
    d: parts.join(' '),
  }
}

/**
 * Sibling-group junctions for canvas drawing / hit-test.
 * When `parentEdges` is provided, pairs that already share a parent are omitted
 * (parent T/fork already shows siblinghood — no stacked sibling bracket).
 */
export function collectSiblingJunctions(
  nodes: Node<PersonFlowData>[],
  siblingEdges: EdgeRef[],
  parentEdges?: EdgeRef[],
): SiblingJunction[] {
  const visualEdges = parentEdges
    ? siblingEdgesNeedingVisual(siblingEdges, parentEdges)
    : siblingEdges
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const out: SiblingJunction[] = []
  for (const ids of siblingGroups(nodes, visualEdges)) {
    const members = ids.map((id) => byId.get(id)).filter(Boolean) as Node<PersonFlowData>[]
    const j = siblingJunction(members)
    if (j) out.push(j)
  }
  return out
}

/** Hit-test sibling ● in flow coordinates (radius in flow units). */
export function hitSiblingJunction(
  junctions: SiblingJunction[],
  flowX: number,
  flowY: number,
  radius = 28,
): SiblingJunction | null {
  let best: SiblingJunction | null = null
  let bestDist = radius
  for (const j of junctions) {
    const dx = flowX - j.midX
    const dy = flowY - j.midY
    const dist = Math.hypot(dx, dy)
    if (dist <= bestDist) {
      bestDist = dist
      best = j
    }
  }
  return best
}

/** Sibling group containing personId, or [personId] if alone. */
export function siblingGroupOf(
  nodes: Node<PersonFlowData>[],
  siblingEdges: { source: string; target: string }[],
  personId: string,
): string[] {
  for (const g of siblingGroups(nodes, siblingEdges)) {
    if (g.includes(personId)) return g
  }
  return [personId]
}
