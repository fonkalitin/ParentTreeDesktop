// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import type { Node as RelNode, Relation } from 'relatives-tree/lib/types'
import type { FamDocument, FamEdge, FamNode } from '../types/fam'

const BLOOD = 'blood' as Relation['type']
const MARRIED = 'married' as Relation['type']

function parentIdsOf(personId: string, edges: FamEdge[]): string[] {
  return edges
    .filter((e) => e.type === 'parent' && e.target === personId)
    .map((e) => e.source)
}

function childIdsOf(personId: string, edges: FamEdge[]): string[] {
  return edges
    .filter((e) => e.type === 'parent' && e.source === personId)
    .map((e) => e.target)
}

function spouseIdsOf(personId: string, edges: FamEdge[]): string[] {
  return edges
    .filter((e) => e.type === 'spouse' && (e.source === personId || e.target === personId))
    .map((e) => (e.source === personId ? e.target : e.source))
}

function sameParents(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((id) => set.has(id))
}

function siblingIdsOf(personId: string, nodes: FamNode[], edges: FamEdge[]): string[] {
  const fromEdges = edges
    .filter(
      (e) =>
        e.type === 'sibling' && (e.source === personId || e.target === personId),
    )
    .map((e) => (e.source === personId ? e.target : e.source))

  const myParents = parentIdsOf(personId, edges)
  const fromParents =
    myParents.length === 0
      ? []
      : nodes
          .map((n) => n.id)
          .filter((id) => id !== personId)
          .filter((id) => sameParents(myParents, parentIdsOf(id, edges)))

  return [...new Set([...fromEdges, ...fromParents])]
}

export function famToRelatives(doc: FamDocument): RelNode[] {
  return doc.nodes.map((node) => {
    const parents = parentIdsOf(node.id, doc.edges).map((id) => ({ id, type: BLOOD }))
    const children = [...new Set(childIdsOf(node.id, doc.edges))].map((id) => ({
      id,
      type: BLOOD,
    }))
    const spouses = spouseIdsOf(node.id, doc.edges).map((id) => ({ id, type: MARRIED }))
    const siblings = siblingIdsOf(node.id, doc.nodes, doc.edges).map((id) => ({
      id,
      type: BLOOD,
    }))

    return {
      id: node.id,
      gender: node.data.gender === 'F' ? 'female' : 'male',
      parents,
      children,
      spouses,
      siblings,
    } as RelNode
  })
}

/** Pick oldest generation root: person with no parents, preferring most children. */
export function pickRootId(doc: FamDocument): string {
  const roots = doc.nodes.filter((n) => parentIdsOf(n.id, doc.edges).length === 0)
  if (roots.length === 0) return doc.nodes[0]?.id ?? ''

  return [...roots].sort((a, b) => {
    const ca = childIdsOf(a.id, doc.edges).length
    const cb = childIdsOf(b.id, doc.edges).length
    return cb - ca
  })[0].id
}
