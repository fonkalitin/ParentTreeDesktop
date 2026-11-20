// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import { useTreeStore } from '../../store/treeStore'

type Props = {
  phantomId: string
  onClose: () => void
}

function endpointLabel(
  id: string,
  kind: 'person' | 'cluster',
  doc: NonNullable<ReturnType<typeof useTreeStore.getState>['doc']>,
) {
  if (kind === 'cluster') {
    return doc.clusters?.find((c) => c.id === id)?.label ?? id
  }
  return doc.nodes.find((n) => n.id === id)?.data.label ?? id
}

export function PhantomPanel({ phantomId, onClose }: Props) {
  const doc = useTreeStore((s) => s.doc)
  const updatePhantomLabel = useTreeStore((s) => s.updatePhantomLabel)
  const removePhantomLink = useTreeStore((s) => s.removePhantomLink)

  const phantom = doc?.phantoms?.find((p) => p.id === phantomId)
  if (!doc || !phantom) return null

  const from = endpointLabel(phantom.source, phantom.sourceKind, doc)
  const to = endpointLabel(phantom.target, phantom.targetKind, doc)

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-[var(--pt-border)] bg-[var(--pt-panel)]">
      <div className="flex items-center justify-between border-b border-[var(--pt-border)] px-3 py-2">
        <div className="text-sm font-semibold">Фантом-связь</div>
        <button
          type="button"
          className="rounded px-2 py-1 text-xs text-[var(--pt-muted)] hover:bg-white/5"
          onClick={onClose}
        >
          Закрыть
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
        <div className="rounded-md border border-[var(--pt-border)] bg-[var(--pt-bg)] px-2.5 py-2 text-xs text-[var(--pt-muted)]">
          <div className="truncate text-[var(--pt-text)]">{from}</div>
          <div className="my-1 text-center opacity-70">∿</div>
          <div className="truncate text-[var(--pt-text)]">{to}</div>
        </div>

        <label className="block space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--pt-muted)]">
            Описание
          </span>
          <textarea
            rows={4}
            value={phantom.label ?? ''}
            placeholder="Смысл / комментарий фантом-связи"
            className="w-full resize-y rounded-md border border-[var(--pt-border)] bg-[var(--pt-bg)] px-2 py-1.5 text-sm text-[var(--pt-text)] outline-none placeholder:text-[var(--pt-muted)] focus:border-[var(--pt-accent)]"
            onChange={(e) => updatePhantomLabel(phantomId, e.target.value)}
          />
        </label>

        <button
          type="button"
          className="w-full rounded-md border border-rose-800/60 bg-rose-950/40 px-2 py-1.5 text-xs text-rose-100 hover:bg-rose-900/50"
          onClick={() => {
            removePhantomLink(phantomId)
            onClose()
          }}
        >
          Удалить фантом-связь
        </button>
      </div>
    </aside>
  )
}
