// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import { create } from 'zustand'
import type { Edge, Node } from '@xyflow/react'
import type {
  FamCluster,
  FamClusterKind,
  FamDocument,
  FamEdgeType,
  FamPersonData,
} from '../types/fam'
import {
  buildFamilies,
  H_GAP,
  makeFlowPersonNode,
  NODE_HEIGHT,
  NODE_WIDTH,
  syncManualCanvas,
  type CanvasFlowData,
  type FamilyUnit,
  type PersonFlowData,
} from '../layout/layoutTree'
import { normalizeFam, validateFam } from '../lib/normalizeFam'
import { DEFAULT_GRID_SIZE, snapTo } from '../lib/grid'
import { birthSeedForGenKey, birthYearOf } from '../lib/peopleCatalog'
import {
  CLUSTER_WIDTH,
  clusterOfPerson,
  dissolveMemberPositions,
  fieldPersonIds,
  makePhantomEdge,
  newClusterId,
  PERSON_W,
  stripIntraClusterMemberPhantoms,
  stripMemberPairPhantoms,
} from '../lib/clusterGeometry'
import {
  addChildOf,
  addPerson,
  addRelation,
  addSpouseOf,
  applyClusterKindRelations,
  deletePerson,
  linkChildToCouple,
  linkParentsToChildren,
  removeRelation,
  type NewPersonInput,
} from '../lib/graphOps'

function scrubPersonFromContainers(doc: FamDocument, personId: string): FamDocument {
  return {
    ...doc,
    clusters: (doc.clusters ?? []).map((c) => ({
      ...c,
      memberIds: c.memberIds.filter((id) => id !== personId),
    })),
    phantoms: (doc.phantoms ?? []).filter(
      (p) =>
        !(p.sourceKind === 'person' && p.source === personId) &&
        !(p.targetKind === 'person' && p.target === personId),
    ),
  }
}

function placedMeta(doc: FamDocument, canvas: Node<CanvasFlowData>[]) {
  return {
    ...doc.metadata,
    layoutMode: 'manual' as const,
    placedIds: fieldPersonIds(doc, canvas),
    updatedAt: new Date().toISOString(),
  }
}

export type LinkMode = {
  type: FamEdgeType
  fromId: string
} | null

const HISTORY_LIMIT = 40
let lastEditHistoryAt = 0

function cloneDoc(doc: FamDocument): FamDocument {
  return structuredClone(doc)
}

/** Tear every kinship link — user rebuilds manually from the catalog. */
function stripEdges(doc: FamDocument): FamDocument {
  return {
    ...doc,
    edges: [],
    metadata: {
      ...doc.metadata,
      layoutMode: 'manual',
      updatedAt: new Date().toISOString(),
    },
  }
}

type TreeState = {
  doc: FamDocument | null
  filePath?: string
  dirty: boolean
  nodes: Node<CanvasFlowData>[]
  edges: Edge[]
  families: FamilyUnit[]
  selectedId?: string
  /** Selected phantom edge id (inspector). Mutually exclusive with selectedId UI. */
  selectedPhantomId?: string
  /** Selected real kinship FamEdge id (spouse/parent/sibling). Mutually exclusive with person/phantom. */
  selectedEdgeId?: string
  linkMode: LinkMode
  past: FamDocument[]
  future: FamDocument[]
  searchQuery: string
  searchHits: string[]
  searchIndex: number
  focusNodeId?: string
  focusToken: number
  drawerOpen: boolean
  /** Right inspector (person / cluster) open. */
  panelOpen: boolean
  /** Active catalog generation shelf (`d1920` | `unknown` | `uncategorized` | null). */
  activeGenKey: string | null
  /** Snap cards to canvas grid (strict orthogonal layout). */
  snapToGrid: boolean
  gridSize: number
  /** Draw phantom (gray dashed) links in FamilyBands. */
  phantomsVisible: boolean
  /** Draw phantom label text along the path when label is set. */
  phantomsShowLabels: boolean
  error?: string
  loadDocument: (raw: unknown, path?: string) => void
  setGraph: (nodes: Node<CanvasFlowData>[], edges: Edge[]) => void
  selectPerson: (id?: string) => void
  selectPhantom: (id?: string) => void
  selectEdge: (id?: string) => void
  updatePhantomLabel: (phantomId: string, label: string) => void
  updatePerson: (id: string, patch: Partial<FamPersonData>) => void
  applyDoc: (doc: FamDocument, opts?: { selectId?: string; dirty?: boolean }) => void
  placeOnCanvas: (personId: string, position: { x: number; y: number }) => boolean
  unplaceFromCanvas: (personId: string) => void
  addBlankPerson: (input?: NewPersonInput, opts?: { placeOnCanvas?: boolean }) => string | null
  setActiveGenKey: (key: string | null) => void
  addSpouseFor: (personId: string, input?: NewPersonInput) => string | null
  addChildFor: (personId: string, input?: NewPersonInput, withOtherParent?: boolean) => string | null
  removePerson: (personId: string) => void
  createCluster: (opts?: {
    label?: string
    kind?: FamClusterKind
    memberIds?: string[]
    position?: { x: number; y: number }
  }) => string | null
  addPersonToCluster: (
    clusterId: string,
    personId: string,
    canvasOverride?: Node<CanvasFlowData>[],
  ) => boolean
  removePersonFromCluster: (
    clusterId: string,
    personId: string,
    position?: { x: number; y: number },
  ) => boolean
  setClusterCollapsed: (clusterId: string, collapsed: boolean) => void
  updateCluster: (
    clusterId: string,
    patch: Partial<
      Pick<FamCluster, 'label' | 'kind' | 'collapsed' | 'compact' | 'locked'>
    >,
  ) => void
  deleteCluster: (clusterId: string, releaseMembers?: boolean) => void
  /**
   * Materialize real kinship edges from cluster kind (siblings/children/parents).
   * No-op / error for empty or «Группа» (custom) clusters.
   */
  applyClusterRelations: (clusterId: string) => boolean
  addPhantomLink: (
    source: string,
    target: string,
    sourceKind: 'person' | 'cluster',
    targetKind: 'person' | 'cluster',
    sourceHandle?: string | null,
    targetHandle?: string | null,
  ) => boolean
  removePhantomLink: (phantomId: string) => void
  setPhantomsVisible: (visible: boolean) => void
  setPhantomsShowLabels: (show: boolean) => void
  startLink: (fromId: string, type: FamEdgeType) => void
  cancelLink: () => void
  completeLink: (toId: string) => boolean
  linkRelation: (source: string, target: string, type: FamEdgeType) => boolean
  /** Child docks to marriage ● → both spouses become parents. */
  linkChildToMarriage: (childId: string, parentA: string, parentB: string) => boolean
  /**
   * Dock sibling-group ● (or several children) to a parent / couple:
   * every member becomes a child of parentA (and parentB if set).
   */
  linkSiblingGroupToParents: (
    childIds: string[],
    parentA: string,
    parentB?: string,
  ) => boolean
  unlinkEdge: (edgeId: string) => void
  /** Strip all kinship edges and phantoms; keep people and clusters. */
  clearAllRelations: () => boolean
  /** Spouse id of person on canvas, if any. */
  spouseOf: (personId: string) => string | undefined
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  setSearchQuery: (q: string) => void
  searchNext: () => void
  searchPrev: () => void
  requestFocus: (id: string) => void
  setDrawerOpen: (open: boolean) => void
  setPanelOpen: (open: boolean) => void
  setSnapToGrid: (on: boolean) => void
  setGridSize: (size: number) => void
  markSaved: (path?: string) => void
  clearError: () => void
}

