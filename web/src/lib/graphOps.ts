// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import type {
  FamCluster,
  FamClusterKind,
  FamDocument,
  FamEdge,
  FamEdgeType,
  FamNode,
  GenderCode,
} from '../types/fam'

function isPhantomGroupKind(kind: FamClusterKind): boolean {
  return kind === 'custom' || kind === 'household'
}

export type NewPersonInput = {
  label?: string
  gender?: GenderCode
  birth?: string
  death?: string
  catalogSection?: 'uncategorized' | 'unknown'
}

function stamp(doc: FamDocument): FamDocument {
  return {
    ...doc,
    metadata: {
      ...doc.metadata,
      updatedAt: new Date().toISOString(),
    },
  }
}

export function newPersonId(doc: FamDocument): string {
  let n = doc.nodes.length + 1
  while (doc.nodes.some((x) => x.id === `n${n}`)) n += 1
  return `n${n}`
}

export function newEdgeId(doc: FamDocument, prefix: string): string {
  let n = doc.edges.length + 1
  while (doc.edges.some((x) => x.id === `${prefix}${n}`)) n += 1
  return `${prefix}${n}`
}

export function createEmptyPerson(doc: FamDocument, input: NewPersonInput = {}): FamNode {
  return {
    id: newPersonId(doc),
    type: 'person',
    position: { x: 0, y: 0 },
    data: {
      label: input.label?.trim() || 'Новый человек',
      gender: input.gender ?? 'M',
      birth: input.birth,
      death: input.death,
      maidenName: '',
      birthPlace: '',
      deathPlace: '',
      catalogSection: input.birth ? undefined : (input.catalogSection ?? 'uncategorized'),
      photo: null,
      photoRef: null,
      attachments: [],
      notes: '',
    },
  }
}

function hasUndirected(
  doc: FamDocument,
  type: 'spouse' | 'sibling',
  a: string,
  b: string,
): boolean {
  return doc.edges.some(
    (e) =>
      e.type === type &&
      ((e.source === a && e.target === b) || (e.source === b && e.target === a)),
  )
}

function hasSpouse(doc: FamDocument, a: string, b: string): boolean {
  return hasUndirected(doc, 'spouse', a, b)
}

function hasSibling(doc: FamDocument, a: string, b: string): boolean {
  return hasUndirected(doc, 'sibling', a, b)
}

function hasParent(doc: FamDocument, parentId: string, childId: string): boolean {
  return doc.edges.some(
    (e) => e.type === 'parent' && e.source === parentId && e.target === childId,
  )
}

/** True if adding parent→child would create a cycle in parent edges. */
export function wouldCreateParentCycle(
  doc: FamDocument,
  parentId: string,
  childId: string,
): boolean {
  if (parentId === childId) return true
  const childrenOf = new Map<string, string[]>()
  for (const e of doc.edges) {
    if (e.type !== 'parent') continue
    const list = childrenOf.get(e.source) ?? []
    list.push(e.target)
    childrenOf.set(e.source, list)
  }
  // Walk descendants of child; if we reach parent, cycle.
  const stack = [childId]
  const seen = new Set<string>()
  while (stack.length) {
    const id = stack.pop()!
    if (id === parentId) return true
    if (seen.has(id)) continue
    seen.add(id)
    for (const c of childrenOf.get(id) ?? []) stack.push(c)
  }
  return false
}

export function addPerson(doc: FamDocument, input: NewPersonInput = {}): {
  doc: FamDocument
  personId: string
} {
  const person = createEmptyPerson(doc, input)
  return {
    personId: person.id,
    doc: stamp({
      ...doc,
      nodes: [...doc.nodes, person],
    }),
  }
}

export function deletePerson(doc: FamDocument, personId: string): FamDocument {
  return stamp({
    ...doc,
    nodes: doc.nodes.filter((n) => n.id !== personId),
    edges: doc.edges.filter((e) => e.source !== personId && e.target !== personId),
  })
}

export type LinkResult =
  | { ok: true; doc: FamDocument; edgeId: string }
  | { ok: false; error: string }

