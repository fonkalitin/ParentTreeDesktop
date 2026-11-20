// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import type { FamDocument, FamNode } from '../types/fam'
import { formatPartialDateRu } from './partialDate'

export type CatalogPerson = {
  id: string
  label: string
  gender: 'M' | 'F'
  birth?: string
  death?: string
  year: number | null
  surname: string
  onCanvas: boolean
  sectionKey: string
}

export type SurnameGroup = {
  surname: string
  people: CatalogPerson[]
}

export type GenerationGroup = {
  key: string
  title: string
  sortYear: number
  surnames: SurnameGroup[]
  count: number
}

/** Visual catalog blocks: special shelves vs decade groups under a century. */
export type CatalogBlock =
  | { kind: 'shelf'; group: GenerationGroup }
  | { kind: 'century'; century: number; label: string; groups: GenerationGroup[] }

/** First word of the display name (Russian surname). */
export function surnameOf(label: string): string {
  const cleaned = label.trim()
  const m = cleaned.match(/^[\p{L}'’-]+/u)
  return m?.[0] ?? '—'
}

export function birthYearOf(birth?: string): number | null {
  if (!birth) return null
  const m = birth.match(/(18|19|20)\d{2}/)
  if (!m) return null
  const y = Number.parseInt(m[0], 10)
  return Number.isFinite(y) ? y : null
}

/** Decade bucket title, e.g. «1920–1929». */
export function decadeTitle(year: number): string {
  const start = Math.floor(year / 10) * 10
  return `${start}–${start + 9}`
}

export function decadeKey(year: number): string {
  return `d${Math.floor(year / 10) * 10}`
}

/** Resolve which catalog shelf a person belongs to. */
export function sectionKeyOf(n: FamNode): string {
  const year = birthYearOf(n.data.birth)
  if (year != null) return decadeKey(year)
  // Explicit «вне категорий» only when pinned that way on add
  if (n.data.catalogSection === 'uncategorized') return 'uncategorized'
  // «Без года» — selected shelf or legacy people without a birth year
  return 'unknown'
}

export function sectionTitle(key: string): string {
  if (key === 'uncategorized') return 'Вне категорий'
  if (key === 'unknown') return 'Без года рождения'
  if (key.startsWith('d')) {
    const y = Number.parseInt(key.slice(1), 10)
    if (Number.isFinite(y)) return `Поколение ${decadeTitle(y)}`
  }
  return key
}

export function sortYearOfKey(key: string): number {
  if (key === 'uncategorized') return -1
  if (key === 'unknown') return 9999
  if (key.startsWith('d')) {
    const y = Number.parseInt(key.slice(1), 10)
    return Number.isFinite(y) ? y : 5000
  }
  return 5000
}

/** Century ordinal for a decade shelf, e.g. d1880 → 19 (XIX). */
export function centuryOfKey(key: string): number | null {
  if (!key.startsWith('d')) return null
  const y = Number.parseInt(key.slice(1), 10)
  if (!Number.isFinite(y)) return null
  return Math.floor(y / 100) + 1
}

const ROMAN: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
]

export function toRoman(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return String(n)
  let rest = Math.floor(n)
  let out = ''
  for (const [value, glyph] of ROMAN) {
    while (rest >= value) {
      out += glyph
      rest -= value
    }
  }
  return out
}

/** e.g. 19 → «XIX ВЕК». */
export function centuryLabel(century: number): string {
  return `${toRoman(century)} ВЕК`
}

/** Fold sorted generation shelves into century-marked catalog blocks. */
export function buildCatalogBlocks(groups: GenerationGroup[]): CatalogBlock[] {
  const blocks: CatalogBlock[] = []
  let centuryBuf: GenerationGroup[] | null = null
  let centuryNum: number | null = null

  const flushCentury = () => {
    if (centuryNum != null && centuryBuf && centuryBuf.length > 0) {
      blocks.push({
        kind: 'century',
        century: centuryNum,
        label: centuryLabel(centuryNum),
        groups: centuryBuf,
      })
    }
    centuryBuf = null
    centuryNum = null
  }

  for (const g of groups) {
    const c = centuryOfKey(g.key)
    if (c == null) {
      flushCentury()
      blocks.push({ kind: 'shelf', group: g })
      continue
    }
    if (centuryNum !== c) {
      flushCentury()
      centuryNum = c
      centuryBuf = [g]
    } else {
      centuryBuf!.push(g)
    }
  }
  flushCentury()
  return blocks
}

/** Seed birth year so a new person lands in the selected decade shelf. */
export function birthSeedForGenKey(key: string | null): {
  birth?: string
  catalogSection?: 'uncategorized' | 'unknown'
} {
  if (!key) return { catalogSection: 'uncategorized' }
  if (key === 'unknown') return { catalogSection: 'unknown' }
  if (key === 'uncategorized') return { catalogSection: 'uncategorized' }
  if (key.startsWith('d')) {
    const y = Number.parseInt(key.slice(1), 10)
    if (Number.isFinite(y)) return { birth: String(y) }
  }
  return { catalogSection: 'uncategorized' }
}

export function buildCatalogGroups(
  doc: FamDocument | null,
  placedIds: Set<string>,
  query = '',
): GenerationGroup[] {
  if (!doc) return emptyShelves()

  const q = query.trim().toLowerCase()

  const people: CatalogPerson[] = doc.nodes
    .map((n: FamNode) => {
      const year = birthYearOf(n.data.birth)
      return {
        id: n.id,
        label: n.data.label,
        gender: n.data.gender,
        birth: n.data.birth,
        death: n.data.death,
        year,
        surname: surnameOf(n.data.label),
        onCanvas: placedIds.has(n.id),
        sectionKey: sectionKeyOf(n),
      }
    })
    .filter((p) => {
      if (!q) return true
      const birthDisp = formatPartialDateRu(p.birth).toLowerCase()
      const deathDisp = formatPartialDateRu(p.death).toLowerCase()
      return (
        p.label.toLowerCase().includes(q) ||
        p.surname.toLowerCase().includes(q) ||
        (p.birth ?? '').includes(q) ||
        (p.death ?? '').includes(q) ||
        birthDisp.includes(q) ||
        deathDisp.includes(q)
      )
    })

  const byGen = new Map<string, CatalogPerson[]>()
  // Always keep selectable shelves visible
  byGen.set('uncategorized', [])
  byGen.set('unknown', [])

  for (const p of people) {
    const list = byGen.get(p.sectionKey) ?? []
    list.push(p)
    byGen.set(p.sectionKey, list)
  }

  const groups: GenerationGroup[] = []
  for (const [key, list] of byGen) {
    const bySur = new Map<string, CatalogPerson[]>()
    for (const p of list) {
      const arr = bySur.get(p.surname) ?? []
      arr.push(p)
      bySur.set(p.surname, arr)
    }

    const surnames: SurnameGroup[] = [...bySur.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'ru'))
      .map(([surname, peeps]) => ({
        surname,
        people: peeps.sort((a, b) => {
          const ya = a.year ?? 9999
          const yb = b.year ?? 9999
          if (ya !== yb) return ya - yb
          return a.label.localeCompare(b.label, 'ru')
        }),
      }))

    groups.push({
      key,
      title: sectionTitle(key),
      sortYear: sortYearOfKey(key),
      surnames,
      count: list.length,
    })
  }

  return groups.sort((a, b) => a.sortYear - b.sortYear)
}

function emptyShelves(): GenerationGroup[] {
  return [
    {
      key: 'uncategorized',
      title: sectionTitle('uncategorized'),
      sortYear: sortYearOfKey('uncategorized'),
      surnames: [],
      count: 0,
    },
    {
      key: 'unknown',
      title: sectionTitle('unknown'),
      sortYear: sortYearOfKey('unknown'),
      surnames: [],
      count: 0,
    },
  ]
}

export const DND_PERSON_MIME = 'application/x-parenttree-person'
