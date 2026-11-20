// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import type {
  Attachment,
  FamCluster,
  FamClusterKind,
  FamDocument,
  FamFile,
  FamNode,
  FamPhantomEdge,
  MediaRef,
} from '../types/fam'

const CLUSTER_KINDS: FamClusterKind[] = [
  'children',
  'parents',
  'siblings',
  'household',
  'custom',
]

function normalizeClusters(raw: FamDocument['clusters']): FamCluster[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((c) => c && typeof c.id === 'string')
    .map((c) => ({
      id: c.id,
      kind: CLUSTER_KINDS.includes(c.kind) ? c.kind : 'custom',
      label: typeof c.label === 'string' && c.label.trim() ? c.label : 'Группа',
      memberIds: Array.isArray(c.memberIds)
        ? c.memberIds.filter((id): id is string => typeof id === 'string')
        : [],
      collapsed: Boolean(c.collapsed),
      compact: Boolean(c.compact),
      // Default locked so cards aren't accidentally pulled out
      locked: c.locked !== false,
      position: {
        x: Number(c.position?.x) || 0,
        y: Number(c.position?.y) || 0,
      },
    }))
}

function normalizePhantoms(raw: FamDocument['phantoms']): FamPhantomEdge[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((p) => p && typeof p.id === 'string' && p.source && p.target)
    .map((p) => {
      const raw = p as FamPhantomEdge & { note?: unknown; comment?: unknown }
      const labelRaw =
        typeof raw.label === 'string'
          ? raw.label
          : typeof raw.note === 'string'
            ? raw.note
            : typeof raw.comment === 'string'
              ? raw.comment
              : undefined
      const label = labelRaw?.trim() ? labelRaw.trim() : undefined
      return {
        id: p.id,
        source: String(p.source),
        target: String(p.target),
        sourceKind: p.sourceKind === 'cluster' ? 'cluster' : 'person',
        targetKind: p.targetKind === 'cluster' ? 'cluster' : 'person',
        sourceHandle: typeof p.sourceHandle === 'string' ? p.sourceHandle : undefined,
        targetHandle: typeof p.targetHandle === 'string' ? p.targetHandle : undefined,
        label,
      }
    })
}

function normalizePhotoRef(node: FamNode): MediaRef | null {
  if (node.data.photoRef) return node.data.photoRef
  if (node.data.photo) return { dataUrl: node.data.photo }
  return null
}

function normalizeAttachments(list: Attachment[] | undefined): Attachment[] {
  return (list ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    mimeType: a.mimeType || 'application/octet-stream',
    size: a.size ?? 0,
    key: a.key,
    dataUrl: a.dataUrl ?? null,
  }))
}

export function normalizeFam(raw: FamFile): FamDocument {
  const now = new Date().toISOString()
  const nodes = (raw.nodes ?? []).map((n) => ({
    ...n,
    data: {
      ...n.data,
      photo: null,
      photoRef: normalizePhotoRef(n),
      attachments: normalizeAttachments(n.data.attachments),
    },
  }))

  return {
    version: raw.version ?? '1.0',
    metadata: {
      title: raw.metadata?.title ?? 'Без названия',
      createdAt: raw.metadata?.createdAt ?? now,
      updatedAt: raw.metadata?.updatedAt ?? now,
      treeId: raw.metadata?.treeId,
      layoutMode:
        raw.metadata?.layoutMode === 'preserve' ||
        raw.metadata?.layoutMode === 'manual' ||
        raw.metadata?.layoutMode === 'auto'
          ? raw.metadata.layoutMode
          : 'auto',
      placedIds: Array.isArray(raw.metadata?.placedIds)
        ? raw.metadata.placedIds.filter((id): id is string => typeof id === 'string')
        : undefined,
      source: raw.metadata?.source,
    },
    nodes,
    edges: raw.edges ?? [],
    clusters: normalizeClusters((raw as FamDocument).clusters),
    phantoms: normalizePhantoms((raw as FamDocument).phantoms),
  }
}

export function validateFam(doc: FamDocument): string[] {
  const errors: string[] = []
  const ids = new Set<string>()

  for (const node of doc.nodes) {
    if (ids.has(node.id)) errors.push(`Дубликат id узла: ${node.id}`)
    ids.add(node.id)
  }

  for (const edge of doc.edges) {
    if (!ids.has(edge.source)) errors.push(`Edge ${edge.id}: нет source ${edge.source}`)
    if (!ids.has(edge.target)) errors.push(`Edge ${edge.id}: нет target ${edge.target}`)
    if (edge.type !== 'spouse' && edge.type !== 'parent' && edge.type !== 'sibling') {
      errors.push(`Edge ${edge.id}: неизвестный type ${edge.type}`)
    }
  }

  const clusterIds = new Set<string>()
  for (const c of doc.clusters ?? []) {
    if (clusterIds.has(c.id) || ids.has(c.id)) {
      errors.push(`Дубликат id кластера: ${c.id}`)
    }
    clusterIds.add(c.id)
    for (const mid of c.memberIds) {
      if (!ids.has(mid)) errors.push(`Cluster ${c.id}: нет человека ${mid}`)
    }
  }

  const endpointOk = (id: string, kind: 'person' | 'cluster') =>
    kind === 'cluster' ? clusterIds.has(id) : ids.has(id)

  for (const p of doc.phantoms ?? []) {
    if (!endpointOk(p.source, p.sourceKind)) {
      errors.push(`Phantom ${p.id}: нет source ${p.source}`)
    }
    if (!endpointOk(p.target, p.targetKind)) {
      errors.push(`Phantom ${p.id}: нет target ${p.target}`)
    }
  }

  return errors
}
