// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import { Position, type Edge, type Node } from '@xyflow/react'
import type { Attachment, FamCluster, FamClusterKind, FamDocument, MediaRef } from '../types/fam'
import {
  clusterKindLabel,
  clusterOfPerson,
  clusterSize,
  nestedPersonIds,
} from '../lib/clusterGeometry'

/**
 * Wide branching drop-line layout (GenoPro / Famiry / Mr. Genealogy):
 * - one kinship generation = one horizontal row
 * - couples are atomic (♂ left / ♀ right)
 * - siblings birth-order L→R under parents
 * - large FAMILY_GAP so branches never collide
 * - iterative barycenter + hard de-overlap (no stacked cards)
 */

export const NODE_WIDTH = 132
/** Keep in sync with clusterGeometry.PERSON_H (avoid import cycle). */
export const NODE_HEIGHT = 170
/** Space between sibling units inside one nuclear family. */
export const H_GAP = 72
/** Clear air between different family branches — must prevent overlap. */
export const FAMILY_GAP = 160
/** Extra corridor between rows so buses never clip card faces. */
const ROW_STEP = NODE_HEIGHT + 160
export const SPOUSE_GAP = 36
export const SPOUSE_BAR_MAX = SPOUSE_GAP + 12
export const SPOUSE_BAR_OFFSET_Y = Math.round(NODE_HEIGHT * 0.5)
export const CHILD_CLUSTER_GAP_MAX = H_GAP + SPOUSE_GAP + 24

export type KinshipRole = 'root' | 'blood' | 'inlaw'

export type PersonFlowData = {
  label: string
  gender: 'M' | 'F'
  birth?: string
  death?: string
  maidenName?: string
  birthPlace?: string
  deathPlace?: string
  notes?: string
  photoRef?: MediaRef | null
  attachments?: Attachment[]
  searchHit?: boolean
  generation?: number
  kinshipRole?: KinshipRole
  hasSpouse?: boolean
  /**
   * No parent edges yet — top ports are green «братство» for orphan sibling links.
   * Cleared once a parent is attached (sibling dashed lines also hide when parents shared).
   */
  isOrphan?: boolean
}

export type ClusterMemberPreview = PersonFlowData & { id: string }

export type ClusterFlowData = {
  label: string
  kind: FamClusterKind
  memberIds: string[]
  collapsed: boolean
  compact: boolean
  locked: boolean
  members: ClusterMemberPreview[]
}

export type CanvasFlowData = PersonFlowData | ClusterFlowData

export type FamilyUnit = {
  id: string
  parents: string[]
  children: string[]
}

export type LayoutResult = {
  nodes: Node<CanvasFlowData>[]
  edges: Edge[]
  families: FamilyUnit[]
}

export function isClusterNode(
  n: Node<CanvasFlowData>,
): n is Node<ClusterFlowData, 'cluster'> {
  return n.type === 'cluster'
}

type Pos = { x: number; y: number }

type Unit =
  | { kind: 'couple'; left: string; right: string }
  | { kind: 'single'; id: string }

function parentsOf(doc: FamDocument, id: string): string[] {
  return doc.edges
    .filter((e) => e.type === 'parent' && e.target === id)
    .map((e) => e.source)
}

function spousesOf(doc: FamDocument, id: string): string[] {
  return doc.edges
    .filter((e) => e.type === 'spouse' && (e.source === id || e.target === id))
    .map((e) => (e.source === id ? e.target : e.source))
}

function birthYear(doc: FamDocument, id: string): number {
  const raw = doc.nodes.find((n) => n.id === id)?.data.birth ?? ''
  const m = String(raw).match(/(18|19|20)\d{2}/)
  const y = m ? Number.parseInt(m[0], 10) : Number.parseInt(String(raw), 10)
  return Number.isFinite(y) ? y : 9999
}

function genderOf(doc: FamDocument, id: string): 'M' | 'F' {
  return doc.nodes.find((n) => n.id === id)?.data.gender ?? 'M'
}

export function buildFamilies(doc: FamDocument): FamilyUnit[] {
  const byParents = new Map<string, { parents: string[]; children: Set<string> }>()
  for (const node of doc.nodes) {
    const parents = parentsOf(doc, node.id).sort()
    if (!parents.length) continue
    const key = parents.join('|')
    let bucket = byParents.get(key)
    if (!bucket) {
      bucket = { parents, children: new Set() }
      byParents.set(key, bucket)
    }
    bucket.children.add(node.id)
  }
  return [...byParents.values()].map((b, i) => ({
    id: `fam-${i}`,
    parents: b.parents,
    children: [...b.children].sort((a, b) => birthYear(doc, a) - birthYear(doc, b)),
  }))
}

