// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import { useReactFlow } from '@xyflow/react'
import { useTreeStore } from '../store/treeStore'

export function CanvasControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const phantomsVisible = useTreeStore((s) => s.phantomsVisible)
  const setPhantomsVisible = useTreeStore((s) => s.setPhantomsVisible)
  const phantomsShowLabels = useTreeStore((s) => s.phantomsShowLabels)
  const setPhantomsShowLabels = useTreeStore((s) => s.setPhantomsShowLabels)

  return (
    <div className="absolute bottom-4 left-4 z-10 flex flex-col overflow-hidden rounded-lg border border-[var(--pt-border)] bg-[var(--pt-panel)] shadow-lg">
      <button
        type="button"
        title="Увеличить"
        className="h-8 w-8 border-b border-[var(--pt-border)] text-sm text-[var(--pt-text)] hover:bg-white/5"
        onClick={() => zoomIn()}
      >
        +
      </button>
      <button
        type="button"
        title="Уменьшить"
        className="h-8 w-8 border-b border-[var(--pt-border)] text-sm text-[var(--pt-text)] hover:bg-white/5"
        onClick={() => zoomOut()}
      >
        −
      </button>
      <button
        type="button"
        title="Вписать в экран"
        className="h-8 w-8 border-b border-[var(--pt-border)] text-[11px] text-[var(--pt-text)] hover:bg-white/5"
        onClick={() => fitView({ padding: 0.18 })}
      >
        ⤢
      </button>
      <button
        type="button"
        title={phantomsVisible ? 'Скрыть фантом-связи' : 'Показать фантом-связи'}
        className={[
          'h-8 w-8 border-b border-[var(--pt-border)] text-[10px] hover:bg-white/5',
          phantomsVisible
            ? 'text-[var(--pt-accent)]'
            : 'text-[var(--pt-muted)] opacity-60',
        ].join(' ')}
        onClick={() => setPhantomsVisible(!phantomsVisible)}
      >
        ∿
      </button>
      <button
        type="button"
        title={
          phantomsShowLabels
            ? 'Скрыть подписи линий-фантомов'
            : 'Показать подписи линий-фантомов'
        }
        className={[
          'h-8 w-8 text-[10px] hover:bg-white/5',
          phantomsShowLabels
            ? 'text-[var(--pt-accent)]'
            : 'text-[var(--pt-muted)] opacity-60',
        ].join(' ')}
        onClick={() => setPhantomsShowLabels(!phantomsShowLabels)}
      >
        Т
      </button>
    </div>
  )
}
