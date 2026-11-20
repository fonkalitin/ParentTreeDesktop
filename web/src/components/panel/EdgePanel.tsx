// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import { useTreeStore } from '../../store/treeStore'
import type { FamEdgeType } from '../../types/fam'

type Props = {
  edgeId: string
  onClose: () => void
}

function personLabel(
  id: string,
  doc: NonNullable<ReturnType<typeof useTreeStore.getState>['doc']>,
) {
  return doc.nodes.find((n) => n.id === id)?.data.label ?? id
}

function typeTitle(type: FamEdgeType): string {
  if (type === 'spouse') return 'Супружеская связь'
  if (type === 'sibling') return 'Связь братьев/сестёр'
  return 'Родительская связь'
}

function typeHint(type: FamEdgeType): string {
  if (type === 'spouse') return 'Супруги'
  if (type === 'sibling') return 'Братья / сёстры'
  return 'Родитель → ребёнок'
}

export function EdgePanel({ edgeId, onClose }: Props) {
  const doc = useTreeStore((s) => s.doc)
  const unlinkEdge = useTreeStore((s) => s.unlinkEdge)

  const edge = doc?.edges.find((e) => e.id === edgeId)
  if (!doc || !edge) return null

  const from = personLabel(edge.source, doc)
  const to = personLabel(edge.target, doc)

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-[var(--pt-border)] bg-[var(--pt-panel)]">
      <div className="flex items-center justify-between border-b border-[var(--pt-border)] px-3 py-2">
        <div className="text-sm font-semibold">{typeTitle(edge.type)}</div>
        <button
          type="button"
          className="rounded px-2 py-1 text-xs text-[var(--pt-muted)] hover:bg-white/5"
          onClick={onClose}
        >
          Закрыть
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
        <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--pt-muted)]">
          {typeHint(edge.type)}
        </div>
        <div className="rounded-md border border-[var(--pt-border)] bg-[var(--pt-bg)] px-2.5 py-2 text-xs text-[var(--pt-muted)]">
          <div className="truncate text-[var(--pt-text)]">{from}</div>
          <div className="my-1 text-center opacity-70">—</div>
          <div className="truncate text-[var(--pt-text)]">{to}</div>
        </div>

        <p className="text-[11px] leading-relaxed text-[var(--pt-muted)]">
          Delete / Backspace удаляет связь из дерева. Родственные линии на холсте
          пересчитаются автоматически.
        </p>

        <button
          type="button"
          className="w-full rounded-md border border-rose-800/60 bg-rose-950/40 px-2 py-1.5 text-xs text-rose-100 hover:bg-rose-900/50"
          onClick={() => {
            unlinkEdge(edgeId)
            onClose()
          }}
        >
          Удалить связь
        </button>
      </div>
    </aside>
  )
}