/** Drop person↔person phantoms that wrongly connect two members of one cluster. */
function withoutIntraClusterPhantoms(doc: FamDocument): FamDocument {
  return stripIntraClusterMemberPhantoms(doc)
}

const emptyDoc = (): FamDocument => ({
  version: '1.0',
  metadata: {
    title: 'Новое дерево',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    layoutMode: 'manual',
  },
  nodes: [],
  edges: [],
  clusters: [],
  phantoms: [],
})

function applyHitsToNodes(
  nodes: Node<CanvasFlowData>[],
  hits: string[],
): Node<CanvasFlowData>[] {
  const set = new Set(hits)
  return nodes.map((n) => {
    if (n.type === 'cluster') return n
    return {
      ...n,
      data: { ...(n.data as PersonFlowData), searchHit: set.has(n.id) },
    }
  })
}

function computeHits(doc: FamDocument | null, query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!doc || !q) return []
  return doc.nodes
    .filter((n) => {
      const d = n.data
      return (
        d.label.toLowerCase().includes(q) ||
        (d.maidenName ?? '').toLowerCase().includes(q) ||
        (d.birthPlace ?? '').toLowerCase().includes(q) ||
        (d.deathPlace ?? '').toLowerCase().includes(q)
      )
    })
    .map((n) => n.id)
}

function pushPast(get: () => TreeState): Pick<TreeState, 'past' | 'future'> {
  const doc = get().doc
  if (!doc) return { past: get().past, future: [] }
  const past = [...get().past, cloneDoc(doc)].slice(-HISTORY_LIMIT)
  return { past, future: [] }
}

/** Commit doc changes while keeping who is on the canvas and where. */
function commitKeepingCanvas(
  doc: FamDocument,
  canvasNodes: Node<CanvasFlowData>[],
  selectId: string | undefined,
  searchHits: string[],
) {
  const layout = syncManualCanvas(doc, canvasNodes, searchHits)
  return {
    doc: {
      ...doc,
      metadata: placedMeta(doc, layout.nodes),
    },
    dirty: true,
    nodes: layout.nodes,
    edges: layout.edges,
    families: layout.families,
    selectedId: selectId,
    error: undefined as string | undefined,
  }
}

