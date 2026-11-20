// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import { ViewportPortal, type Node } from '@xyflow/react'
import type { CanvasFlowData, FamilyUnit, PersonFlowData } from '../layout/layoutTree'
import type { FamDocument, FamEdge } from '../types/fam'
import {
  clusterOfPerson,
  PERSON_H,
  PERSON_W,
  phantomDockPoint,
  phantomPath,
  resolveAbsBoxes,
  type AbsBox,
} from '../lib/clusterGeometry'
import { useTreeStore } from '../store/treeStore'
import {
  marriageJunction,
  type MarriageJunction,
} from '../lib/marriageGeometry'
import {
  collectSiblingJunctions,
  type SiblingJunction,
} from '../lib/siblingGeometry'

type Props = {
  doc: FamDocument | null
  families: FamilyUnit[]
  nodes: Node<CanvasFlowData>[]
}

type KinPath = {
  d: string
  kind: 'spouse' | 'parent' | 'sibling' | 'phantom'
  /** Primary FamEdge / phantom id for click-select. */
  edgeId?: string
  /** All FamEdge ids represented by this visual (highlight membership). */
  edgeIds?: string[]
  phantomId?: string
  label?: string
  midX?: number
  midY?: number
}

const STUB = 24
const LOOP_PAD = 28
/** Keep caption clear of the dashed stroke (SVG baseline hangs below y). */
const PHANTOM_LABEL_ABOVE = 12

/**
 * Midpoint along an orthogonal SVG path (M/H/V/L). Recomputed from live `d`
 * each render so labels stay glued when cards move.
 */
function orthogonalPathMidpoint(d: string): { x: number; y: number } | null {
  const tokens = d.match(/[MHVLmhvl]|-?\d*\.?\d+(?:e[-+]?\d+)?/g)
  if (!tokens?.length) return null

  let i = 0
  let x = 0
  let y = 0
  const pts: { x: number; y: number }[] = []

  while (i < tokens.length) {
    const raw = tokens[i++]
    const cmd = raw.toUpperCase()
    if (cmd === 'M' || cmd === 'L') {
      if (i + 1 >= tokens.length) break
      x = Number(tokens[i++])
      y = Number(tokens[i++])
      if (!Number.isFinite(x) || !Number.isFinite(y)) break
      pts.push({ x, y })
    } else if (cmd === 'H') {
      if (i >= tokens.length) break
      x = Number(tokens[i++])
      if (!Number.isFinite(x)) break
      pts.push({ x, y })
    } else if (cmd === 'V') {
      if (i >= tokens.length) break
      y = Number(tokens[i++])
      if (!Number.isFinite(y)) break
      pts.push({ x, y })
    } else if (/^-?\d/.test(raw)) {
      break
    }
  }

  if (!pts.length) return null
  if (pts.length === 1) return pts[0]

  let total = 0
  const segs: number[] = []
  for (let j = 1; j < pts.length; j++) {
    const len = Math.hypot(pts[j].x - pts[j - 1].x, pts[j].y - pts[j - 1].y)
    segs.push(len)
    total += len
  }
  if (total < 1e-6) return pts[0]

  let remain = total / 2
  for (let j = 0; j < segs.length; j++) {
    const len = segs[j]
    if (remain <= len || j === segs.length - 1) {
      const t = len < 1e-6 ? 0 : Math.min(1, remain / len)
      const a = pts[j]
      const b = pts[j + 1]
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      }
    }
    remain -= len
  }
  return pts[pts.length - 1]
}

function orthogonalBottomToTop(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
): string {
  const exitY = sy + STUB
  if (ty >= exitY + 8) {
    const mid = (exitY + ty) / 2
    if (Math.abs(sx - tx) < 1) return `M ${sx} ${sy} V ${ty}`
    return `M ${sx} ${sy} V ${mid} H ${tx} V ${ty}`
  }
  const approachY = ty - LOOP_PAD
  const midX = (sx + tx) / 2
  return `M ${sx} ${sy} V ${exitY} H ${midX} V ${approachY} H ${tx} V ${ty}`
}

function strokeFor(kind: KinPath['kind']): string {
  if (kind === 'spouse') return 'var(--pt-line-spouse)'
  if (kind === 'sibling') return 'var(--pt-line-sibling)'
  if (kind === 'phantom') return 'var(--pt-line-phantom)'
  return 'var(--pt-line-parent)'
}

function classFor(kind: KinPath['kind']): string {
  if (kind === 'spouse') return 'pt-spouse-bar'
  if (kind === 'sibling') return 'pt-sibling-line'
  if (kind === 'phantom') return 'pt-phantom-line'
  return 'pt-parent-line'
}

function sameClusterPair(doc: FamDocument, a: string, b: string): boolean {
  const ca = clusterOfPerson(doc, a)
  const cb = clusterOfPerson(doc, b)
  return Boolean(ca && cb && ca.id === cb.id)
}

