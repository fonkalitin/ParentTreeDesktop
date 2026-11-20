// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import type { Node } from '@xyflow/react'
import { NODE_HEIGHT, NODE_WIDTH, type PersonFlowData } from '../layout/layoutTree'

const STUB = 24

export type MarriageJunction = {
  key: string
  parentA: string
  parentB: string
  midX: number
  midY: number
  /** SVG path for the spouse bar (port → port). */
  d: string
}

function size(n: Node<PersonFlowData>) {
  return {
    w: n.measured?.width ?? NODE_WIDTH,
    h: n.measured?.height ?? NODE_HEIGHT,
  }
}

/** Must match PersonNode sibling handle `left: calc(50% - SIBLING_PORT_DX)`. */
export const SIBLING_PORT_DX = 14

/** Horizontal center of card (matches top/bottom ports). */
export function portCx(n: Node<PersonFlowData>) {
  return n.position.x + size(n).w / 2
}

/** Teal orphan sibling port — left of top-center (not the blue child port). */
export function portSiblingX(n: Node<PersonFlowData>) {
  return portCx(n) - SIBLING_PORT_DX
}

/** Vertical center of card (matches left/right spouse ports). */
export function portMidY(n: Node<PersonFlowData>) {
  return n.position.y + size(n).h / 2
}

export function portTopY(n: Node<PersonFlowData>) {
  return n.position.y
}

export function portBottomY(n: Node<PersonFlowData>) {
  return n.position.y + size(n).h
}

/** Right-edge spouse port of the left-er card / left-edge of the right-er card. */
export function marriageJunction(
  a: Node<PersonFlowData>,
  b: Node<PersonFlowData>,
): MarriageJunction {
  const left = a.position.x <= b.position.x ? a : b
  const right = left === a ? b : a
  const ls = size(left)
  const rs = size(right)

  // Exact side-port centers (same as RF Handle Left/Right)
  const x1 = left.position.x + ls.w
  const y1 = left.position.y + ls.h / 2
  const x2 = right.position.x
  const y2 = right.position.y + rs.h / 2

  let d: string
  let midX: number
  let midY: number

  if (x2 > x1 + 2) {
    if (Math.abs(y1 - y2) < 1.5) {
      d = `M ${x1} ${y1} H ${x2}`
      midX = (x1 + x2) / 2
      midY = y1
    } else {
      midX = (x1 + x2) / 2
      d = `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`
      midY = Math.max(y1, y2)
    }
  } else {
    const under = Math.max(portBottomY(left), portBottomY(right)) + STUB
    d = `M ${x1} ${y1} V ${under} H ${x2} V ${y2}`
    midX = (portCx(left) + portCx(right)) / 2
    midY = under
  }

  const ids = [a.id, b.id].sort()
  return {
    key: ids.join('|'),
    parentA: ids[0],
    parentB: ids[1],
    midX,
    midY,
    d,
  }
}

/** All spouse-bar junctions currently on the canvas. */
export function collectMarriageJunctions(
  nodes: Node<PersonFlowData>[],
  spouseEdges: { source: string; target: string }[],
): MarriageJunction[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const out: MarriageJunction[] = []
  const seen = new Set<string>()
  for (const e of spouseEdges) {
    const a = byId.get(e.source)
    const b = byId.get(e.target)
    if (!a || !b) continue
    const j = marriageJunction(a, b)
    if (seen.has(j.key)) continue
    seen.add(j.key)
    out.push(j)
  }
  return out
}

/** Hit-test marriage ● in flow coordinates (radius in flow units). */
export function hitMarriageJunction(
  junctions: MarriageJunction[],
  flowX: number,
  flowY: number,
  radius = 28,
): MarriageJunction | null {
  let best: MarriageJunction | null = null
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
