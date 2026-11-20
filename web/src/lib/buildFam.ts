// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import type { Edge, Node } from '@xyflow/react'
import type { FamDocument, FamEdge, FamNode } from '../types/fam'
import type { CanvasFlowData, PersonFlowData } from '../layout/layoutTree'
import { fieldPersonIds } from './clusterGeometry'

/**
 * Save full catalog + kinship + clusters/phantoms.
 * Canvas placement updates positions for free people and clusters;
 * nested cluster members keep catalog positions until extracted.
 */
export function buildFamFromGraph(
  base: FamDocument,
  nodes: Node<CanvasFlowData>[],
  edges: Edge[],
): FamDocument {
  const placed = new Map(nodes.map((n) => [n.id, n]))

  const famNodes: FamNode[] = base.nodes.map((n) => {
    const p = placed.get(n.id)
    if (!p || p.type === 'cluster') return n
    const data = p.data as PersonFlowData
    return {
      id: n.id,
      type: 'person',
      position: { x: p.position.x, y: p.position.y },
      data: {
        label: data.label,
        gender: data.gender,
        birth: data.birth,
        death: data.death,
        maidenName: data.maidenName ?? n.data.maidenName,
        birthPlace: data.birthPlace ?? n.data.birthPlace,
        deathPlace: data.deathPlace ?? n.data.deathPlace,
        notes: data.notes,
        catalogSection: n.data.catalogSection,
        photo: null,
        photoRef: data.photoRef ?? n.data.photoRef ?? null,
        attachments: data.attachments ?? n.data.attachments ?? [],
      },
    }
  })

  const famEdges: FamEdge[] =
    base.edges.length > 0
      ? base.edges
      : edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: ((): FamEdge['type'] => {
            const rel = (e.data as { relation?: string } | undefined)?.relation
            if (rel === 'spouse') return 'spouse'
            if (rel === 'sibling') return 'sibling'
            return 'parent'
          })(),
        }))

  const clusters = (base.clusters ?? []).map((c) => {
    const p = placed.get(c.id)
    return p ? { ...c, position: { x: p.position.x, y: p.position.y } } : c
  })

  return {
    ...base,
    metadata: {
      ...base.metadata,
      updatedAt: new Date().toISOString(),
      layoutMode: 'manual',
      placedIds: fieldPersonIds({ ...base, clusters }, nodes),
    },
    nodes: famNodes,
    edges: famEdges,
    clusters,
    phantoms: base.phantoms ?? [],
  }
}
