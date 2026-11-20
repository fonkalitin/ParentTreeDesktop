// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import { useRef, useState, type RefObject } from 'react'
import { getHost } from '../bridge/host'
import { useTreeStore } from '../store/treeStore'
import { buildFamFromGraph } from '../lib/buildFam'
import { exportTreePdf, exportTreePng } from '../lib/exportTree'

type Props = {
  onFit: () => void
  searchInputRef?: RefObject<HTMLInputElement | null>
}

export function Toolbar({ onFit, searchInputRef }: Props) {
  const doc = useTreeStore((s) => s.doc)
  const nodes = useTreeStore((s) => s.nodes)
  const edges = useTreeStore((s) => s.edges)
  const filePath = useTreeStore((s) => s.filePath)
  const dirty = useTreeStore((s) => s.dirty)
  const selectedId = useTreeStore((s) => s.selectedId)
  const removePerson = useTreeStore((s) => s.removePerson)
  const undo = useTreeStore((s) => s.undo)
  const redo = useTreeStore((s) => s.redo)
  const pastLen = useTreeStore((s) => s.past.length)
  const futureLen = useTreeStore((s) => s.future.length)
  const searchQuery = useTreeStore((s) => s.searchQuery)
  const searchHits = useTreeStore((s) => s.searchHits)
  const searchIndex = useTreeStore((s) => s.searchIndex)
  const setSearchQuery = useTreeStore((s) => s.setSearchQuery)
  const searchNext = useTreeStore((s) => s.searchNext)
  const searchPrev = useTreeStore((s) => s.searchPrev)
  const snapToGrid = useTreeStore((s) => s.snapToGrid)
  const gridSize = useTreeStore((s) => s.gridSize)
  const setSnapToGrid = useTreeStore((s) => s.setSnapToGrid)
  const setGridSize = useTreeStore((s) => s.setGridSize)
  const phantomsVisible = useTreeStore((s) => s.phantomsVisible)
  const setPhantomsVisible = useTreeStore((s) => s.setPhantomsVisible)
  const phantomsShowLabels = useTreeStore((s) => s.phantomsShowLabels)
  const setPhantomsShowLabels = useTreeStore((s) => s.setPhantomsShowLabels)
  const host = getHost()
  const [exporting, setExporting] = useState(false)
  const localRef = useRef<HTMLInputElement>(null)
  const inputRef = searchInputRef ?? localRef

  async function runExport(kind: 'png' | 'pdf') {
    if (!doc || !nodes.length || exporting) return
    setExporting(true)
    try {
      const title = doc.metadata.title || 'дерево'
      const save = (dataUrl: string, filename: string) =>
        host.requestExportFile(dataUrl, filename)
      if (kind === 'png') await exportTreePng(nodes, title, save)
      else await exportTreePdf(nodes, title, save)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось экспортировать')
    } finally {
      setExporting(false)
    }
  }

  const title = doc?.metadata.title ?? 'ParentTree'
  const hitLabel =
    searchHits.length > 0 ? `${searchIndex + 1}/${searchHits.length}` : searchQuery ? '0' : ''

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--pt-border)] bg-[var(--pt-bg-elevated)]/90 px-3 backdrop-blur">
      <span hidden data-parenttree-title={title} />

      <div className="ml-1 flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="rounded-md border border-[var(--pt-border)] bg-[var(--pt-panel)] px-2.5 py-1 text-xs hover:bg-white/5 disabled:opacity-40"
          title={dirty ? 'Сохранить изменения сейчас (Ctrl+S)' : 'Изменения сохранены'}
          disabled={!doc}
          onClick={() => {
            if (!doc) return
            const payload = buildFamFromGraph(doc, nodes, edges)
            host.requestSave(payload, filePath, false)
          }}
        >
          Сохранить
        </button>
      </div>

      <div className="ml-2 flex items-center gap-1 rounded-md border border-[var(--pt-border)] bg-[var(--pt-panel)] px-1.5">
        <input
          ref={inputRef}
          type="search"
          placeholder="Поиск по ФИО…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (e.shiftKey) searchPrev()
              else searchNext()
            }
          }}
          className="w-36 bg-transparent px-1 py-1 text-xs text-[var(--pt-text)] outline-none placeholder:text-[var(--pt-muted)] sm:w-48"
        />
        {hitLabel ? (
          <span className="px-1 text-[10px] tabular-nums text-[var(--pt-muted)]">{hitLabel}</span>
        ) : null}
        <button
          type="button"
          title="Предыдущий"
          className="rounded px-1.5 py-0.5 text-xs text-[var(--pt-muted)] hover:bg-white/5 disabled:opacity-30"
          disabled={!searchHits.length}
          onClick={searchPrev}
        >
          ↑
        </button>
        <button
          type="button"
          title="Следующий"
          className="rounded px-1.5 py-0.5 text-xs text-[var(--pt-muted)] hover:bg-white/5 disabled:opacity-30"
          disabled={!searchHits.length}
          onClick={searchNext}
        >
          ↓
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          title="Отменить (Ctrl+Z)"
          className="rounded-md border border-[var(--pt-border)] bg-[var(--pt-panel)] px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-40"
          disabled={pastLen === 0}
          onClick={undo}
        >
          ↶
        </button>
        <button
          type="button"
          title="Повторить (Ctrl+Y)"
          className="rounded-md border border-[var(--pt-border)] bg-[var(--pt-panel)] px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-40"
          disabled={futureLen === 0}
          onClick={redo}
        >
          ↷
        </button>
        <button
          type="button"
          className="rounded-md border border-[var(--pt-border)] bg-[var(--pt-panel)] px-2.5 py-1 text-xs hover:bg-white/5 disabled:opacity-40"
          disabled={!selectedId}
          onClick={() => {
            if (!selectedId) return
            if (confirm('Удалить выбранного человека и все его связи?')) removePerson(selectedId)
          }}
        >
          Удалить
        </button>
        <button
          type="button"
          title={phantomsVisible ? 'Скрыть фантом-связи' : 'Показать фантом-связи'}
          className={[
            'inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-md border px-2.5 text-xs leading-none',
            phantomsVisible
              ? 'border-[var(--pt-accent)]/60 bg-[var(--pt-accent)]/15 text-[var(--pt-accent)]'
              : 'border-[var(--pt-border)] bg-[var(--pt-panel)] hover:bg-white/5',
          ].join(' ')}
          onClick={() => setPhantomsVisible(!phantomsVisible)}
        >
          Фантомы
        </button>
        <button
          type="button"
          title={
            phantomsShowLabels
              ? 'Скрыть подписи линий-фантомов'
              : 'Показать подписи линий-фантомов'
          }
          className={[
            'inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-md border px-2.5 text-xs leading-none',
            phantomsShowLabels
              ? 'border-[var(--pt-accent)]/60 bg-[var(--pt-accent)]/15 text-[var(--pt-accent)]'
              : 'border-[var(--pt-border)] bg-[var(--pt-panel)] hover:bg-white/5',
          ].join(' ')}
          onClick={() => setPhantomsShowLabels(!phantomsShowLabels)}
        >
          Подписи фантомов
        </button>
        <button
          type="button"
          title={snapToGrid ? 'Отключить привязку к сетке' : 'Включить привязку к сетке'}
          className={[
            'inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-md border px-2.5 text-xs leading-none',
            snapToGrid
              ? 'border-[var(--pt-accent)]/60 bg-[var(--pt-accent)]/15 text-[var(--pt-accent)]'
              : 'border-[var(--pt-border)] bg-[var(--pt-panel)] hover:bg-white/5',
          ].join(' ')}
          onClick={() => setSnapToGrid(!snapToGrid)}
        >
          Сетка
        </button>
        <label
          className="flex items-center gap-1 rounded-md border border-[var(--pt-border)] bg-[var(--pt-panel)] px-1.5 py-0.5 text-[10px] text-[var(--pt-muted)]"
          title="Шаг сетки (px)"
        >
          шаг
          <input
            type="number"
            min={4}
            max={80}
            step={2}
            value={gridSize}
            disabled={!snapToGrid}
            onChange={(e) => setGridSize(Number(e.target.value))}
            className="w-10 bg-transparent text-xs text-[var(--pt-text)] outline-none disabled:opacity-40"
          />
        </label>
        <button
          type="button"
          className="rounded-md border border-[var(--pt-border)] bg-[var(--pt-panel)] px-2.5 py-1 text-xs hover:bg-white/5"
          onClick={onFit}
        >
          Вписать
        </button>
        <button
          type="button"
          title="Экспорт PNG"
          className="rounded-md border border-[var(--pt-border)] bg-[var(--pt-panel)] px-2.5 py-1 text-xs hover:bg-white/5 disabled:opacity-40"
          disabled={!doc || !nodes.length || exporting}
          onClick={() => void runExport('png')}
        >
          PNG
        </button>
        <button
          type="button"
          title="Экспорт PDF"
          className="rounded-md border border-[var(--pt-border)] bg-[var(--pt-panel)] px-2.5 py-1 text-xs hover:bg-white/5 disabled:opacity-40"
          disabled={!doc || !nodes.length || exporting}
          onClick={() => void runExport('pdf')}
        >
          PDF
        </button>

      </div>
    </header>
  )
}