export function addRelation(
  doc: FamDocument,
  source: string,
  target: string,
  type: FamEdgeType,
): LinkResult {
  if (!doc.nodes.some((n) => n.id === source) || !doc.nodes.some((n) => n.id === target)) {
    return { ok: false, error: 'Человек не найден' }
  }
  if (source === target) return { ok: false, error: 'Нельзя связать человека с собой' }

  if (type === 'spouse') {
    if (hasSpouse(doc, source, target)) return { ok: false, error: 'Брак уже есть' }
    const edge: FamEdge = {
      id: newEdgeId(doc, 'e'),
      source,
      target,
      type: 'spouse',
      data: { label: 'Брак' },
    }
    return { ok: true, edgeId: edge.id, doc: stamp({ ...doc, edges: [...doc.edges, edge] }) }
  }

  if (type === 'sibling') {
    if (hasSibling(doc, source, target)) return { ok: false, error: 'Связь брат/сестра уже есть' }
    const edge: FamEdge = {
      id: newEdgeId(doc, 'e'),
      source,
      target,
      type: 'sibling',
      data: { label: 'Брат/сестра' },
    }
    return { ok: true, edgeId: edge.id, doc: stamp({ ...doc, edges: [...doc.edges, edge] }) }
  }

  if (hasParent(doc, source, target)) return { ok: false, error: 'Связь родитель–ребёнок уже есть' }
  if (wouldCreateParentCycle(doc, source, target)) {
    return { ok: false, error: 'Связь создаёт цикл в родословной' }
  }
  const edge: FamEdge = {
    id: newEdgeId(doc, 'e'),
    source,
    target,
    type: 'parent',
  }
  return { ok: true, edgeId: edge.id, doc: stamp({ ...doc, edges: [...doc.edges, edge] }) }
}

export function removeRelation(doc: FamDocument, edgeId: string): FamDocument {
  return stamp({
    ...doc,
    edges: doc.edges.filter((e) => e.id !== edgeId),
  })
}

export type ApplyClusterResult =
  | { ok: true; doc: FamDocument; added: number }
  | { ok: false; error: string }

/**
 * Materialize real kinship edges from a cluster's kind for its members.
 * - siblings / children → sibling edges among all pairs
 * - parents → spouse if exactly 2; if >2 spouse between first two only
 * - custom / household → no real edges (visual grouping only)
 */
export function applyClusterKindRelations(
  doc: FamDocument,
  cluster: FamCluster,
): ApplyClusterResult {
  const members = [...new Set(cluster.memberIds)].filter((id) =>
    doc.nodes.some((n) => n.id === id),
  )
  if (members.length < 2) {
    return { ok: false, error: 'Нужно минимум два участника' }
  }
  if (isPhantomGroupKind(cluster.kind)) {
    return {
      ok: false,
      error: 'Для «Группа» реальные связи не назначаются',
    }
  }

  let next = doc
  let added = 0

  const addPair = (a: string, b: string, type: 'sibling' | 'spouse') => {
    const r = addRelation(next, a, b, type)
    if (r.ok) {
      next = r.doc
      added += 1
      return
    }
    // Ignore duplicates; surface other errors
    if (
      r.error !== 'Связь брат/сестра уже есть' &&
      r.error !== 'Брак уже есть'
    ) {
      throw new Error(r.error)
    }
  }

  try {
    if (cluster.kind === 'siblings' || cluster.kind === 'children') {
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          addPair(members[i], members[j], 'sibling')
        }
      }
    } else if (cluster.kind === 'parents') {
      // Exactly 2 → spouse; more → spouse on first two only (UI documents this).
      addPair(members[0], members[1], 'spouse')
    } else {
      return { ok: false, error: 'Неизвестный тип контейнера' }
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Не удалось применить связь',
    }
  }

  if (added === 0) {
    return { ok: false, error: 'Все связи этого типа уже есть' }
  }
  return { ok: true, doc: stamp(next), added }
}

/** Attach child to BOTH spouses (two parent edges → pedigree T under marriage ●). */
export function linkChildToCouple(
  doc: FamDocument,
  parentA: string,
  parentB: string,
  childId: string,
): LinkResult {
  if (childId === parentA || childId === parentB) {
    return { ok: false, error: 'Ребёнок не может быть одним из супругов' }
  }
  let next = doc
  const r1 = addRelation(next, parentA, childId, 'parent')
  if (!r1.ok && r1.error !== 'Связь родитель–ребёнок уже есть') return r1
  if (r1.ok) next = r1.doc
  const r2 = addRelation(next, parentB, childId, 'parent')
  if (!r2.ok && r2.error !== 'Связь родитель–ребёнок уже есть') return r2
  if (r2.ok) next = r2.doc
  if (next === doc) return { ok: false, error: 'Связи с обоими родителями уже есть' }
  return { ok: true, edgeId: r2.ok ? r2.edgeId : r1.ok ? r1.edgeId : '', doc: next }
}