function findSpouseEdge(
  edges: FamEdge[],
  a: string,
  b: string,
): FamEdge | undefined {
  return edges.find(
    (e) =>
      e.type === 'spouse' &&
      ((e.source === a && e.target === b) || (e.source === b && e.target === a)),
  )
}

function personNodesForKinship(
  doc: FamDocument,
  nodes: Node<CanvasFlowData>[],
  boxes: Map<string, AbsBox>,
): Node<PersonFlowData>[] {
  const free = new Map(
    nodes.filter((n) => n.type !== 'cluster').map((n) => [n.id, n as Node<PersonFlowData>]),
  )
  const out: Node<PersonFlowData>[] = []
  for (const [id, box] of boxes) {
    if (box.kind !== 'person') continue
    const fam = doc.nodes.find((n) => n.id === id)
    if (!fam) continue
    const prev = free.get(id)
    out.push({
      id,
      type: 'person',
      position: { x: box.x, y: box.y },
      measured: { width: box.w, height: box.h },
      data: prev?.data ?? {
        label: fam.data.label,
        gender: fam.data.gender,
        birth: fam.data.birth,
        death: fam.data.death,
      },
    })
  }
  return out
}

function parentLinks(
  junctionX: number,
  junctionY: number,
  children: Node<PersonFlowData>[],
  edgeIdsByChild: Map<string, string[]>,
): KinPath[] {
  const kids = [...children].sort((a, b) => a.position.x - b.position.x)
  if (!kids.length) return []

  const childTop = Math.min(...kids.map((k) => k.position.y))
  const allBelow = kids.every((k) => k.position.y > junctionY + STUB + 8)

  if (allBelow && childTop - junctionY >= 28) {
    const busY = junctionY + (childTop - junctionY) * 0.5
    const xs = kids.map((k) => k.position.x + (k.measured?.width ?? 132) / 2)
    const busLeft = Math.min(junctionX, ...xs)
    const busRight = Math.max(junctionX, ...xs)
    const out: KinPath[] = []
    out.push({ kind: 'parent', d: `M ${junctionX} ${junctionY} V ${busY}` })
    if (busRight - busLeft > 1) {
      out.push({ kind: 'parent', d: `M ${busLeft} ${busY} H ${busRight}` })
    }
    for (const k of kids) {
      const cx = k.position.x + (k.measured?.width ?? 132) / 2
      const edgeIds = edgeIdsByChild.get(k.id) ?? []
      out.push({
        kind: 'parent',
        d: `M ${cx} ${busY} V ${k.position.y}`,
        edgeId: edgeIds[0],
        edgeIds: edgeIds.length ? edgeIds : undefined,
      })
    }
    return out
  }

  return kids.map((k) => {
    const cx = k.position.x + (k.measured?.width ?? 132) / 2
    const edgeIds = edgeIdsByChild.get(k.id) ?? []
    return {
      kind: 'parent' as const,
      d: orthogonalBottomToTop(junctionX, junctionY, cx, k.position.y),
      edgeId: edgeIds[0],
      edgeIds: edgeIds.length ? edgeIds : undefined,
    }
  })
}

function pathIsSelected(
  p: KinPath,
  selectedEdgeId: string | undefined,
  selectedPhantomId: string | undefined,
): boolean {
  if (p.kind === 'phantom') {
    return Boolean(p.phantomId && p.phantomId === selectedPhantomId)
  }
  if (!selectedEdgeId) return false
  if (p.edgeId === selectedEdgeId) return true
  return Boolean(p.edgeIds?.includes(selectedEdgeId))
}