export function assignGenerations(doc: FamDocument): Map<string, number> {
  const gen = new Map<string, number>()
  const ids = doc.nodes.map((n) => n.id)
  const roots = ids.filter((id) => parentsOf(doc, id).length === 0)
  for (const id of roots) gen.set(id, 0)

  for (let pass = 0; pass < ids.length + 4; pass++) {
    let changed = false
    for (const id of ids) {
      const ps = parentsOf(doc, id)
      if (!ps.length) continue
      const parentGens = ps.map((p) => gen.get(p)).filter((g): g is number => g != null)
      if (!parentGens.length) continue
      const next = Math.max(...parentGens) + 1
      const prev = gen.get(id)
      if (prev == null || next > prev) {
        gen.set(id, next)
        changed = true
      }
    }
    if (!changed) break
  }

  for (let pass = 0; pass < 6; pass++) {
    let changed = false
    for (const e of doc.edges) {
      if (e.type !== 'spouse') continue
      const ga = gen.get(e.source)
      const gb = gen.get(e.target)
      if (ga == null && gb == null) continue
      if (ga == null && gb != null) {
        gen.set(e.source, gb)
        changed = true
      } else if (gb == null && ga != null) {
        gen.set(e.target, ga)
        changed = true
      } else if (ga != null && gb != null && ga !== gb) {
        const g = Math.max(ga, gb)
        if (ga !== g) {
          gen.set(e.source, g)
          changed = true
        }
        if (gb !== g) {
          gen.set(e.target, g)
          changed = true
        }
      }
    }
    if (!changed) break
  }

  for (const id of ids) {
    if (!gen.has(id)) gen.set(id, 0)
  }
  return gen
}

function coupleOrder(doc: FamDocument, a: string, b: string): { left: string; right: string } {
  const ga = genderOf(doc, a)
  const gb = genderOf(doc, b)
  if (ga === 'M' && gb === 'F') return { left: a, right: b }
  if (ga === 'F' && gb === 'M') return { left: b, right: a }
  return birthYear(doc, a) <= birthYear(doc, b)
    ? { left: a, right: b }
    : { left: b, right: a }
}

function unitWidth(u: Unit): number {
  return u.kind === 'couple' ? NODE_WIDTH * 2 + SPOUSE_GAP : NODE_WIDTH
}

function unitIds(u: Unit): string[] {
  return u.kind === 'couple' ? [u.left, u.right] : [u.id]
}

function placeUnit(u: Unit, x: number, y: number, positions: Map<string, Pos>) {
  if (u.kind === 'single') {
    positions.set(u.id, { x, y })
    return
  }
  positions.set(u.left, { x, y })
  positions.set(u.right, { x: x + NODE_WIDTH + SPOUSE_GAP, y })
}

function unitMidX(u: Unit, positions: Map<string, Pos>): number {
  if (u.kind === 'single') {
    const p = positions.get(u.id)
    return p ? p.x + NODE_WIDTH / 2 : 0
  }
  const L = positions.get(u.left)
  const R = positions.get(u.right)
  if (!L || !R) return 0
  return (L.x + R.x + NODE_WIDTH) / 2
}

function shiftUnit(u: Unit, dx: number, positions: Map<string, Pos>) {
  for (const id of unitIds(u)) {
    const p = positions.get(id)
    if (p) p.x += dx
  }
}

/** Build non-overlapping couple/single units for a generation membership. */
function buildUnits(doc: FamDocument, members: string[]): Unit[] {
  const memberSet = new Set(members)
  const used = new Set<string>()
  const units: Unit[] = []
  const ordered = [...members].sort((a, b) => birthYear(doc, a) - birthYear(doc, b))

  for (const id of ordered) {
    if (used.has(id)) continue
    const spouse = spousesOf(doc, id).find((s) => memberSet.has(s) && !used.has(s))
    if (spouse) {
      const { left, right } = coupleOrder(doc, id, spouse)
      units.push({ kind: 'couple', left, right })
      used.add(left)
      used.add(right)
    } else {
      units.push({ kind: 'single', id })
      used.add(id)
    }
  }
  return units
}