/**
 * Attach every child to one parent, or to both spouses when parentB is set.
 * Used when docking a sibling-group ● to parents / marriage ●.
 */
export function linkParentsToChildren(
  doc: FamDocument,
  parentA: string,
  childIds: string[],
  parentB?: string,
): LinkResult {
  const kids = [...new Set(childIds)].filter((id) => id !== parentA && id !== parentB)
  if (!kids.length) return { ok: false, error: 'Нет детей для связи' }

  let next = doc
  let lastEdgeId = ''
  let changed = false
  let lastError = ''

  for (const childId of kids) {
    if (parentB) {
      const r = linkChildToCouple(next, parentA, parentB, childId)
      if (!r.ok) {
        if (r.error === 'Связи с обоими родителями уже есть') continue
        lastError = r.error
        continue
      }
      next = r.doc
      lastEdgeId = r.edgeId
      changed = true
    } else {
      const r = addRelation(next, parentA, childId, 'parent')
      if (!r.ok) {
        if (r.error === 'Связь родитель–ребёнок уже есть') continue
        lastError = r.error
        continue
      }
      next = r.doc
      lastEdgeId = r.edgeId
      changed = true
    }
  }

  if (!changed) {
    return {
      ok: false,
      error: lastError || 'Связи родитель–дети уже есть',
    }
  }
  return { ok: true, edgeId: lastEdgeId, doc: next }
}

export function removeRelationBetween(
  doc: FamDocument,
  a: string,
  b: string,
  type: FamEdgeType,
): FamDocument {
  return stamp({
    ...doc,
    edges: doc.edges.filter((e) => {
      if (e.type !== type) return true
      if (type === 'spouse' || type === 'sibling') {
        return !(
          (e.source === a && e.target === b) ||
          (e.source === b && e.target === a)
        )
      }
      return !(e.source === a && e.target === b)
    }),
  })
}

export function addChildOf(
  doc: FamDocument,
  parentId: string,
  input: NewPersonInput = {},
  alsoParentId?: string,
): { doc: FamDocument; personId: string } | { error: string } {
  const created = addPerson(doc, input)
  let next = created.doc
  const link1 = addRelation(next, parentId, created.personId, 'parent')
  if (!link1.ok) return { error: link1.error }
  next = link1.doc
  if (alsoParentId) {
    const link2 = addRelation(next, alsoParentId, created.personId, 'parent')
    if (!link2.ok) return { error: link2.error }
    next = link2.doc
  }
  return { doc: next, personId: created.personId }
}

export function addSpouseOf(
  doc: FamDocument,
  personId: string,
  input: NewPersonInput = {},
): { doc: FamDocument; personId: string } | { error: string } {
  const self = doc.nodes.find((n) => n.id === personId)
  const defaultGender: GenderCode = self?.data.gender === 'M' ? 'F' : 'M'
  const created = addPerson(doc, { gender: defaultGender, ...input })
  const link = addRelation(created.doc, personId, created.personId, 'spouse')
  if (!link.ok) return { error: link.error }
  return { doc: link.doc, personId: created.personId }
}

export function relationsOf(doc: FamDocument, personId: string) {
  const undirected = (type: 'spouse' | 'sibling') =>
    doc.edges
      .filter(
        (e) =>
          e.type === type && (e.source === personId || e.target === personId),
      )
      .map((e) => ({
        edgeId: e.id,
        id: e.source === personId ? e.target : e.source,
      }))

  const spouses = undirected('spouse')
  const siblings = undirected('sibling')

  const parents = doc.edges
    .filter((e) => e.type === 'parent' && e.target === personId)
    .map((e) => ({ edgeId: e.id, id: e.source }))

  const children = doc.edges
    .filter((e) => e.type === 'parent' && e.source === personId)
    .map((e) => ({ edgeId: e.id, id: e.target }))

  const labelOf = (id: string) => doc.nodes.find((n) => n.id === id)?.data.label ?? id

  return {
    spouses: spouses.map((s) => ({ ...s, label: labelOf(s.id) })),
    siblings: siblings.map((s) => ({ ...s, label: labelOf(s.id) })),
    parents: parents.map((s) => ({ ...s, label: labelOf(s.id) })),
    children: children.map((s) => ({ ...s, label: labelOf(s.id) })),
  }
}

export function spouseIdsOf(doc: FamDocument, personId: string): string[] {
  return relationsOf(doc, personId).spouses.map((s) => s.id)
}
