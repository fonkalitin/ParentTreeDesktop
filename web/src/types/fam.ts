// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
export type GenderCode = 'M' | 'F'

/** Photos and attachments are embedded in the .fam document. */
export type MediaRef = {
  key?: string
  dataUrl?: string | null
  mimeType?: string
  name?: string
  size?: number
}

export type Attachment = MediaRef & {
  id: string
  name: string
  mimeType: string
  size: number
}

export type FamPersonData = {
  label: string
  gender: GenderCode
  /**
   * Partial date string (backward-compatible with year-only files):
   * - `"1990"` — year only
   * - `"1990-03"` — year + month
   * - `"1990-03-12"` — full date
   * Missing month/day means unknown — never invent them.
   */
  birth?: string
  death?: string
  /**
   * Catalog shelf when there is no birth year yet:
   * - `uncategorized` — вне разделов (default if nothing selected on add)
   * - `unknown` — «Без года рождения»
   * Cleared automatically once a birth year is set.
   */
  catalogSection?: 'uncategorized' | 'unknown'
  /** Maiden / birth surname — typically for women; optional on older files. */
  maidenName?: string
  /** Place of birth (free text). */
  birthPlace?: string
  /** Place of death (free text); UI enables when death date is set. */
  deathPlace?: string
  /** @deprecated prefer photoRef; still accepted when loading old files */
  photo?: string | null
  photoRef?: MediaRef | null
  attachments?: Attachment[]
  notes?: string
}

export type FamNode = {
  id: string
  type: 'person'
  data: FamPersonData
  position: { x: number; y: number }
}

export type FamEdgeType = 'spouse' | 'parent' | 'sibling'

export type FamEdge = {
  id: string
  source: string
  target: string
  type: FamEdgeType
  data?: { label?: string }
}

/** Visual grouping only — never a substitute for parent/spouse/sibling edges. */
export type FamClusterKind =
  | 'children'
  | 'parents'
  | 'siblings'
  | 'household'
  | 'custom'

export type FamCluster = {
  id: string
  kind: FamClusterKind
  label: string
  memberIds: string[]
  /** Whole container body collapsed to a strip. */
  collapsed: boolean
  /** Members as mini rows (no full photo cards). */
  compact?: boolean
  /**
   * When true (default), nested members cannot be dragged out of the cluster.
   * Missing on older files → treated as locked.
   */
  locked?: boolean
  position: { x: number; y: number }
}

/**
 * Ambiguous / undefined link (cluster↔cluster, cluster↔person, or phantom ports).
 * Orthogonal dashed gray — not kinship truth.
 */
export type FamPhantomEdge = {
  id: string
  source: string
  target: string
  sourceKind: 'person' | 'cluster'
  targetKind: 'person' | 'cluster'
  /** RF handle id used at connect time — docks line to that gray port. */
  sourceHandle?: string
  targetHandle?: string
  /** Optional meaning / comment shown on the line and in the inspector. */
  label?: string
}

export type FamDocument = {
  version: string
  metadata: {
    title: string
    createdAt: string
    updatedAt: string
    treeId?: string
    /** When "preserve", keep node.position from file (PPTX / hand layout). */
    layoutMode?: 'auto' | 'preserve' | 'manual'
    /** People currently placed on the canvas (manual assembly). */
    placedIds?: string[]
    source?: string
  }
  nodes: FamNode[]
  edges: FamEdge[]
  /** Optional multi-card containers (user-created only). */
  clusters?: FamCluster[]
  /** Optional phantom / undefined relations. */
  phantoms?: FamPhantomEdge[]
}

export type FamFile =
  | FamDocument
  | {
      nodes: FamNode[]
      edges: FamEdge[]
      version?: string
      metadata?: Partial<FamDocument['metadata']>
    }