function parentBarycenter(doc: FamDocument, u: Unit, positions: Map<string, Pos>): number {
  const mids: number[] = []
  for (const id of unitIds(u)) {
    const ps = parentsOf(doc, id)
      .map((p) => positions.get(p))
      .filter(Boolean) as Pos[]
    if (ps.length) {
      const left = Math.min(...ps.map((p) => p.x))
      const right = Math.max(...ps.map((p) => p.x + NODE_WIDTH))
      mids.push((left + right) / 2)
    } else {
      mids.push(birthYear(doc, id))
    }
  }
  return mids.reduce((a, b) => a + b, 0) / Math.max(1, mids.length)
}

function childBarycenter(doc: FamDocument, u: Unit, positions: Map<string, Pos>): number {
  const kids: number[] = []
  for (const id of unitIds(u)) {
    for (const e of doc.edges) {
      if (e.type !== 'parent' || e.source !== id) continue
      const p = positions.get(e.target)
      if (p) kids.push(p.x + NODE_WIDTH / 2)
    }
  }
  if (!kids.length) return unitMidX(u, positions)
  return kids.reduce((a, b) => a + b, 0) / kids.length
}

/**
 * Pack a generation left→right with hard min gaps.
 * Optional groupBreak: insert FAMILY_GAP when adjacent units belong to different parent sets.
 */
function packUnitsHard(
  units: Unit[],
  y: number,
  positions: Map<string, Pos>,
  doc: FamDocument,
  startX = 0,
) {
  let x = startX
  let prevKey = ''
  units.forEach((u, i) => {
    const key = unitIds(u)
      .flatMap((id) => parentsOf(doc, id))
      .sort()
      .join('|')
    if (i > 0) {
      x += key && key === prevKey ? H_GAP : FAMILY_GAP
    }
    prevKey = key
    placeUnit(u, x, y, positions)
    x += unitWidth(u)
  })
}

/** Enforce min separation after any centering shifts — never leave overlaps. */
function enforceMinSeparation(
  units: Unit[],
  positions: Map<string, Pos>,
  y: number,
  doc: FamDocument,
) {
  const ordered = [...units].sort((a, b) => unitMidX(a, positions) - unitMidX(b, positions))
  let cursor = 0
  let prevKey = ''
  ordered.forEach((u, i) => {
    const key = unitIds(u)
      .flatMap((id) => parentsOf(doc, id))
      .sort()
      .join('|')
    if (i > 0) {
      cursor += key && key === prevKey ? H_GAP : FAMILY_GAP
    }
    prevKey = key
    const curLeft =
      u.kind === 'single'
        ? positions.get(u.id)?.x ?? cursor
        : Math.min(
            positions.get(u.left)?.x ?? cursor,
            positions.get(u.right)?.x ?? cursor,
          )
    if (curLeft < cursor) {
      shiftUnit(u, cursor - curLeft, positions)
    }
    // snap Y
    for (const id of unitIds(u)) {
      const p = positions.get(id)
      if (p) p.y = y
    }
    const left =
      u.kind === 'single'
        ? positions.get(u.id)!.x
        : Math.min(positions.get(u.left)!.x, positions.get(u.right)!.x)
    cursor = left + unitWidth(u)
  })
}

/** Center a family's child units under the parents' midpoint. */
function centerChildrenUnderParents(
  doc: FamDocument,
  fam: FamilyUnit,
  positions: Map<string, Pos>,
  genOf: Map<string, number>,
) {
  const parentPos = fam.parents.map((id) => positions.get(id)).filter(Boolean) as Pos[]
  if (!parentPos.length || !fam.children.length) return

  const parentMid =
    (Math.min(...parentPos.map((p) => p.x)) +
      Math.max(...parentPos.map((p) => p.x + NODE_WIDTH))) /
    2

  const childGen = Math.min(...fam.children.map((c) => genOf.get(c) ?? 0))
  const y = childGen * ROW_STEP
  const memberSet = new Set(fam.children)
  // include spouses of children that sit on the same generation
  for (const id of [...fam.children]) {
    for (const s of spousesOf(doc, id)) {
      if ((genOf.get(s) ?? -1) === childGen) memberSet.add(s)
    }
  }

  const units = buildUnits(doc, [...memberSet])
  if (!units.length) return

  const span =
    units.reduce((s, u) => s + unitWidth(u), 0) + Math.max(0, units.length - 1) * H_GAP
  let x = parentMid - span / 2
  units.forEach((u, i) => {
    placeUnit(u, x, y, positions)
    x += unitWidth(u)
    if (i < units.length - 1) x += H_GAP
  })
}

