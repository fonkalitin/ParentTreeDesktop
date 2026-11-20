// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import { useEffect, useId, useRef, useState } from 'react'
import {
  MONTH_OPTIONS_RU,
  daysInMonth,
  emptyPartialDate,
  parsePartialDate,
  sanitizePartialDate,
  serializePartialDate,
  weekdayMondayFirst,
  type PartialDate,
} from '../lib/partialDate'

type Props = {
  label: string
  value?: string
  onChange: (next: string | undefined) => void
}

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

export function PartialDateField({ label, value, onChange }: Props) {
  const parsed = parsePartialDate(value)
  const [open, setOpen] = useState(false)
  const [calYear, setCalYear] = useState(() => parsed.year ?? new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(() => parsed.month ?? new Date().getMonth() + 1)
  const rootRef = useRef<HTMLDivElement>(null)
  const popId = useId()

  useEffect(() => {
    if (!open) return
    setCalYear(parsed.year ?? new Date().getFullYear())
    setCalMonth(parsed.month ?? new Date().getMonth() + 1)
  }, [open, parsed.year, parsed.month])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function commit(next: PartialDate) {
    onChange(serializePartialDate(sanitizePartialDate(next)))
  }

  function setYear(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) {
      commit(emptyPartialDate())
      return
    }
    const y = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(y)) return
    commit({ ...parsed, year: y })
  }

  function setMonth(raw: string) {
    if (!raw) {
      commit({ ...parsed, month: null, day: null })
      return
    }
    const m = Number.parseInt(raw, 10)
    commit({ ...parsed, month: m })
  }

  function setDay(raw: string) {
    if (!raw) {
      commit({ ...parsed, day: null })
      return
    }
    const d = Number.parseInt(raw, 10)
    commit({ ...parsed, day: d })
  }

  function pickDay(day: number) {
    commit({ year: calYear, month: calMonth, day })
    setOpen(false)
  }

  function applyMonthOnly() {
    commit({ year: calYear, month: calMonth, day: null })
    setOpen(false)
  }

  function applyYearOnly() {
    commit({ year: calYear, month: null, day: null })
    setOpen(false)
  }

  function clearAll() {
    commit(emptyPartialDate())
    setOpen(false)
  }

  const dayMax =
    parsed.month != null ? daysInMonth(parsed.year ?? 2000, parsed.month) : 0
  const dayOptions = Array.from({ length: dayMax }, (_, i) => i + 1)

  const cells = buildCalendarCells(calYear, calMonth)

  return (
    <div ref={rootRef} className="relative block space-y-1 text-xs">
      <span className="text-[var(--pt-muted)]">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          inputMode="numeric"
          placeholder="год"
          min={1}
          max={9999}
          className="w-[4.5rem] rounded-md border border-[var(--pt-border)] bg-[var(--pt-bg-elevated)] px-2 py-1.5 text-sm"
          value={parsed.year ?? ''}
          onChange={(e) => setYear(e.target.value)}
          aria-label={`${label}: год`}
        />
        <select
          className="min-w-0 flex-1 rounded-md border border-[var(--pt-border)] bg-[var(--pt-bg-elevated)] px-1.5 py-1.5 text-sm"
          value={parsed.month ?? ''}
          onChange={(e) => setMonth(e.target.value)}
          aria-label={`${label}: месяц`}
          disabled={parsed.year == null}
        >
          <option value="">мес.</option>
          {MONTH_OPTIONS_RU.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label.slice(0, 3)}
            </option>
          ))}
        </select>
        <select
          className="w-[3.25rem] rounded-md border border-[var(--pt-border)] bg-[var(--pt-bg-elevated)] px-1 py-1.5 text-sm"
          value={parsed.day ?? ''}
          onChange={(e) => setDay(e.target.value)}
          aria-label={`${label}: день`}
          disabled={parsed.year == null || parsed.month == null}
        >
          <option value="">д.</option>
          {dayOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="shrink-0 rounded-md border border-[var(--pt-border)] px-2 py-1.5 text-sm hover:bg-white/5 disabled:opacity-40"
          title="Календарь"
          aria-label={`${label}: календарь`}
          aria-expanded={open}
          aria-controls={popId}
          onClick={() => {
            if (parsed.year == null) {
              const y = new Date().getFullYear()
              commit({ year: y, month: null, day: null })
              setCalYear(y)
            }
            setOpen((v) => !v)
          }}
        >
          📅
        </button>
      </div>

      {open ? (
        <div
          id={popId}
          className="absolute left-0 right-0 z-30 mt-1 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-panel)] p-2 shadow-xl"
          role="dialog"
          aria-label={`Календарь: ${label}`}
        >
          <div className="mb-2 flex items-center justify-between gap-1">
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-sm hover:bg-white/5"
              onClick={() => {
                if (calMonth === 1) {
                  setCalMonth(12)
                  setCalYear((y) => y - 1)
                } else setCalMonth((m) => m - 1)
              }}
              aria-label="Предыдущий месяц"
            >
              ‹
            </button>
            <div className="text-[11px] font-medium capitalize text-[var(--pt-text)]">
              {MONTH_OPTIONS_RU[calMonth - 1]?.label} {calYear}
            </div>
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-sm hover:bg-white/5"
              onClick={() => {
                if (calMonth === 12) {
                  setCalMonth(1)
                  setCalYear((y) => y + 1)
                } else setCalMonth((m) => m + 1)
              }}
              aria-label="Следующий месяц"
            >
              ›
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[9px] text-[var(--pt-muted)]">
            {WEEKDAYS.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((cell, i) =>
              cell == null ? (
                <div key={`e-${i}`} />
              ) : (
                <button
                  key={cell}
                  type="button"
                  className={[
                    'rounded py-1 text-[11px] hover:bg-[var(--pt-accent)]/25',
                    parsed.year === calYear &&
                    parsed.month === calMonth &&
                    parsed.day === cell
                      ? 'bg-[var(--pt-accent)] font-semibold text-slate-950'
                      : 'text-[var(--pt-text)]',
                  ].join(' ')}
                  onClick={() => pickDay(cell)}
                >
                  {cell}
                </button>
              ),
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-1 border-t border-[var(--pt-border)] pt-2">
            <button
              type="button"
              className="rounded border border-[var(--pt-border)] px-1.5 py-0.5 text-[10px] hover:bg-white/5"
              onClick={applyYearOnly}
              title="Оставить только год"
            >
              только год
            </button>
            <button
              type="button"
              className="rounded border border-[var(--pt-border)] px-1.5 py-0.5 text-[10px] hover:bg-white/5"
              onClick={applyMonthOnly}
              title="Год и месяц без дня"
            >
              год + месяц
            </button>
            <button
              type="button"
              className="rounded border border-[var(--pt-border)] px-1.5 py-0.5 text-[10px] text-rose-300 hover:bg-rose-950/40"
              onClick={clearAll}
            >
              очистить
            </button>
          </div>
          <p className="mt-1.5 text-[9px] leading-snug text-[var(--pt-muted)]">
            День и месяц можно не указывать, если неизвестны.
          </p>
        </div>
      ) : null}
    </div>
  )
}

function buildCalendarCells(year: number, month: number): (number | null)[] {
  const first = weekdayMondayFirst(year, month, 1)
  const count = daysInMonth(year, month)
  const cells: (number | null)[] = []
  for (let i = 0; i < first; i++) cells.push(null)
  for (let d = 1; d <= count; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}
