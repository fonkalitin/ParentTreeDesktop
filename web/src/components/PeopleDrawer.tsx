// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { useTreeStore } from '../store/treeStore'
import {
  birthSeedForGenKey,
  buildCatalogBlocks,
  buildCatalogGroups,
  DND_PERSON_MIME,
  sectionTitle,
  type GenerationGroup,
} from '../lib/peopleCatalog'
import { DND_CLUSTER_TEMPLATE_MIME, fieldPersonIds } from '../lib/clusterGeometry'
import { formatLifespanRu } from '../lib/partialDate'
import type { GenderCode } from '../types/fam'

type Props = {
  open: boolean
  onToggle: () => void
}

export function PeopleDrawer({ open, onToggle }: Props) {
  const doc = useTreeStore((s) => s.doc)
  const nodes = useTreeStore((s) => s.nodes)
  const activeGenKey = useTreeStore((s) => s.activeGenKey)
  const setActiveGenKey = useTreeStore((s) => s.setActiveGenKey)
  const addBlankPerson = useTreeStore((s) => s.addBlankPerson)
  const requestFocus = useTreeStore((s) => s.requestFocus)
  const selectPerson = useTreeStore((s) => s.selectPerson)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('Новый человек')
  const [newGender, setNewGender] = useState<GenderCode>('M')
  /** null = все открыты (дефолт); иначе явный набор открытых полок. */
  const [openShelves, setOpenShelves] = useState<Set<string> | null>(null)
  const labelRef = useRef<HTMLInputElement>(null)

  const placedIds = useMemo(
    () => new Set(fieldPersonIds(doc, nodes)),
    [doc, nodes],
  )
  const groups = useMemo(
    () => buildCatalogGroups(doc, placedIds, query),
    [doc, placedIds, query],
  )
  const blocks = useMemo(() => buildCatalogBlocks(groups), [groups])
  const shelfKeys = useMemo(() => groups.map((g) => g.key), [groups])

  const total = doc?.nodes.length ?? 0
  const onField = nodes.length
  const activeTitle = activeGenKey ? sectionTitle(activeGenKey) : null

  function isShelfOpen(key: string) {
    if (openShelves === null) return true
    return openShelves.has(key)
  }

  function setShelfOpen(key: string, open: boolean) {
    setOpenShelves((prev) => {
      const next = new Set(prev ?? shelfKeys)
      if (open) next.add(key)
      else next.delete(key)
      return next
    })
  }

  function expandAllShelves() {
    setOpenShelves(new Set(shelfKeys))
  }

  function collapseAllShelves() {
    setOpenShelves(new Set())
  }

  function openAddForm() {
    setNewLabel('Новый человек')
    setNewGender('M')
    setAdding(true)
    queueMicrotask(() => {
      labelRef.current?.focus()
      labelRef.current?.select()
    })
  }

  function cancelAdd() {
    setAdding(false)
  }

  function submitAdd(e?: FormEvent) {
    e?.preventDefault()
    const seed = birthSeedForGenKey(activeGenKey)
    const id = addBlankPerson(
      {
        label: newLabel.trim() || 'Новый человек',
        gender: newGender,
        birth: seed.birth,
        catalogSection: seed.catalogSection,
      },
      { placeOnCanvas: false },
    )
    setAdding(false)
    if (id) selectPerson(id)
  }

  return (
    <>
      <button
        type="button"
        className="absolute left-0 top-1/2 z-30 -translate-y-1/2 rounded-r-md border border-l-0 border-[var(--pt-border)] bg-[var(--pt-panel)] px-1.5 py-3 text-xs text-[var(--pt-muted)] shadow-lg hover:text-[var(--pt-text)]"
        style={{ marginLeft: open ? 300 : 0 }}
        onClick={onToggle}
        title={open ? 'Скрыть каталог' : 'Каталог людей'}
      >
        {open ? '‹' : '›'}
      </button>

      <aside
        className="absolute left-0 top-0 z-20 flex h-full flex-col border-r border-[var(--pt-border)] bg-[var(--pt-panel)]/95 shadow-2xl backdrop-blur transition-transform duration-200"
        style={{
          width: 300,
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
        }}
      >
        <div className="shrink-0 border-b border-[var(--pt-border)] px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[var(--pt-text)]">Каталог людей</div>
              <div className="mt-0.5 text-[11px] text-[var(--pt-muted)]">
                {onField} на поле · {total} в базе
              </div>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md bg-[var(--pt-accent)] px-2.5 py-1 text-xs font-medium text-slate-950 hover:brightness-110"
              onClick={openAddForm}
              title={
                activeTitle
                  ? `Добавить в «${activeTitle}»`
                  : 'Добавить вне категорий (пока нет даты рождения)'
              }
            >
              + Человек
            </button>
          </div>

          {adding ? (
            <form
              className="mt-2 space-y-2 rounded-md border border-[var(--pt-accent)]/40 bg-[var(--pt-bg)]/70 p-2"
              onSubmit={submitAdd}
            >
              <label className="block space-y-1 text-[10px] text-[var(--pt-muted)]">
                ФИО
                <input
                  ref={labelRef}
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="w-full rounded-md border border-[var(--pt-border)] bg-[var(--pt-panel)] px-2 py-1.5 text-xs text-[var(--pt-text)] outline-none focus:border-[var(--pt-accent)]"
                />
              </label>
              <label className="block space-y-1 text-[10px] text-[var(--pt-muted)]">
                Пол
                <select
                  value={newGender}
                  onChange={(e) => setNewGender(e.target.value as GenderCode)}
                  className="w-full rounded-md border border-[var(--pt-border)] bg-[var(--pt-panel)] px-2 py-1.5 text-xs text-[var(--pt-text)] outline-none focus:border-[var(--pt-accent)]"
                >
                  <option value="M">Мужской</option>
                  <option value="F">Женский</option>
                </select>
              </label>
              <div className="flex items-center justify-end gap-1.5 pt-0.5">
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] text-[var(--pt-muted)] hover:bg-white/5 hover:text-[var(--pt-text)]"
                  onClick={cancelAdd}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[var(--pt-accent)] px-2.5 py-1 text-[11px] font-medium text-slate-950 hover:brightness-110"
                >
                  Добавить
                </button>
              </div>
            </form>
          ) : null}

          <div
            className={[
              'mt-2 rounded-md border px-2 py-1.5 text-[10px] leading-snug',
              activeGenKey
                ? 'border-[var(--pt-accent)]/50 bg-[var(--pt-accent)]/10 text-[var(--pt-text)]'
                : 'border-[var(--pt-border)] bg-[var(--pt-bg)]/50 text-[var(--pt-muted)]',
            ].join(' ')}
          >
            {activeTitle ? (
              <>
                Активный раздел:{' '}
                <span className="font-semibold text-[var(--pt-accent)]">{activeTitle}</span>
                <button
                  type="button"
                  className="ml-2 underline opacity-80 hover:opacity-100"
                  onClick={() => setActiveGenKey(null)}
                >
                  сбросить
                </button>
              </>
            ) : (
              <>Раздел не выбран — новый человек попадёт во «Вне категорий»</>
            )}
          </div>

          <div className="mt-2 flex items-center gap-1">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по имени, фамилии, году…"
              className="min-w-0 flex-1 rounded-md border border-[var(--pt-border)] bg-[var(--pt-bg)] px-2 py-1.5 text-xs text-[var(--pt-text)] outline-none placeholder:text-[var(--pt-muted)] focus:border-[var(--pt-accent)]"
            />
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--pt-border)] text-[11px] leading-none text-[var(--pt-muted)] hover:bg-white/5 hover:text-[var(--pt-text)]"
              onClick={expandAllShelves}
              title="Развернуть все"
              aria-label="Развернуть все"
            >
              ▾
            </button>
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--pt-border)] text-[11px] leading-none text-[var(--pt-muted)] hover:bg-white/5 hover:text-[var(--pt-text)]"
              onClick={collapseAllShelves}
              title="Свернуть все"
              aria-label="Свернуть все"
            >
              ▸
            </button>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-[var(--pt-muted)]">
            Людей и группы — перетаскиванием на поле. Клик по разделу — активный для «+ Человек».
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <div className="mb-3 rounded-md border border-dashed border-[var(--pt-border)] bg-[var(--pt-bg)]/40 p-2">
            <div className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--pt-muted)]">
              На поле
            </div>
            <button
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DND_CLUSTER_TEMPLATE_MIME, 'custom')
                e.dataTransfer.setData('text/plain', 'cluster:custom')
                e.dataTransfer.effectAllowed = 'copy'
              }}
              className="flex w-full items-center gap-2 rounded-md border border-dashed border-[var(--pt-muted)]/45 bg-[var(--pt-panel)]/80 px-2 py-1.5 text-left transition hover:border-[var(--pt-muted)] hover:bg-[var(--pt-bg)]"
              title="Перетащите на поле"
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-dashed border-[var(--pt-muted)]/50 text-[11px] text-[var(--pt-muted)]"
                aria-hidden
              >
                ▦
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-[var(--pt-text)]">Группа</span>
                <span className="block text-[10px] text-[var(--pt-muted)]">
                  контейнер · перетащите, имя и тип — справа
                </span>
              </span>
            </button>
          </div>

          {groups.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-[var(--pt-muted)]">
              Никого не найдено
            </div>
          ) : (
            blocks.map((block) => {
              if (block.kind === 'shelf') {
                return (
                  <GenerationSection
                    key={block.group.key}
                    gen={block.group}
                    active={activeGenKey === block.group.key}
                    open={isShelfOpen(block.group.key)}
                    onOpenChange={(open) => setShelfOpen(block.group.key, open)}
                    onActivate={() => setActiveGenKey(block.group.key)}
                    onFocus={requestFocus}
                    onSelect={selectPerson}
                  />
                )
              }
              return (
                <div key={`c${block.century}`} className="catalog-century">
                  <div
                    className="catalog-century-sep"
                    role="separator"
                    aria-label={block.label}
                  >
                    <span className="catalog-century-sep__line" />
                    <span className="catalog-century-sep__label">{block.label}</span>
                  </div>
                  {block.groups.map((gen) => (
                    <GenerationSection
                      key={gen.key}
                      gen={gen}
                      active={activeGenKey === gen.key}
                      open={isShelfOpen(gen.key)}
                      onOpenChange={(v) => setShelfOpen(gen.key, v)}
                      onActivate={() => setActiveGenKey(gen.key)}
                      onFocus={requestFocus}
                      onSelect={selectPerson}
                    />
                  ))}
                </div>
              )
            })
          )}
        </div>
      </aside>
    </>
  )
}