/** Pull parent units toward the midpoint of their children (reduces crossings). */
function pullParentsToChildren(
  doc: FamDocument,
  units: Unit[],
  positions: Map<string, Pos>,
) {
  for (const u of units) {
    const target = childBarycenter(doc, u, positions)
    const mid = unitMidX(u, positions)
    const dx = target - mid
    if (Math.abs(dx) > 1) shiftUnit(u, dx * 0.85, positions)
  }
}

function kinshipRolesOf(doc: FamDocument): Map<string, KinshipRole> {
  const roles = new Map<string, KinshipRole>()
  const roots = doc.nodes.filter((n) => parentsOf(doc, n.id).length === 0).map((n) => n.id)
  const blood = new Set<string>(roots)
  let grew = true
  while (grew) {
    grew = false
    for (const e of doc.edges) {
      if (e.type !== 'parent') continue
      if (blood.has(e.source) && !blood.has(e.target)) {
        blood.add(e.target)
        grew = true
      }
    }
  }
  for (const n of doc.nodes) {
    if (roots.includes(n.id)) roles.set(n.id, 'root')
    else if (blood.has(n.id)) roles.set(n.id, 'blood')
    else roles.set(n.id, 'inlaw')
  }
  for (const e of doc.edges) {
    if (e.type !== 'spouse') continue
    for (const id of [e.source, e.target]) {
      if (!blood.has(id)) roles.set(id, 'inlaw')
    }
  }
  return roles
}

/**
 * Wide branching layout:
 * 1) pack each generation by parent barycenter
 * 2) center children under parents (top→down)
 * 3) pull parents toward children (bottom→up)
 * 4) hard de-overlap every generation — guaranteed no stacked cards
 */
function layoutBranching(
  doc: FamDocument,
  genOf: Map<string, number>,
  families: FamilyUnit[],
): Map<string, Pos> {
  const positions = new Map<string, Pos>()
  const byGen = new Map<number, string[]>()
  for (const n of doc.nodes) {
    const g = genOf.get(n.id) ?? 0
    const list = byGen.get(g) ?? []
    list.push(n.id)
    byGen.set(g, list)
  }
  const gens = [...byGen.keys()].sort((a, b) => a - b)

  const unitsByGen = new Map<number, Unit[]>()
  for (const g of gens) {
    unitsByGen.set(g, buildUnits(doc, byGen.get(g) ?? []))
  }

  // Pass 0: initial left→right pack (birth / parent order)
  for (const g of gens) {
    const y = g * ROW_STEP
    const units = [...(unitsByGen.get(g) ?? [])].sort(
      (a, b) => parentBarycenter(doc, a, positions) - parentBarycenter(doc, b, positions),
    )
    unitsByGen.set(g, units)
    packUnitsHard(units, y, positions, doc, 0)
  }

  // Several sweep iterations: center kids, pull parents, de-overlap
  for (let iter = 0; iter < 8; iter++) {
    // Top → down: park each sibling group under its parents
    const fams = [...families].sort((a, b) => {
      const ga = Math.min(...a.children.map((c) => genOf.get(c) ?? 0))
      const gb = Math.min(...b.children.map((c) => genOf.get(c) ?? 0))
      return ga - gb
    })
    for (const fam of fams) {
      centerChildrenUnderParents(doc, fam, positions, genOf)
    }

    // Bottom → up: slide parents toward children
    for (const g of [...gens].reverse()) {
      const y = g * ROW_STEP
      const units = unitsByGen.get(g) ?? []
      pullParentsToChildren(doc, units, positions)
      enforceMinSeparation(units, positions, y, doc)
    }

    // Top → down hard separation again (fixes collisions after parent pull)
    for (const g of gens) {
      const y = g * ROW_STEP
      const units = [...(unitsByGen.get(g) ?? [])].sort(
        (a, b) => unitMidX(a, positions) - unitMidX(b, positions),
      )
      unitsByGen.set(g, units)
      enforceMinSeparation(units, positions, y, doc)
    }
  }

  // Final pass: rebuild units from live membership and hard-pack each row
  for (const g of gens) {
    const y = g * ROW_STEP
    const members = byGen.get(g) ?? []
    const units = buildUnits(doc, members).sort(
      (a, b) => unitMidX(a, positions) - unitMidX(b, positions),
    )
    unitsByGen.set(g, units)
    enforceMinSeparation(units, positions, y, doc)
  }

  // Absolute collision fix: scan every pair on the same row
  for (const g of gens) {
    const y = g * ROW_STEP
    const row = (byGen.get(g) ?? [])
      .map((id) => ({ id, p: positions.get(id)! }))
      .filter((x) => x.p)
      .sort((a, b) => a.p.x - b.p.x)
    for (let i = 1; i < row.length; i++) {
      const prev = row[i - 1]
      const cur = row[i]
      const minX = prev.p.x + NODE_WIDTH + 24
      if (cur.p.x < minX) {
        const dx = minX - cur.p.x
        // shift this person and everyone to the right on this row
        for (let j = i; j < row.length; j++) {
          row[j].p.x += dx
        }
      }
      cur.p.y = y
      prev.p.y = y
    }
  }

  // Normalize so tree starts near (0,0)
  let minX = Infinity
  for (const p of positions.values()) minX = Math.min(minX, p.x)
  if (Number.isFinite(minX) && minX !== 0) {
    for (const p of positions.values()) p.x -= minX
  }

  return positions
}

