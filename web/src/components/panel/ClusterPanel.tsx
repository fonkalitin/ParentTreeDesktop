// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import { clusterKindLabel, isPhantomGroupKind } from '../../lib/clusterGeometry'
import type { FamCluster, FamClusterKind } from '../../types/fam'
import { useTreeStore } from '../../store/treeStore'
import { resolveMediaUrl } from '../../lib/media'

/** UI kinds — `household` kept in type for old files, hidden here. */
const KINDS: FamClusterKind[] = ['custom', 'children', 'parents', 'siblings']

type Props = {
  cluster: FamCluster
  onClose: () => void
}

function applyHint(kind: FamClusterKind): string {
  switch (kind) {
    case 'siblings':
      return 'Создаст связи «брат/сестра» между всеми участниками.'
    case 'children':
      return 'Создаст связи «брат/сестра» между участниками (группа детей).'
    case 'parents':
      return 'Двое → брак; если больше двух — брак только у первых двух.'
    default:
      return '«Группа» — только визуальный контейнер; реальные рёбра не создаются.'
  }
}

export function ClusterPanel({ cluster, onClose }: Props) {
  const doc = useTreeStore((s) => s.doc)
  const updateCluster = useTreeStore((s) => s.updateCluster)
  const setClusterCollapsed = useTreeStore((s) => s.setClusterCollapsed)
  const deleteCluster = useTreeStore((s) => s.deleteCluster)
  const applyClusterRelations = useTreeStore((s) => s.applyClusterRelations)
  const selectPerson = useTreeStore((s) => s.selectPerson)

  const members = cluster.memberIds
    .map((id) => doc?.nodes.find((n) => n.id === id))
    .filter(Boolean)

  const kindSelectValue: FamClusterKind = isPhantomGroupKind(cluster.kind)
    ? 'custom'
    : cluster.kind
  const phantomGroup = isPhantomGroupKind(cluster.kind)
  const canApply = !phantomGroup && members.length >= 2

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-[var(--pt-border)] bg-[var(--pt-panel)]">
      <div className="flex items-center justify-between border-b border-[var(--pt-border)] px-3 py-2">
        <div className="text-sm font-semibold">Контейнер группы</div>
        <button
          type="button"
          className="rounded px-2 py-1 text-xs text-[var(--pt-muted)] hover:bg-white/5"
          onClick={onClose}
        >
          Закрыть
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
        <label className="block space-y-1 text-[11px] text-[var(--pt-muted)]">
          Название
          <input
            type="text"
            value={cluster.label}
            onChange={(e) => updateCluster(cluster.id, { label: e.target.value })}
            className="w-full rounded-md border border-[var(--pt-border)] bg-[var(--pt-bg)] px-2 py-1.5 text-sm text-[var(--pt-text)] outline-none focus:border-[var(--pt-accent)]"
          />
        </label>

        <label className="block space-y-1 text-[11px] text-[var(--pt-muted)]">
          Тип
          <select
            value={kindSelectValue}
            onChange={(e) =>
              updateCluster(cluster.id, { kind: e.target.value as FamClusterKind })
            }
            className="w-full rounded-md border border-[var(--pt-border)] bg-[var(--pt-bg)] px-2 py-1.5 text-sm text-[var(--pt-text)] outline-none focus:border-[var(--pt-accent)]"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {clusterKindLabel(k)}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-2">
          <div className="text-[11px] font-medium text-[var(--pt-muted)]">Связь по типу</div>
          <p className="text-[10px] leading-snug text-[var(--pt-muted)]">
            {applyHint(cluster.kind)}
          </p>
          <button
            type="button"
            disabled={!canApply}
            className="w-full rounded-md border border-[var(--pt-accent)]/50 bg-[var(--pt-accent)]/15 px-2.5 py-1.5 text-[11px] text-[var(--pt-accent)] hover:bg-[var(--pt-accent)]/25 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => applyClusterRelations(cluster.id)}
            title={
              phantomGroup
                ? 'Для «Группа» реальные связи не назначаются'
                : members.length < 2
                  ? 'Добавьте минимум двух участников'
                  : 'Создать реальные связи в графе'
            }
          >
            Применить связь
          </button>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-medium text-[var(--pt-muted)]">Вид на поле</div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={[
                'rounded-md border px-2.5 py-1 text-[11px]',
                !cluster.compact
                  ? 'border-[var(--pt-accent)] bg-[var(--pt-accent)]/15 text-[var(--pt-accent)]'
                  : 'border-[var(--pt-border)] text-[var(--pt-muted)] hover:bg-white/5',
              ].join(' ')}
              onClick={() => updateCluster(cluster.id, { compact: false })}
            >
              Полные фото
            </button>
            <button
              type="button"
              className={[
                'rounded-md border px-2.5 py-1 text-[11px]',
                cluster.compact
                  ? 'border-[var(--pt-accent)] bg-[var(--pt-accent)]/15 text-[var(--pt-accent)]'
                  : 'border-[var(--pt-border)] text-[var(--pt-muted)] hover:bg-white/5',
              ].join(' ')}
              onClick={() => updateCluster(cluster.id, { compact: true })}
            >
              Мини-вид
            </button>
            <button
              type="button"
              className="rounded-md border border-[var(--pt-border)] px-2.5 py-1 text-[11px] text-[var(--pt-muted)] hover:bg-white/5"
              onClick={() => setClusterCollapsed(cluster.id, !cluster.collapsed)}
            >
              {cluster.collapsed ? 'Развернуть контейнер' : 'Свернуть контейнер'}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-medium text-[var(--pt-muted)]">Извлечение карточек</div>
          <button
            type="button"
            className={[
              'rounded-md border px-2.5 py-1.5 text-[11px]',
              cluster.locked !== false
                ? 'border-[var(--pt-accent)] bg-[var(--pt-accent)]/15 text-[var(--pt-accent)]'
                : 'border-[var(--pt-border)] text-[var(--pt-muted)] hover:bg-white/5',
            ].join(' ')}
            onClick={() =>
              updateCluster(cluster.id, { locked: !(cluster.locked !== false) })
            }
            title={
              cluster.locked !== false
                ? 'Сейчас нельзя вытащить участников перетаскиванием'
                : 'Участников можно вытащить на поле'
            }
          >
            {cluster.locked !== false ? '🔒 Заблокирован' : '🔓 Разблокирован'}
          </button>
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-medium text-[var(--pt-muted)]">
            Участники ({members.length})
          </div>
          {members.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--pt-border)] px-2 py-4 text-center text-[10px] text-[var(--pt-muted)]">
              Вложить / вытащить — перетаскиванием на поле
            </div>
          ) : (
            <ul className="space-y-1">
              {members.map((m) => {
                if (!m) return null
                const thumb = resolveMediaUrl(m.data.photoRef ?? m.data.photo)
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md border border-[var(--pt-border)] bg-[var(--pt-bg)]/50 px-2 py-1.5 text-left hover:bg-white/5"
                      onClick={() => selectPerson(m.id)}
                      title="Открыть карточку"
                    >
                      <span
                        className="h-8 w-8 shrink-0 overflow-hidden rounded bg-[#121820]"
                        style={{
                          boxShadow: `inset 0 0 0 1px ${
                            m.data.gender === 'M' ? 'var(--pt-male)' : 'var(--pt-female)'
                          }`,
                        }}
                      >
                        {thumb ? (
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-[var(--pt-text)]">
                        {m.data.label}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="space-y-1.5 border-t border-[var(--pt-border)] pt-3">
          <button
            type="button"
            className="w-full rounded-md border border-[var(--pt-border)] px-2 py-1.5 text-xs text-[var(--pt-text)] hover:bg-white/5"
            onClick={() => deleteCluster(cluster.id, true)}
          >
            Распустить · выложить рядом
          </button>
          <button
            type="button"
            className="w-full rounded-md border border-rose-900/50 px-2 py-1.5 text-xs text-rose-200 hover:bg-rose-950/40"
            onClick={() => {
              if (confirm('Удалить контейнер? Люди останутся на поле рядом.')) {
                deleteCluster(cluster.id, true)
              }
            }}
          >
            Удалить контейнер
          </button>
        </div>
      </div>
    </aside>
  )
}