type GenerationSectionProps = {
  gen: GenerationGroup
  active: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onActivate: () => void
  onFocus: (id: string) => void
  onSelect: (id: string) => void
}

function GenerationSection({
  gen,
  active,
  open,
  onOpenChange,
  onActivate,
  onFocus,
  onSelect,
}: GenerationSectionProps) {
  return (
    <details
      className="mb-2"
      open={open}
      onToggle={(e) => {
        const el = e.currentTarget
        if (el.open !== open) onOpenChange(el.open)
      }}
    >
      <summary
        className={[
          'cursor-pointer select-none rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition',
          active
            ? 'bg-[var(--pt-accent)]/20 text-[var(--pt-accent)] ring-1 ring-[var(--pt-accent)]/60'
            : 'text-[var(--pt-muted)] hover:bg-white/5',
        ].join(' ')}
        onClick={onActivate}
      >
        <span className="inline-flex items-center gap-1.5">
          <span
            className={[
              'inline-block h-2 w-2 rounded-full',
              active ? 'bg-[var(--pt-accent)]' : 'bg-[var(--pt-border)]',
            ].join(' ')}
          />
          {gen.title}
          <span className="font-normal normal-case opacity-70">({gen.count})</span>
          {active ? (
            <span className="rounded bg-[var(--pt-accent)]/30 px-1 py-0.5 text-[9px] font-medium normal-case tracking-normal">
              активен
            </span>
          ) : null}
        </span>
      </summary>
      <div className="mt-1 space-y-2 pl-1">
        {gen.surnames.length === 0 ? (
          <div className="px-2 py-2 text-[10px] text-[var(--pt-muted)]">Пусто</div>
        ) : (
          gen.surnames.map((sg) => (
            <div key={sg.surname}>
              <div className="mb-1 px-1 text-[10px] font-medium text-[var(--pt-accent)]">
                {sg.surname}
              </div>
              <ul className="space-y-1">
                {sg.people.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DND_PERSON_MIME, p.id)
                        e.dataTransfer.setData('text/plain', p.id)
                        e.dataTransfer.effectAllowed = 'copyMove'
                      }}
                      onClick={() => {
                        if (p.onCanvas) onFocus(p.id)
                        else onSelect(p.id)
                      }}
                      className={[
                        'flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left transition',
                        p.onCanvas
                          ? 'border-[var(--pt-accent)]/40 bg-[var(--pt-accent)]/10 opacity-70'
                          : 'border-[var(--pt-border)] bg-[var(--pt-bg)]/60 hover:border-[var(--pt-accent)]/50 hover:bg-[var(--pt-bg)]',
                      ].join(' ')}
                      title={
                        p.onCanvas ? 'Уже на поле — клик для фокуса' : 'Перетащите на поле'
                      }
                    >
                      <span
                        className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          background: p.gender === 'M' ? 'var(--pt-male)' : 'var(--pt-female)',
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-[var(--pt-text)]">
                          {p.label}
                        </span>
                        <span className="block text-[10px] text-[var(--pt-muted)]">
                          {formatLifespanRu(p.birth, p.death) ?? 'даты нет'}
                          {p.onCanvas ? ' · на поле' : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </details>
  )
}
