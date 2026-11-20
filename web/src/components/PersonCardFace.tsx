// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import type { HTMLAttributes } from 'react'
import type { PersonFlowData } from '../layout/layoutTree'
import { calcAge, resolveMediaUrl } from '../lib/media'
import { formatLifespanRu } from '../lib/partialDate'

function genBand(gen?: number): string {
  const g = gen ?? 0
  if (g <= 0) return 'var(--pt-gen-band-0)'
  if (g === 1) return 'var(--pt-gen-band-1)'
  if (g === 2) return 'var(--pt-gen-band-2)'
  return 'var(--pt-gen-band-3)'
}

type Props = {
  data: PersonFlowData
  selected?: boolean
  className?: string
  /** Extra classes on root (e.g. nodrag). */
  rootProps?: HTMLAttributes<HTMLDivElement>
}

/** Shared face of a person card (photo + name) — free node or nested in a cluster. */
export function PersonCardFace({ data, selected, className, rootProps }: Props) {
  const isMale = data.gender === 'M'
  const accent = isMale ? 'var(--pt-male)' : 'var(--pt-female)'
  const photoUrl = resolveMediaUrl(data.photoRef)
  const age = calcAge(data.birth, data.death)
  const years = formatLifespanRu(data.birth, data.death)
  const attachCount = data.attachments?.length ?? 0
  const role = data.kinshipRole ?? 'blood'
  const roleLabel =
    role === 'root' ? 'Основатель' : role === 'inlaw' ? 'В браке' : null

  return (
    <div
      {...rootProps}
      className={[
        'person-card relative w-[132px] cursor-pointer overflow-visible rounded-lg border bg-[var(--pt-card)] shadow-[0_6px_18px_rgba(0,0,0,0.4)]',
        selected ? 'person-card--selected' : '',
        data.searchHit && !selected ? 'ring-2 ring-amber-400/80 ring-offset-1 ring-offset-[var(--pt-bg)]' : '',
        role === 'root' ? 'person-card--root' : '',
        role === 'inlaw' ? 'person-card--inlaw' : '',
        data.isOrphan ? 'person-card--orphan' : '',
        className ?? '',
        rootProps?.className ?? '',
      ].join(' ')}
      style={{
        borderColor: accent,
        ...rootProps?.style,
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1 rounded-t-lg"
        style={{ background: genBand(data.generation) }}
        aria-hidden
      />

      <div className="relative h-[84px] overflow-hidden rounded-t-lg bg-[var(--pt-photo-bg)]">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="pointer-events-none h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div
            className="flex h-full w-full items-end justify-center pt-3"
            style={{ background: `linear-gradient(180deg, ${accent}33, transparent)` }}
          >
            <svg width="54" height="54" viewBox="0 0 24 24" fill={accent} opacity="0.85">
              <path d="M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12Zm0 2.25c-3.6 0-8.25 1.8-8.25 4.5V21h16.5v-2.25c0-2.7-4.65-4.5-8.25-4.5Z" />
            </svg>
          </div>
        )}

        {age != null ? (
          <div
            className="absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
            style={{ background: accent }}
          >
            {age} лет
          </div>
        ) : null}

        {data.hasSpouse ? (
          <div
            className="absolute left-1.5 top-1.5 h-2 w-2 rounded-full"
            style={{
              background: 'var(--pt-line-spouse)',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
            }}
            title="В браке"
            aria-hidden
          />
        ) : null}

        {attachCount > 0 ? (
          <div className="absolute bottom-1.5 left-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] text-slate-100">
            📎 {attachCount}
          </div>
        ) : null}
      </div>

      <div className="space-y-0.5 px-2.5 py-2">
        {roleLabel ? (
          <div
            className="truncate text-[9px] font-medium uppercase tracking-wide"
            style={{
              color: role === 'root' ? 'var(--pt-role-root)' : 'var(--pt-muted)',
            }}
          >
            {roleLabel}
          </div>
        ) : null}
        <div className="line-clamp-2 text-[12px] font-semibold leading-snug text-[var(--pt-text)]">
          {data.label}
        </div>
        {!isMale && data.maidenName?.trim() ? (
          <div className="truncate text-[9px] text-[var(--pt-muted)]" title={data.maidenName}>
            урожд. {data.maidenName.trim()}
          </div>
        ) : data.birthPlace?.trim() ? (
          <div className="truncate text-[9px] text-[var(--pt-muted)]" title={data.birthPlace}>
            {data.birthPlace.trim()}
          </div>
        ) : null}
        {years ? <div className="text-[10px] text-[var(--pt-muted)]">{years}</div> : null}
      </div>
    </div>
  )
}