function spouseIdSet(doc: FamDocument): Set<string> {
  const spouseIds = new Set<string>()
  for (const e of doc.edges) {
    if (e.type !== 'spouse') continue
    spouseIds.add(e.source)
    spouseIds.add(e.target)
  }
  return spouseIds
}

function hiddenEdge(e: { id: string; source: string; target: string; type: string }): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'straight',
    hidden: true,
    style: { stroke: 'transparent', strokeWidth: 0, opacity: 0 },
    interactionWidth: 0,
    data: { relation: e.type },
  }
}

/** Build a single canvas card from a catalog person (manual place). */
export function makeFlowPersonNode(
  n: FamDocument['nodes'][number],
  position: Pos,
  opts?: {
    generation?: number
    kinshipRole?: KinshipRole
    hasSpouse?: boolean
    searchHit?: boolean
    isOrphan?: boolean
  },
): Node<PersonFlowData> {
  const legacyPhoto = n.data.photo
  const photoRef = n.data.photoRef ?? (legacyPhoto ? { dataUrl: legacyPhoto } : null)
  return {
    id: n.id,
    type: 'person',
    position,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    data: {
      label: n.data.label,
      gender: n.data.gender,
      birth: n.data.birth,
      death: n.data.death,
      maidenName: n.data.maidenName,
      birthPlace: n.data.birthPlace,
      deathPlace: n.data.deathPlace,
      notes: n.data.notes,
      photoRef,
      attachments: n.data.attachments ?? [],
      generation: opts?.generation ?? 0,
      kinshipRole: opts?.kinshipRole ?? 'blood',
      hasSpouse: opts?.hasSpouse ?? false,
      searchHit: opts?.searchHit ?? false,
      isOrphan: opts?.isOrphan ?? false,
    },
    draggable: true,
  }
}

export function makeFlowClusterNode(
  cluster: FamCluster,
  position: Pos,
  doc: FamDocument,
  opts?: {
    roles?: Map<string, KinshipRole>
    spouseIds?: Set<string>
    genOf?: Map<string, number>
    searchHits?: Set<string>
    hasParentId?: Set<string>
  },
): Node<ClusterFlowData, 'cluster'> {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]))
  const roles = opts?.roles ?? kinshipRolesOf(doc)
  const spouseIds = opts?.spouseIds ?? spouseIdSet(doc)
  const genOf = opts?.genOf ?? assignGenerations(doc)
  const hitSet = opts?.searchHits ?? new Set<string>()
  const hasParentId =
    opts?.hasParentId ??
    new Set(doc.edges.filter((e) => e.type === 'parent').map((e) => e.target))

  const members: ClusterMemberPreview[] = []
  for (const id of cluster.memberIds) {
    const fam = byId.get(id)
    if (!fam) continue
    const flow = makeFlowPersonNode(fam, { x: 0, y: 0 }, {
      generation: genOf.get(id) ?? 0,
      kinshipRole: roles.get(id) ?? 'blood',
      hasSpouse: spouseIds.has(id),
      searchHit: hitSet.has(id),
      isOrphan: !hasParentId.has(id),
    })
    members.push({ id, ...flow.data })
  }

  const compact = Boolean(cluster.compact)
  const locked = cluster.locked !== false
  const size = clusterSize(members.length, cluster.collapsed, compact)
  return {
    id: cluster.id,
    type: 'cluster',
    position,
    style: { width: size.w, height: size.h },
    data: {
      label: cluster.label || clusterKindLabel(cluster.kind),
      kind: cluster.kind,
      memberIds: cluster.memberIds,
      collapsed: cluster.collapsed,
      compact,
      locked,
      members,
    },
    draggable: true,
  }
}

