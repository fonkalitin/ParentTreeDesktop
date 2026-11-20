// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
/**
 * Partial dates for birth/death.
 * Stored as strings for backward compatibility with year-only files:
 *   "1990"       → year only
 *   "1990-03"    → year + month
 *   "1990-03-12" → full date
 */

export type PartialDate = {
  year: number | null
  month: number | null // 1–12
  day: number | null // 1–31
}

const MONTHS_RU = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
] as const

export const MONTH_OPTIONS_RU = MONTHS_RU.map((label, i) => ({
  value: i + 1,
  label,
}))

export function emptyPartialDate(): PartialDate {
  return { year: null, month: null, day: null }
}

export function parsePartialDate(raw?: string | null): PartialDate {
  if (!raw) return emptyPartialDate()
  const s = String(raw).trim()
  if (!s) return emptyPartialDate()

  // ISO-like: YYYY / YYYY-MM / YYYY-MM-DD
  const iso = s.match(/^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/)
  if (iso) {
    const year = Number.parseInt(iso[1], 10)
    const month = iso[2] ? Number.parseInt(iso[2], 10) : null
    const day = iso[3] ? Number.parseInt(iso[3], 10) : null
    return sanitizePartialDate({ year, month, day })
  }

  // Legacy / free text: pull first plausible year; ignore month/day
  const yMatch = s.match(/(18|19|20)\d{2}/)
  if (yMatch) {
    return sanitizePartialDate({
      year: Number.parseInt(yMatch[0], 10),
      month: null,
      day: null,
    })
  }

  return emptyPartialDate()
}

export function sanitizePartialDate(d: PartialDate): PartialDate {
  let year = d.year != null && Number.isFinite(d.year) ? Math.trunc(d.year) : null
  if (year != null && (year < 1 || year > 9999)) year = null

  let month = d.month != null && Number.isFinite(d.month) ? Math.trunc(d.month) : null
  if (month != null && (month < 1 || month > 12)) month = null

  let day = d.day != null && Number.isFinite(d.day) ? Math.trunc(d.day) : null
  if (month == null) day = null
  else if (day != null) {
    const max = daysInMonth(year ?? 2000, month)
    if (day < 1 || day > max) day = null
  }

  return { year, month, day }
}

export function serializePartialDate(d: PartialDate): string | undefined {
  const s = sanitizePartialDate(d)
  if (s.year == null) return undefined
  if (s.month == null) return String(s.year)
  const mm = String(s.month).padStart(2, '0')
  if (s.day == null) return `${s.year}-${mm}`
  const dd = String(s.day).padStart(2, '0')
  return `${s.year}-${mm}-${dd}`
}

/** Display: «1990», «март 1990», «12.03.1990». */
export function formatPartialDateRu(raw?: string | null): string {
  const d = parsePartialDate(raw)
  if (d.year == null) return ''
  if (d.month == null) return String(d.year)
  const monthName = MONTHS_RU[d.month - 1]
  if (d.day == null) return `${monthName} ${d.year}`
  const dd = String(d.day).padStart(2, '0')
  const mm = String(d.month).padStart(2, '0')
  return `${dd}.${mm}.${d.year}`
}

export function formatLifespanRu(birth?: string | null, death?: string | null): string | null {
  const b = formatPartialDateRu(birth)
  const d = formatPartialDateRu(death)
  if (!b && !d) return null
  return `${b || '?'} – ${d || '…'}`
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export function weekdayMondayFirst(year: number, month: number, day: number): number {
  // JS: 0=Sun…6=Sat → Mon-first 0…6
  const wd = new Date(year, month - 1, day).getDay()
  return (wd + 6) % 7
}