export function FamilyBands({ doc, families, nodes }: Props) {
  const phantomsVisible = useTreeStore((s) => s.phantomsVisible)
  const phantomsShowLabels = useTreeStore((s) => s.phantomsShowLabels)
  const selectedPhantomId = useTreeStore((s) => s.selectedPhantomId)
  const selectedEdgeId = useTreeStore((s) => s.selectedEdgeId)
  const selectPhantom = useTreeStore((s) => s.selectPhantom)
  const selectEdge = useTreeStore((s) => s.selectEdge)
  if (!doc) return null

  const boxes = resolveAbsBoxes(doc, nodes)
  const personNodes = personNodesForKinship(doc, nodes, boxes)
  const byId = new Map(personNodes.map((n) => [n.id, n]))

  const paths: KinPath[] = []
  const junctions: (MarriageJunction & { edgeId?: string })[] = []
  const siblingJunctions: (SiblingJunction & { edgeId?: string; edgeIds?: string[] })[] =
    []
  const drawnSpouse = new Set<string>()

  for (const e of doc.edges) {
    if (e.type === 'spouse') {
      if (sameClusterPair(doc, e.source, e.target)) continue
      const a = byId.get(e.source)
      const b = byId.get(e.target)
      if (!a || !b) continue
      const bar = marriageJunction(a, b)
      if (drawnSpouse.has(bar.key)) continue
      drawnSpouse.add(bar.key)
      paths.push({
        kind: 'spouse',
        d: bar.d,
        edgeId: e.id,
        edgeIds: [e.id],
      })
      junctions.push({ ...bar, edgeId: e.id })
    }
  }

  const siblingFamEdges = doc.edges.filter(
    (e) => e.type === 'sibling' && !sameClusterPair(doc, e.source, e.target),
  )
  const parentFamEdges = doc.edges.filter(
    (e) => e.type === 'parent' && !sameClusterPair(doc, e.source, e.target),
  )

  for (const sj of collectSiblingJunctions(
    personNodes,
    siblingFamEdges,
    parentFamEdges,
  )) {
    const groupEdgeIds = siblingFamEdges
      .filter(
        (e) =>
          sj.memberIds.includes(e.source) && sj.memberIds.includes(e.target),
      )
      .map((e) => e.id)
    siblingJunctions.push({
      ...sj,
      edgeId: groupEdgeIds[0],
      edgeIds: groupEdgeIds,
    })
    paths.push({
      kind: 'sibling',
      d: sj.d,
      edgeId: groupEdgeIds[0],
      edgeIds: groupEdgeIds.length ? groupEdgeIds : undefined,
    })
  }

  for (const fam of families) {
    const parents = fam.parents
      .map((id) => byId.get(id))
      .filter(Boolean) as Node<PersonFlowData>[]
    const children = fam.children
      .map((id) => byId.get(id))
      .filter((c): c is Node<PersonFlowData> => Boolean(c))
      .filter((c) => !parents.every((p) => sameClusterPair(doc, p.id, c.id)))
    if (!parents.length || !children.length) continue

    let junctionX: number
    let junctionY: number

    if (parents.length >= 2) {
      const bar = marriageJunction(parents[0], parents[1])
      const spouse = findSpouseEdge(doc.edges, parents[0].id, parents[1].id)
      if (!drawnSpouse.has(bar.key)) {
        drawnSpouse.add(bar.key)
        if (!sameClusterPair(doc, parents[0].id, parents[1].id)) {
          paths.push({
            kind: 'spouse',
            d: bar.d,
            edgeId: spouse?.id,
            edgeIds: spouse ? [spouse.id] : undefined,
          })
          junctions.push({ ...bar, edgeId: spouse?.id })
        }
      }
      junctionX = bar.midX
      junctionY = bar.midY
    } else {
      junctionX = parents[0].position.x + (parents[0].measured?.width ?? PERSON_W) / 2
      junctionY =
        parents[0].position.y + (parents[0].measured?.height ?? PERSON_H)
    }

    const edgeIdsByChild = new Map<string, string[]>()
    for (const child of children) {
      const ids = doc.edges
        .filter(
          (e) =>
            e.type === 'parent' &&
            e.target === child.id &&
            fam.parents.includes(e.source),
        )
        .map((e) => e.id)
      if (ids.length) edgeIdsByChild.set(child.id, ids)
    }

    paths.push(...parentLinks(junctionX, junctionY, children, edgeIdsByChild))
  }

  if (phantomsVisible) {
    for (const p of doc.phantoms ?? []) {
      if (
        p.sourceKind === 'person' &&
        p.targetKind === 'person' &&
        sameClusterPair(doc, p.source, p.target)
      ) {
        continue
      }
      const a = boxes.get(p.source)
      const b = boxes.get(p.target)
      if (!a || !b) continue
      const d = phantomPath(a, b, p.sourceHandle, p.targetHandle)
      const mid =
        orthogonalPathMidpoint(d) ??
        (() => {
          const from = phantomDockPoint(a, b, p.sourceHandle)
          const to = phantomDockPoint(b, a, p.targetHandle)
          return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
        })()
      paths.push({
        kind: 'phantom',
        phantomId: p.id,
        label: p.label?.trim() || undefined,
        midX: mid.x,
        midY: mid.y,
        d,
      })
    }
  }

  if (!paths.length && !junctions.length && !siblingJunctions.length) return null

  const onSelectKin = (p: KinPath) => {
    if (p.kind === 'phantom' && p.phantomId) {
      selectPhantom(p.phantomId)
      return
    }
    if (p.edgeId) selectEdge(p.edgeId)
  }

  return (
    <ViewportPortal>
      <svg
        className="pointer-events-none family-bands-svg"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1,
          height: 1,
          overflow: 'visible',
        }}
      >
        {paths.map((p, i) => {
          const selected = pathIsSelected(p, selectedEdgeId, selectedPhantomId)
          const clickable =
            (p.kind === 'phantom' && Boolean(p.phantomId)) || Boolean(p.edgeId)
          return (
            <g
              key={
                p.phantomId
                  ? `ph-${p.phantomId}`
                  : p.edgeId
                    ? `e-${p.edgeId}-${i}`
                    : `p-${i}`
              }
            >
              {clickable ? (
                <path
                  d={p.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  strokeLinecap="round"
                  style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectKin(p)
                  }}
                />
              ) : null}
              <path
                className={[
                  classFor(p.kind),
                  selected
                    ? p.kind === 'phantom'
                      ? 'pt-phantom-line--selected'
                      : 'pt-kin-line--selected'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                d={p.d}
                fill="none"
                stroke={strokeFor(p.kind)}
                strokeWidth={
                  selected
                    ? 2.25
                    : p.kind === 'sibling' || p.kind === 'phantom'
                      ? 1.25
                      : p.kind === 'spouse'
                        ? 2
                        : 1.75
                }
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={
                  p.kind === 'sibling' || p.kind === 'phantom' ? '5 4' : undefined
                }
                opacity={
                  p.kind === 'sibling' || p.kind === 'phantom'
                    ? selected
                      ? 0.95
                      : 0.55
                    : 1
                }
                style={
                  clickable
                    ? { pointerEvents: 'stroke', cursor: 'pointer' }
                    : undefined
                }
                onClick={
                  clickable
                    ? (e) => {
                        e.stopPropagation()
                        onSelectKin(p)
                      }
                    : undefined
                }
              />
              {p.kind === 'phantom' &&
              phantomsShowLabels &&
              p.label &&
              p.midX != null &&
              p.midY != null ? (
                <text
                  x={p.midX}
                  y={p.midY - PHANTOM_LABEL_ABOVE}
                  textAnchor="middle"
                  className="pt-phantom-label"
                  style={{ pointerEvents: 'none' }}
                >
                  {p.label.length > 42 ? `${p.label.slice(0, 40)}…` : p.label}
                </text>
              ) : null}
            </g>
          )
        })}
        {junctions.map((j) => (
          <g key={`j-${j.key}`} className="pt-marriage-junction">
            <circle
              cx={j.midX}
              cy={j.midY}
              r={10}
              fill="transparent"
              className="pt-marriage-hit"
              style={
                j.edgeId
                  ? { pointerEvents: 'all', cursor: 'pointer' }
                  : undefined
              }
              onClick={
                j.edgeId
                  ? (e) => {
                      e.stopPropagation()
                      selectEdge(j.edgeId)
                    }
                  : undefined
              }
            />
            <circle
              cx={j.midX}
              cy={j.midY}
              r={4.5}
              fill="var(--pt-line-spouse)"
              stroke="var(--pt-bg)"
              strokeWidth={1.5}
              className={
                j.edgeId && j.edgeId === selectedEdgeId
                  ? 'pt-kin-junction--selected'
                  : undefined
              }
              style={
                j.edgeId
                  ? { pointerEvents: 'all', cursor: 'pointer' }
                  : undefined
              }
              onClick={
                j.edgeId
                  ? (e) => {
                      e.stopPropagation()
                      selectEdge(j.edgeId)
                    }
                  : undefined
              }
            />
          </g>
        ))}
        {siblingJunctions.map((j) => {
          const selected = Boolean(
            selectedEdgeId &&
              (j.edgeId === selectedEdgeId || j.edgeIds?.includes(selectedEdgeId)),
          )
          return (
            <g
              key={`sj-${j.key}`}
              className="pt-sibling-junction"
              opacity={selected ? 0.95 : 0.65}
            >
              <circle
                cx={j.midX}
                cy={j.midY}
                r={10}
                fill="transparent"
                className="pt-sibling-hit"
                style={
                  j.edgeId
                    ? { pointerEvents: 'all', cursor: 'pointer' }
                    : undefined
                }
                onClick={
                  j.edgeId
                    ? (e) => {
                        e.stopPropagation()
                        selectEdge(j.edgeId)
                      }
                    : undefined
                }
              />
              <circle
                cx={j.midX}
                cy={j.midY}
                r={4}
                fill="var(--pt-line-sibling)"
                stroke="var(--pt-bg)"
                strokeWidth={1.25}
                strokeDasharray="2 2"
                className={selected ? 'pt-kin-junction--selected' : undefined}
                style={
                  j.edgeId
                    ? { pointerEvents: 'all', cursor: 'pointer' }
                    : undefined
                }
                onClick={
                  j.edgeId
                    ? (e) => {
                        e.stopPropagation()
                        selectEdge(j.edgeId)
                      }
                    : undefined
                }
              />
            </g>
          )
        })}
      </svg>
    </ViewportPortal>
  )
}