/**
 * Manual canvas sync: keep placed card positions, refresh data/edges/families from doc.
 * Does NOT auto-layout or pull the whole catalog onto the field.
 * People nested in clusters are not free RF nodes — they render inside ClusterNode.
 */
export function syncManualCanvas(
  doc: FamDocument,
  canvasNodes: Node<CanvasFlowData>[],
  searchHits: string[] = [],
): LayoutResult {
  const families = buildFamilies(doc)
  const roles = kinshipRolesOf(doc)
  const spouseIds = spouseIdSet(doc)
  const genOf = assignGenerations(doc)
  const hitSet = new Set(searchHits)
  const byId = new Map(doc.nodes.map((n) => [n.id, n]))
  const nested = nestedPersonIds(doc)
  const prevPos = new Map(canvasNodes.map((n) => [n.id, n.position]))
  const canvasIds = new Set<string>()
  const hasParentId = new Set(
    doc.edges.filter((e) => e.type === 'parent').map((e) => e.target),
  )

  const nodes: Node<CanvasFlowData>[] = []
  for (const prev of canvasNodes) {
    if (prev.type === 'cluster') continue
    if (nested.has(prev.id)) continue
    const fam = byId.get(prev.id)
    if (!fam) continue
    canvasIds.add(prev.id)
    nodes.push(
      makeFlowPersonNode(fam, prev.position, {
        generation: genOf.get(prev.id) ?? (prev.data as PersonFlowData).generation ?? 0,
        kinshipRole: roles.get(prev.id) ?? 'blood',
        hasSpouse: spouseIds.has(prev.id),
        searchHit: hitSet.has(prev.id),
        isOrphan: !hasParentId.has(prev.id),
      }),
    )
  }

  for (const c of doc.clusters ?? []) {
    const pos = prevPos.get(c.id) ?? c.position
    nodes.push(
      makeFlowClusterNode(c, pos, doc, {
        roles,
        spouseIds,
        genOf,
        searchHits: hitSet,
        hasParentId,
      }),
    )
    canvasIds.add(c.id)
    for (const mid of c.memberIds) canvasIds.add(mid)
  }

  // Hide RF stubs only for pairs still nested in the same cluster (FamilyBands draws).
  const edges = doc.edges
    .filter((e) => canvasIds.has(e.source) && canvasIds.has(e.target))
    .filter((e) => {
      const ca = clusterOfPerson(doc, e.source)
      const cb = clusterOfPerson(doc, e.target)
      return !(ca && cb && ca.id === cb.id)
    })
    .map(hiddenEdge)

  return { nodes, edges, families }
}

export function layoutFamDocument(doc: FamDocument): LayoutResult {
  const families = buildFamilies(doc)
  if (doc.nodes.length === 0) {
    return { nodes: [], edges: [], families: [] }
  }

  const genOf = assignGenerations(doc)
  // Always use branching auto-layout — PPTX "preserve" caused stacked cards
  // once our node size exceeded the slide's relative spacing.
  const positions = layoutBranching(doc, genOf, families)

  const roles = kinshipRolesOf(doc)
  const spouseIds = spouseIdSet(doc)

  const nodes: Node<PersonFlowData>[] = doc.nodes.map((n) =>
    makeFlowPersonNode(n, positions.get(n.id) ?? { x: 0, y: 0 }, {
      generation: genOf.get(n.id) ?? 0,
      kinshipRole: roles.get(n.id) ?? 'blood',
      hasSpouse: spouseIds.has(n.id),
    }),
  )

  const edges: Edge[] = doc.edges.map(hiddenEdge)

  return { nodes, edges, families }
}