export const useTreeStore = create<TreeState>((set, get) => ({
  doc: null,
  filePath: undefined,
  dirty: false,
  nodes: [],
  edges: [],
  families: [],
  selectedId: undefined,
  selectedPhantomId: undefined,
  selectedEdgeId: undefined,
  linkMode: null,
  past: [],
  future: [],
  searchQuery: '',
  searchHits: [],
  searchIndex: -1,
  focusNodeId: undefined,
  focusToken: 0,
  drawerOpen: true,
  panelOpen: true,
  activeGenKey: null,
  snapToGrid: true,
  gridSize: DEFAULT_GRID_SIZE,
  phantomsVisible: true,
  phantomsShowLabels: true,
  error: undefined,

  loadDocument(raw, path) {
    try {
      const normalized = normalizeFam(raw as FamDocument)
      const errors = validateFam(normalized)
      if (errors.length) {
        set({
          error: errors.join('\n'),
          doc: null,
          nodes: [],
          edges: [],
          families: [],
          selectedId: undefined,
          selectedPhantomId: undefined,
          selectedEdgeId: undefined,
          linkMode: null,
          past: [],
          future: [],
          searchHits: [],
          searchIndex: -1,
        })
        return
      }

      // Old auto-layout files → tear kinship and start from empty field.
      // Manual saves preserve edges + placedIds; unplaced people stay in the catalog.
      const isManual = normalized.metadata.layoutMode === 'manual'
      const cleared = !isManual && normalized.edges.length > 0
      const baseDoc: FamDocument = isManual
        ? {
            ...normalized,
            metadata: { ...normalized.metadata, layoutMode: 'manual' as const },
          }
        : stripEdges(normalized)
      const doc = withoutIntraClusterPhantoms(baseDoc)
      const phantomsCleaned =
        (doc.phantoms ?? []).length !== (baseDoc.phantoms ?? []).length

      const placedIds = isManual ? (doc.metadata.placedIds ?? []) : []
      const byId = new Map(doc.nodes.map((n) => [n.id, n]))
      const canvasSeed = placedIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((n) => makeFlowPersonNode(n!, n!.position))
      const layout = syncManualCanvas(doc, canvasSeed, [])

      set({
        doc,
        filePath: path,
        dirty: cleared || phantomsCleaned,
        ...layout,
        selectedId: undefined,
        selectedPhantomId: undefined,
        selectedEdgeId: undefined,
        linkMode: null,
        past: [],
        future: [],
        searchQuery: '',
        searchHits: [],
        searchIndex: -1,
        drawerOpen: true,
        error: undefined,
      })
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : 'Не удалось загрузить файл',
        doc: null,
        nodes: [],
        edges: [],
        families: [],
        selectedId: undefined,
        linkMode: null,
        past: [],
        future: [],
      })
    }
  },

  applyDoc(doc, opts) {
    const hist = pushPast(get)
    set({
      ...hist,
      ...commitKeepingCanvas(
        doc,
        get().nodes,
        opts?.selectId ?? get().selectedId,
        get().searchHits,
      ),
      dirty: opts?.dirty ?? true,
      linkMode: null,
    })
  },

  setGraph(nodes, edges) {
    const hist = pushPast(get)
    const doc = get().doc
    if (!doc) {
      set({ ...hist, nodes, edges, dirty: true })
      return
    }
    const placed = new Map(nodes.map((n) => [n.id, n]))
    const nextNodes = doc.nodes.map((n) => {
      const p = placed.get(n.id)
      if (!p || p.type === 'cluster') return n
      return { ...n, position: { x: p.position.x, y: p.position.y } }
    })
    const nextClusters = (doc.clusters ?? []).map((c) => {
      const p = placed.get(c.id)
      return p ? { ...c, position: { x: p.position.x, y: p.position.y } } : c
    })
    const nextDoc: FamDocument = {
      ...doc,
      nodes: nextNodes,
      clusters: nextClusters,
      metadata: placedMeta({ ...doc, clusters: nextClusters }, nodes),
    }
    set({
      ...hist,
      nodes,
      edges,
      dirty: true,
      doc: nextDoc,
      families: buildFamilies(nextDoc),
    })
  },

  placeOnCanvas(personId, position) {
    const { doc, nodes } = get()
    if (!doc) return false
    if (nodes.some((n) => n.type !== 'cluster' && n.id === personId)) {
      get().requestFocus(personId)
      return true
    }
    // Already nested in a cluster — treat as on field
    if (clusterOfPerson(doc, personId)) {
      get().requestFocus(personId)
      return true
    }
    const fam = doc.nodes.find((n) => n.id === personId)
    if (!fam) return false
    const hist = pushPast(get)
    const { snapToGrid, gridSize } = get()
    let centered = {
      x: position.x - 66,
      y: position.y - 76,
    }
    if (snapToGrid) {
      const g = gridSize || DEFAULT_GRID_SIZE
      centered = {
        x: Math.round(centered.x / g) * g,
        y: Math.round(centered.y / g) * g,
      }
    }
    const next = [
      ...nodes,
      makeFlowPersonNode(fam, centered, {
        hasSpouse: doc.edges.some(
          (e) =>
            e.type === 'spouse' && (e.source === personId || e.target === personId),
        ),
      }),
    ]
    const layout = syncManualCanvas(doc, next, get().searchHits)
    set({
      ...hist,
      ...layout,
      doc: {
        ...doc,
        metadata: placedMeta(doc, layout.nodes),
      },
      dirty: true,
      selectedId: personId,
      focusNodeId: personId,
      focusToken: get().focusToken + 1,
      panelOpen: true,
      linkMode: null,
      error: undefined,
    })
    return true
  },

  unplaceFromCanvas(personId) {
    const { doc, nodes } = get()
    if (!doc) return
    const hist = pushPast(get)
    const host = clusterOfPerson(doc, personId)
    let nextDoc = doc
    let next = nodes.filter((n) => n.id !== personId)
    if (host) {
      nextDoc = {
        ...doc,
        clusters: (doc.clusters ?? []).map((c) =>
          c.id === host.id
            ? { ...c, memberIds: c.memberIds.filter((id) => id !== personId) }
            : c,
        ),
      }
    }
    const layout = syncManualCanvas(nextDoc, next, get().searchHits)
    set({
      ...hist,
      ...layout,
      doc: {
        ...nextDoc,
        metadata: placedMeta(nextDoc, layout.nodes),
      },
      dirty: true,
      selectedId: get().selectedId === personId ? undefined : get().selectedId,
      linkMode: null,
    })
  },

  selectPerson(id) {
    const { linkMode, doc } = get()
    if (linkMode && id) {
      if (doc?.clusters?.some((c) => c.id === id)) {
        set({
          selectedId: id,
          selectedPhantomId: undefined,
          selectedEdgeId: undefined,
          linkMode: null,
          panelOpen: true,
        })
        return
      }
      get().completeLink(id)
      return
    }
    set(
      id
        ? {
            selectedId: id,
            selectedPhantomId: undefined,
            selectedEdgeId: undefined,
            panelOpen: true,
          }
        : {
            selectedId: id,
            selectedPhantomId: undefined,
            selectedEdgeId: undefined,
          },
    )
  },

  selectPhantom(id) {
    if (!id) {
      set({ selectedPhantomId: undefined })
      return
    }
    set({
      selectedPhantomId: id,
      selectedId: undefined,
      selectedEdgeId: undefined,
      panelOpen: true,
      linkMode: null,
    })
  },

  selectEdge(id) {
    if (!id) {
      set({ selectedEdgeId: undefined })
      return
    }
    set({
      selectedEdgeId: id,
      selectedId: undefined,
      selectedPhantomId: undefined,
      panelOpen: true,
      linkMode: null,
    })
  },

  updatePhantomLabel(phantomId, label) {
    const doc = get().doc
    if (!doc) return
    const nextLabel = label.length ? label : undefined
    const now = Date.now()
    const hist =
      now - lastEditHistoryAt > 700 ? pushPast(get) : { past: get().past, future: get().future }
    if (now - lastEditHistoryAt > 700) lastEditHistoryAt = now
    const nextDoc: FamDocument = {
      ...doc,
      phantoms: (doc.phantoms ?? []).map((p) =>
        p.id === phantomId ? { ...p, label: nextLabel } : p,
      ),
    }
    set({
      ...hist,
      ...commitKeepingCanvas(nextDoc, get().nodes, get().selectedId, get().searchHits),
      selectedPhantomId: phantomId,
    })
  },

  updatePerson(id, patch) {
    const now = Date.now()
    const hist =
      now - lastEditHistoryAt > 700 ? pushPast(get) : { past: get().past, future: get().future }
    if (now - lastEditHistoryAt > 700) lastEditHistoryAt = now

    const { nodes, doc } = get()

    // Birth year drives catalog shelf; clear pin when year appears
    const mergedPatch: Partial<FamPersonData> = { ...patch }
    if (patch.birth !== undefined) {
      const y = birthYearOf(patch.birth)
      if (y != null) mergedPatch.catalogSection = undefined
      else if (!patch.birth || String(patch.birth).trim() === '') {
        mergedPatch.catalogSection = 'uncategorized'
      }
    }

    const nextNodes = nodes.map((n) => {
      if (n.id !== id || n.type === 'cluster') return n
      const prev = n.data as PersonFlowData
      return {
        ...n,
        data: {
          ...prev,
          ...mergedPatch,
          photoRef:
            mergedPatch.photoRef !== undefined ? mergedPatch.photoRef : prev.photoRef,
          attachments:
            mergedPatch.attachments !== undefined
              ? mergedPatch.attachments
              : prev.attachments,
        },
      }
    })

    const nextDoc: FamDocument = {
      ...(doc ?? emptyDoc()),
      metadata: {
        ...(doc?.metadata ?? emptyDoc().metadata),
        updatedAt: new Date().toISOString(),
      },
      nodes: (doc?.nodes ?? []).map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                ...mergedPatch,
                photoRef:
                  mergedPatch.photoRef !== undefined
                    ? mergedPatch.photoRef
                    : n.data.photoRef,
                attachments:
                  mergedPatch.attachments !== undefined
                    ? mergedPatch.attachments
                    : n.data.attachments,
              },
            }
          : n,
      ),
      edges: doc?.edges ?? [],
    }

    const hits = computeHits(nextDoc, get().searchQuery)
    set({
      ...hist,
      nodes: applyHitsToNodes(nextNodes, hits),
      doc: nextDoc,
      dirty: true,
      searchHits: hits,
    })
  },

  addBlankPerson(input, opts) {
    const base = get().doc ?? emptyDoc()
    const hist = pushPast(get)
    const seed = birthSeedForGenKey(get().activeGenKey)
    const merged: NewPersonInput = {
      ...seed,
      ...input,
      birth: input?.birth ?? seed.birth,
      catalogSection: input?.catalogSection ?? seed.catalogSection,
    }
    const { doc, personId } = addPerson(base, merged)
    const place = opts?.placeOnCanvas === true
    const existing = get().nodes
    let canvasNodes = existing
    if (place) {
      const position =
        existing.length === 0
          ? { x: 80, y: 80 }
          : {
              x: Math.max(...existing.map((n) => n.position.x)) + 180,
              y: Math.min(...existing.map((n) => n.position.y)),
            }
      const fam = doc.nodes.find((n) => n.id === personId)!
      canvasNodes = [...existing, makeFlowPersonNode(fam, position)]
    }
    const layout = syncManualCanvas(doc, canvasNodes, get().searchHits)
    set({
      ...hist,
      doc: {
        ...doc,
        metadata: {
          ...doc.metadata,
          layoutMode: 'manual',
          placedIds: layout.nodes.map((n) => n.id),
        },
      },
      dirty: true,
      ...layout,
      selectedId: personId,
      filePath: get().filePath,
      linkMode: null,
      error: undefined,
    })
    return personId
  },

  setActiveGenKey(key) {
    set({ activeGenKey: key })
  },

  addSpouseFor(personId, input) {
    const base = get().doc
    if (!base) return null
    const result = addSpouseOf(base, personId, input)
    if ('error' in result) {
      set({ error: result.error })
      return null
    }
    const hist = pushPast(get)
    const anchor = get().nodes.find((n) => n.id === personId)
    const fam = result.doc.nodes.find((n) => n.id === result.personId)!
    const position = anchor
      ? { x: anchor.position.x + 180, y: anchor.position.y }
      : { x: 80, y: 80 }
    const next = [
      ...get().nodes.filter((n) => n.id !== result.personId),
      makeFlowPersonNode(fam, position),
    ]
    // ensure anchor stays if somehow missing
    if (anchor && !next.some((n) => n.id === personId)) next.push(anchor)
    const layout = syncManualCanvas(result.doc, next, get().searchHits)
    set({
      ...hist,
      doc: result.doc,
      dirty: true,
      ...layout,
      selectedId: result.personId,
      filePath: get().filePath,
      linkMode: null,
      error: undefined,
    })
    return result.personId
  },

  addChildFor(personId, input, withOtherParent = true) {
    const base = get().doc
    if (!base) return null
    const spouses = base.edges
      .filter(
        (e) =>
          e.type === 'spouse' && (e.source === personId || e.target === personId),
      )
      .map((e) => (e.source === personId ? e.target : e.source))
    const also = withOtherParent ? spouses[0] : undefined
    const result = addChildOf(base, personId, input, also)
    if ('error' in result) {
      set({ error: result.error })
      return null
    }
    const hist = pushPast(get)
    const { snapToGrid, gridSize } = get()
    const g = snapToGrid ? gridSize || DEFAULT_GRID_SIZE : 0
    const snap = (v: number) => (g ? snapTo(v, g) : v)

    const parentIds = also ? [personId, also] : [personId]
    // All children of this parent (or couple) including the new one — fork row, not a garland
    const childIds = [
      ...new Set(
        result.doc.edges
          .filter((e) => e.type === 'parent' && parentIds.includes(e.source))
          .map((e) => e.target),
      ),
    ]
    if (!childIds.includes(result.personId)) childIds.push(result.personId)

    const canvas = get().nodes.filter((n) => n.id !== result.personId)
    const anchor = canvas.find((n) => n.id === personId)
    const spouseNode = also ? canvas.find((n) => n.id === also) : undefined
    const fam = result.doc.nodes.find((n) => n.id === result.personId)!

    const step = NODE_WIDTH + H_GAP
    const rowY = snap(
      (anchor?.position.y ?? 80) + NODE_HEIGHT + 80,
    )
    let midX: number
    if (anchor && spouseNode) {
      const left = Math.min(anchor.position.x, spouseNode.position.x)
      const right = Math.max(
        anchor.position.x + NODE_WIDTH,
        spouseNode.position.x + NODE_WIDTH,
      )
      midX = (left + right) / 2
    } else if (anchor) {
      midX = anchor.position.x + NODE_WIDTH / 2
    } else {
      midX = 80 + NODE_WIDTH / 2
    }
    const totalW = childIds.length * NODE_WIDTH + (childIds.length - 1) * H_GAP
    let startX = snap(midX - totalW / 2)

    const next: Node<CanvasFlowData>[] = canvas.map((n) => {
      const idx = childIds.indexOf(n.id)
      if (idx < 0 || n.type === 'cluster') return n
      return {
        ...n,
        position: { x: snap(startX + idx * step), y: rowY },
      }
    })
    const newIdx = childIds.indexOf(result.personId)
    next.push(
      makeFlowPersonNode(fam, {
        x: snap(startX + Math.max(0, newIdx) * step),
        y: rowY,
      }),
    )
    if (anchor && !next.some((n) => n.id === personId)) next.push(anchor)

    const layout = syncManualCanvas(result.doc, next, get().searchHits)
    set({
      ...hist,
      doc: {
        ...result.doc,
        metadata: {
          ...result.doc.metadata,
          layoutMode: 'manual',
          placedIds: layout.nodes.map((n) => n.id),
          updatedAt: new Date().toISOString(),
        },
      },
      dirty: true,
      ...layout,
      // Keep parent selected so repeated «+ Ребёнок» adds siblings, not a garland of grandchildren
      selectedId: personId,
      focusNodeId: result.personId,
      focusToken: get().focusToken + 1,
      filePath: get().filePath,
      linkMode: null,
      error: undefined,
    })
    return result.personId
  },

  removePerson(personId) {
    const base = get().doc
    if (!base) return
    const hist = pushPast(get)
    const cleaned = scrubPersonFromContainers(base, personId)
    const doc = deletePerson(cleaned, personId)
    const hits = computeHits(doc, get().searchQuery)
    const nextCanvas = get().nodes.filter((n) => n.id !== personId)
    const layout = syncManualCanvas(doc, nextCanvas, hits)
    set({
      ...hist,
      doc: { ...doc, metadata: placedMeta(doc, layout.nodes) },
      dirty: true,
      ...layout,
      filePath: get().filePath,
      selectedId: get().selectedId === personId ? undefined : get().selectedId,
      linkMode: null,
      searchHits: hits,
      searchIndex: hits.length ? 0 : -1,
      error: undefined,
    })
  },

  createCluster(opts) {
    const base = get().doc ?? emptyDoc()
    const hist = pushPast(get)
    const { snapToGrid, gridSize, nodes } = get()
    const g = snapToGrid ? gridSize || DEFAULT_GRID_SIZE : 0
    const snap = (v: number) => (g ? snapTo(v, g) : v)
    const memberIds = [...new Set(opts?.memberIds ?? [])]
    let position = opts?.position ?? {
      x: 120,
      y: 120,
    }
    if (!opts?.position && nodes.length) {
      position = {
        x: Math.max(...nodes.map((n) => n.position.x)) + 40,
        y: Math.min(...nodes.map((n) => n.position.y)),
      }
    }
    position = { x: snap(position.x), y: snap(position.y) }

    // Pull members out of other clusters / free field
    let clusters = (base.clusters ?? []).map((c) => ({
      ...c,
      memberIds: c.memberIds.filter((id) => !memberIds.includes(id)),
    }))

    const cluster: FamCluster = {
      id: newClusterId(),
      kind: opts?.kind ?? 'custom',
      label: opts?.label?.trim() || 'Группа',
      memberIds,
      collapsed: false,
      compact: false,
      locked: true,
      position,
    }
    clusters = [...clusters, cluster]
    const doc: FamDocument = withoutIntraClusterPhantoms({
      ...base,
      clusters,
      phantoms: base.phantoms ?? [],
      metadata: {
        ...base.metadata,
        layoutMode: 'manual',
        updatedAt: new Date().toISOString(),
      },
    })
    const canvas = nodes.filter(
      (n) => n.type === 'cluster' || !memberIds.includes(n.id),
    )
    const layout = syncManualCanvas(doc, canvas, get().searchHits)
    set({
      ...hist,
      doc: { ...doc, metadata: placedMeta(doc, layout.nodes) },
      dirty: true,
      ...layout,
      selectedId: cluster.id,
      focusNodeId: cluster.id,
      focusToken: get().focusToken + 1,
      linkMode: null,
      error: undefined,
    })
    return cluster.id
  },

  addPersonToCluster(clusterId, personId, canvasOverride) {
    const doc = get().doc
    if (!doc) return false
    if (!doc.nodes.some((n) => n.id === personId)) return false
    if (!(doc.clusters ?? []).some((c) => c.id === clusterId)) return false
    if (personId === clusterId) return false
    const hist = pushPast(get)
    // Persist latest free/cluster positions before nesting
    const live = canvasOverride ?? get().nodes
    const placed = new Map(live.map((n) => [n.id, n]))
    const clustersPos = (doc.clusters ?? []).map((c) => {
      const p = placed.get(c.id)
      return p ? { ...c, position: { x: p.position.x, y: p.position.y } } : c
    })
    let clusters = clustersPos.map((c) => ({
      ...c,
      memberIds: c.memberIds.filter((id) => id !== personId),
    }))
    clusters = clusters.map((c) =>
      c.id === clusterId
        ? {
            ...c,
            memberIds: c.memberIds.includes(personId)
              ? c.memberIds
              : [...c.memberIds, personId],
          }
        : c,
    )
    const nextDoc = withoutIntraClusterPhantoms({ ...doc, clusters })
    const canvas = live.filter((n) => n.id !== personId || n.type === 'cluster')
    const layout = syncManualCanvas(nextDoc, canvas, get().searchHits)
    set({
      ...hist,
      ...layout,
      doc: { ...nextDoc, metadata: placedMeta(nextDoc, layout.nodes) },
      dirty: true,
      selectedId: clusterId,
      linkMode: null,
    })
    return true
  },

  removePersonFromCluster(clusterId, personId, position) {
    const doc = get().doc
    if (!doc) return false
    const cluster = (doc.clusters ?? []).find((c) => c.id === clusterId)
    if (!cluster?.memberIds.includes(personId)) return false
    const fam = doc.nodes.find((n) => n.id === personId)
    if (!fam) return false
    const hist = pushPast(get)
    const { snapToGrid, gridSize } = get()
    const g = snapToGrid ? gridSize || DEFAULT_GRID_SIZE : 0
    const snap = (v: number) => (g ? snapTo(v, g) : v)
    const liveCluster = get().nodes.find((n) => n.id === clusterId)
    const origin = liveCluster?.position ?? cluster.position
    // Next free slot in a horizontal row to the right of the container
    const rowY = snap(origin.y)
    const rowStart = origin.x + CLUSTER_WIDTH + 36
    const step = PERSON_W + 24
    const occupied = get()
      .nodes.filter((n) => n.type !== 'cluster' && n.id !== personId)
      .filter((n) => Math.abs(n.position.y - rowY) < 40 && n.position.x >= rowStart - 8)
      .map((n) => n.position.x)
    let slot = 0
    while (occupied.some((x) => Math.abs(x - (rowStart + slot * step)) < step * 0.55)) {
      slot += 1
      if (slot > 40) break
    }
    const pos = position
      ? {
          x: snap(position.x - 66),
          y: snap(position.y - 76),
        }
      : {
          x: snap(rowStart + slot * step),
          y: rowY,
        }
    const nextDoc = withoutIntraClusterPhantoms({
      ...doc,
      clusters: (doc.clusters ?? []).map((c) =>
        c.id === clusterId
          ? { ...c, memberIds: c.memberIds.filter((id) => id !== personId) }
          : c,
      ),
    })
    const canvas = [
      ...get().nodes.filter((n) => n.id !== personId),
      makeFlowPersonNode(fam, pos),
    ]
    const layout = syncManualCanvas(nextDoc, canvas, get().searchHits)
    set({
      ...hist,
      ...layout,
      doc: { ...nextDoc, metadata: placedMeta(nextDoc, layout.nodes) },
      dirty: true,
      selectedId: personId,
      focusNodeId: personId,
      focusToken: get().focusToken + 1,
      linkMode: null,
    })
    return true
  },

  setClusterCollapsed(clusterId, collapsed) {
    const doc = get().doc
    if (!doc) return
    const hist = pushPast(get)
    const nextDoc: FamDocument = {
      ...doc,
      clusters: (doc.clusters ?? []).map((c) =>
        c.id === clusterId ? { ...c, collapsed } : c,
      ),
    }
    set({
      ...hist,
      ...commitKeepingCanvas(nextDoc, get().nodes, clusterId, get().searchHits),
    })
  },

  updateCluster(clusterId, patch) {
    const doc = get().doc
    if (!doc) return
    if (!(doc.clusters ?? []).some((c) => c.id === clusterId)) return
    const hist = pushPast(get)
    const nextDoc = withoutIntraClusterPhantoms({
      ...doc,
      clusters: (doc.clusters ?? []).map((c) =>
        c.id === clusterId ? { ...c, ...patch } : c,
      ),
    })
    set({
      ...hist,
      ...commitKeepingCanvas(nextDoc, get().nodes, clusterId, get().searchHits),
    })
  },

  applyClusterRelations(clusterId) {
    const doc = get().doc
    if (!doc) return false
    const cluster = (doc.clusters ?? []).find((c) => c.id === clusterId)
    if (!cluster) {
      set({ error: 'Контейнер не найден' })
      return false
    }
    const result = applyClusterKindRelations(doc, cluster)
    if (!result.ok) {
      set({ error: result.error })
      return false
    }
    const hist = pushPast(get)
    // Drop redundant member phantoms once real edges exist
    const cleaned = stripMemberPairPhantoms(result.doc, cluster.memberIds)
    set({
      ...hist,
      ...commitKeepingCanvas(cleaned, get().nodes, clusterId, get().searchHits),
      filePath: get().filePath,
      linkMode: null,
    })
    return true
  },

  deleteCluster(clusterId, releaseMembers = true) {
    const doc = get().doc
    if (!doc) return
    const cluster = (doc.clusters ?? []).find((c) => c.id === clusterId)
    if (!cluster) return
    const hist = pushPast(get)
    const members = releaseMembers ? cluster.memberIds : []
    let nextDoc: FamDocument = {
      ...doc,
      clusters: (doc.clusters ?? []).filter((c) => c.id !== clusterId),
      phantoms: (doc.phantoms ?? []).filter(
        (p) =>
          !(p.sourceKind === 'cluster' && p.source === clusterId) &&
          !(p.targetKind === 'cluster' && p.target === clusterId),
      ),
    }
    nextDoc = withoutIntraClusterPhantoms(
      stripMemberPairPhantoms(nextDoc, cluster.memberIds),
    )
    let canvas = get().nodes.filter((n) => n.id !== clusterId)
    if (releaseMembers) {
      const { snapToGrid, gridSize } = get()
      const g = snapToGrid ? gridSize || DEFAULT_GRID_SIZE : 0
      const snap = (v: number) => (g ? snapTo(v, g) : v)
      const liveCluster = get().nodes.find((n) => n.id === clusterId)
      const origin = liveCluster?.position ?? cluster.position
      const slots = dissolveMemberPositions(origin, members.length, { snap })
      members.forEach((mid, i) => {
        if (canvas.some((n) => n.id === mid)) return
        const fam = doc.nodes.find((n) => n.id === mid)
        if (!fam) return
        canvas.push(makeFlowPersonNode(fam, slots[i] ?? origin))
      })
    }
    const layout = syncManualCanvas(nextDoc, canvas, get().searchHits)
    set({
      ...hist,
      ...layout,
      doc: { ...nextDoc, metadata: placedMeta(nextDoc, layout.nodes) },
      dirty: true,
      selectedId: get().selectedId === clusterId ? undefined : get().selectedId,
      linkMode: null,
    })
  },

  addPhantomLink(source, target, sourceKind, targetKind, sourceHandle, targetHandle) {
    const doc = get().doc
    if (!doc || source === target) return false
    // No phantoms between two members of the same container
    if (sourceKind === 'person' && targetKind === 'person') {
      const shared = (doc.clusters ?? []).some(
        (c) => c.memberIds.includes(source) && c.memberIds.includes(target),
      )
      if (shared) {
        set({ error: 'Фантом внутри контейнера не создаётся' })
        return false
      }
    }
    const exists = (doc.phantoms ?? []).some(
      (p) =>
        (p.source === source && p.target === target) ||
        (p.source === target && p.target === source),
    )
    if (exists) return true
    const hist = pushPast(get)
    const edge = makePhantomEdge(
      source,
      target,
      sourceKind,
      targetKind,
      sourceHandle,
      targetHandle,
    )
    const nextDoc: FamDocument = {
      ...doc,
      phantoms: [...(doc.phantoms ?? []), edge],
    }
    set({
      ...hist,
      ...commitKeepingCanvas(nextDoc, get().nodes, undefined, get().searchHits),
      selectedPhantomId: edge.id,
      panelOpen: true,
      linkMode: null,
    })
    return true
  },

  removePhantomLink(phantomId) {
    const doc = get().doc
    if (!doc) return
    const hist = pushPast(get)
    const nextDoc: FamDocument = {
      ...doc,
      phantoms: (doc.phantoms ?? []).filter((p) => p.id !== phantomId),
    }
    set({
      ...hist,
      ...commitKeepingCanvas(nextDoc, get().nodes, get().selectedId, get().searchHits),
      selectedPhantomId:
        get().selectedPhantomId === phantomId ? undefined : get().selectedPhantomId,
    })
  },

  setPhantomsVisible(visible) {
    set({ phantomsVisible: visible })
  },

  setPhantomsShowLabels(show) {
    set({ phantomsShowLabels: show })
  },

  startLink(fromId, type) {
    set({ linkMode: { fromId, type }, selectedId: fromId, error: undefined })
  },

  cancelLink() {
    set({ linkMode: null })
  },

  completeLink(toId) {
    const { doc, linkMode } = get()
    if (!doc || !linkMode) return false
    if (toId === linkMode.fromId) {
      set({ error: 'Выберите другого человека', linkMode: null })
      return false
    }
    return get().linkRelation(linkMode.fromId, toId, linkMode.type)
  },

  linkRelation(source, target, type) {
    const doc = get().doc
    if (!doc) return false
    const result = addRelation(doc, source, target, type)
    if (!result.ok) {
      set({ error: result.error, linkMode: null })
      return false
    }
    const hist = pushPast(get)
    set({
      ...hist,
      ...commitKeepingCanvas(result.doc, get().nodes, target, get().searchHits),
      filePath: get().filePath,
      linkMode: null,
    })
    return true
  },

  linkChildToMarriage(childId, parentA, parentB) {
    const doc = get().doc
    if (!doc) return false
    const result = linkChildToCouple(doc, parentA, parentB, childId)
    if (!result.ok) {
      set({ error: result.error, linkMode: null })
      return false
    }
    const hist = pushPast(get)
    set({
      ...hist,
      ...commitKeepingCanvas(result.doc, get().nodes, childId, get().searchHits),
      filePath: get().filePath,
      linkMode: null,
    })
    return true
  },

  linkSiblingGroupToParents(childIds, parentA, parentB) {
    const doc = get().doc
    if (!doc) return false
    const result = linkParentsToChildren(doc, parentA, childIds, parentB)
    if (!result.ok) {
      set({ error: result.error, linkMode: null })
      return false
    }
    const hist = pushPast(get)
    const selectId = childIds.find((id) => id !== parentA && id !== parentB) ?? parentA
    set({
      ...hist,
      ...commitKeepingCanvas(result.doc, get().nodes, selectId, get().searchHits),
      filePath: get().filePath,
      linkMode: null,
    })
    return true
  },

  spouseOf(personId) {
    const doc = get().doc
    if (!doc) return undefined
    const e = doc.edges.find(
      (x) =>
        x.type === 'spouse' && (x.source === personId || x.target === personId),
    )
    if (!e) return undefined
    const other = e.source === personId ? e.target : e.source
    const onField = new Set(fieldPersonIds(doc, get().nodes))
    if (!onField.has(other)) return undefined
    return other
  },

  unlinkEdge(edgeId) {
    const base = get().doc
    if (!base) return
    const hist = pushPast(get)
    const doc = removeRelation(base, edgeId)
    set({
      ...hist,
      ...commitKeepingCanvas(doc, get().nodes, get().selectedId, get().searchHits),
      filePath: get().filePath,
      linkMode: null,
      selectedEdgeId:
        get().selectedEdgeId === edgeId ? undefined : get().selectedEdgeId,
      selectedPhantomId: get().selectedPhantomId,
    })
  },

  clearAllRelations() {
    const base = get().doc
    if (!base) return false
    if (!(base.edges?.length || (base.phantoms ?? []).length)) return false
    const hist = pushPast(get)
    const doc: FamDocument = {
      ...base,
      edges: [],
      phantoms: [],
      metadata: {
        ...base.metadata,
        updatedAt: new Date().toISOString(),
      },
    }
    set({
      ...hist,
      ...commitKeepingCanvas(doc, get().nodes, get().selectedId, get().searchHits),
      filePath: get().filePath,
      linkMode: null,
    })
    return true
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  undo() {
    const { past, doc, future, nodes } = get()
    if (!past.length || !doc) return
    const prev = past[past.length - 1]
    const nextPast = past.slice(0, -1)
    const nextFuture = [...future, cloneDoc(doc)].slice(-HISTORY_LIMIT)
    const hits = computeHits(prev, get().searchQuery)
    // Keep canvas membership; drop cards deleted from catalog
    const ids = new Set(prev.nodes.map((n) => n.id))
    const clusterIds = new Set((prev.clusters ?? []).map((c) => c.id))
    const canvas = nodes.filter((n) =>
      n.type === 'cluster' ? clusterIds.has(n.id) : ids.has(n.id),
    )
    const layout = syncManualCanvas(prev, canvas, hits)
    set({
      past: nextPast,
      future: nextFuture,
      doc: prev,
      dirty: true,
      ...layout,
      searchHits: hits,
      linkMode: null,
      error: undefined,
    })
  },

  redo() {
    const { future, doc, past, nodes } = get()
    if (!future.length || !doc) return
    const next = future[future.length - 1]
    const nextFuture = future.slice(0, -1)
    const nextPast = [...past, cloneDoc(doc)].slice(-HISTORY_LIMIT)
    const hits = computeHits(next, get().searchQuery)
    const ids = new Set(next.nodes.map((n) => n.id))
    const clusterIds = new Set((next.clusters ?? []).map((c) => c.id))
    const canvas = nodes.filter((n) =>
      n.type === 'cluster' ? clusterIds.has(n.id) : ids.has(n.id),
    )
    const layout = syncManualCanvas(next, canvas, hits)
    set({
      past: nextPast,
      future: nextFuture,
      doc: next,
      dirty: true,
      ...layout,
      searchHits: hits,
      linkMode: null,
      error: undefined,
    })
  },

  setSearchQuery(q) {
    const hits = computeHits(get().doc, q)
    const index = hits.length ? 0 : -1
    const focusId = index >= 0 ? hits[index] : undefined
    set({
      searchQuery: q,
      searchHits: hits,
      searchIndex: index,
      nodes: applyHitsToNodes(get().nodes, hits),
      selectedId: focusId ?? get().selectedId,
      focusNodeId: focusId,
      focusToken: focusId ? get().focusToken + 1 : get().focusToken,
    })
  },

  searchNext() {
    const { searchHits, searchIndex } = get()
    if (!searchHits.length) return
    const next = (searchIndex + 1) % searchHits.length
    const id = searchHits[next]
    set({
      searchIndex: next,
      selectedId: id,
      focusNodeId: id,
      focusToken: get().focusToken + 1,
    })
  },

  searchPrev() {
    const { searchHits, searchIndex } = get()
    if (!searchHits.length) return
    const next = (searchIndex - 1 + searchHits.length) % searchHits.length
    const id = searchHits[next]
    set({
      searchIndex: next,
      selectedId: id,
      focusNodeId: id,
      focusToken: get().focusToken + 1,
    })
  },

  requestFocus(id) {
    set({
      selectedId: id,
      focusNodeId: id,
      focusToken: get().focusToken + 1,
      panelOpen: true,
    })
  },

  setDrawerOpen(open) {
    set({ drawerOpen: open })
  },

  setPanelOpen(open) {
    set({ panelOpen: open })
  },

  setSnapToGrid(on) {
    set({ snapToGrid: on })
  },

  setGridSize(size) {
    const n = Math.round(size)
    if (!Number.isFinite(n) || n < 4 || n > 80) return
    set({ gridSize: n })
  },

  markSaved(path) {
    set((s) => ({ dirty: false, filePath: path ?? s.filePath }))
  },

  clearError() {
    set({ error: undefined })
  },
}))

export type { NewPersonInput }
