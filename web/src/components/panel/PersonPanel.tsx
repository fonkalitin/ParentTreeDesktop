// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import { useEffect, useRef, useState } from 'react'
import type { Attachment, FamPersonData } from '../../types/fam'
import { toPhotoRef, toAttachment } from '../../lib/files'
import { resolveMediaUrl } from '../../lib/media'
import { relationsOf } from '../../lib/graphOps'
import { useTreeStore } from '../../store/treeStore'
import { PartialDateField } from '../PartialDateField'
import { PhotoCropDialog } from '../PhotoCropDialog'

type Props = {
  personId: string
  data: FamPersonData
  onChange: (personId: string, patch: Partial<FamPersonData>) => void
  onClose: () => void
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

type PendingPhoto = { url: string; fileName: string }

export function PersonPanel({ personId, data, onChange, onClose }: Props) {
  const photoInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const photoUrl = resolveMediaUrl(data.photoRef ?? data.photo)
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null)
  const doc = useTreeStore((s) => s.doc)
  const addSpouseFor = useTreeStore((s) => s.addSpouseFor)
  const addChildFor = useTreeStore((s) => s.addChildFor)
  const startLink = useTreeStore((s) => s.startLink)
  const unlinkEdge = useTreeStore((s) => s.unlinkEdge)
  const removePerson = useTreeStore((s) => s.removePerson)
  const selectPerson = useTreeStore((s) => s.selectPerson)

  const rel = doc
    ? relationsOf(doc, personId)
    : { spouses: [], siblings: [], parents: [], children: [] }
  const hasDeathDate = Boolean(data.death && String(data.death).trim())

  useEffect(() => {
    return () => {
      if (pendingPhoto?.url.startsWith('blob:')) URL.revokeObjectURL(pendingPhoto.url)
    }
  }, [pendingPhoto])

  function clearPendingPhoto() {
    setPendingPhoto((prev) => {
      if (prev?.url.startsWith('blob:')) URL.revokeObjectURL(prev.url)
      return null
    })
  }

  function onPhotoSelected(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Нужен файл изображения')
      return
    }
    clearPendingPhoto()
    setPendingPhoto({
      url: URL.createObjectURL(file),
      fileName: file.name,
    })
  }

  async function applyCroppedPhoto(file: File) {
    const photoRef = await toPhotoRef(file)
    onChange(personId, { photoRef, photo: null })
    clearPendingPhoto()
  }

  function openExistingPhotoEditor() {
    if (!photoUrl) return
    clearPendingPhoto()
    setPendingPhoto({
      url: photoUrl,
      fileName: data.photoRef?.name ?? 'photo.jpg',
    })
  }

  async function onFilesSelected(files: FileList | null) {
    if (!files?.length) return
    const added: Attachment[] = []
    for (const file of Array.from(files)) {
      added.push(await toAttachment(file))
    }
    onChange(personId, {
      attachments: [...(data.attachments ?? []), ...added],
    })
  }

  function removeAttachment(id: string) {
    onChange(personId, {
      attachments: (data.attachments ?? []).filter((a) => a.id !== id),
    })
  }

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-[var(--pt-border)] bg-[var(--pt-panel)]">
      <div className="flex items-center justify-between border-b border-[var(--pt-border)] px-3 py-2">
        <div className="text-sm font-semibold">Карточка человека</div>
        <button
          type="button"
          className="rounded px-2 py-1 text-xs text-[var(--pt-muted)] hover:bg-white/5"
          onClick={onClose}
        >
          Закрыть
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
        <div className="overflow-hidden rounded-lg border border-[var(--pt-border)] bg-[#121820]">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="h-44 w-full object-cover" />
          ) : (
            <div className="flex h-44 items-center justify-center text-sm text-[var(--pt-muted)]">
              Нет фото
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md bg-[var(--pt-accent)] px-2.5 py-1.5 text-xs font-medium text-slate-950"
            onClick={() => photoInput.current?.click()}
          >
            Фото на карточку
          </button>
          {photoUrl ? (
            <>
              <button
                type="button"
                className="rounded-md border border-[var(--pt-border)] px-2.5 py-1.5 text-xs text-[var(--pt-muted)] hover:bg-white/5"
                onClick={openExistingPhotoEditor}
              >
                Изменить кадр
              </button>
              <button
                type="button"
                className="rounded-md border border-[var(--pt-border)] px-2.5 py-1.5 text-xs text-[var(--pt-muted)] hover:bg-white/5"
                onClick={() => onChange(personId, { photoRef: null, photo: null })}
              >
                Убрать фото
              </button>
            </>
          ) : null}
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              onPhotoSelected(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>

        <label className="block space-y-1 text-xs">
          <span className="text-[var(--pt-muted)]">ФИО</span>
          <input
            className="w-full rounded-md border border-[var(--pt-border)] bg-[var(--pt-bg-elevated)] px-2 py-1.5 text-sm"
            value={data.label}
            onChange={(e) => onChange(personId, { label: e.target.value })}
          />
        </label>

        <div className="grid grid-cols-1 gap-3">
          <PartialDateField
            label="Дата рождения"
            value={data.birth}
            onChange={(birth) => onChange(personId, { birth })}
          />
          <PartialDateField
            label="Дата смерти"
            value={data.death}
            onChange={(death) => onChange(personId, { death })}
          />
        </div>

        <label className="block space-y-1 text-xs">
          <span className="text-[var(--pt-muted)]">Пол</span>
          <select
            className="w-full rounded-md border border-[var(--pt-border)] bg-[var(--pt-bg-elevated)] px-2 py-1.5 text-sm"
            value={data.gender}
            onChange={(e) => onChange(personId, { gender: e.target.value as 'M' | 'F' })}
          >
            <option value="M">Мужской</option>
            <option value="F">Женский</option>
          </select>
        </label>

        {data.gender === 'F' ? (
          <label className="block space-y-1 text-xs">
            <span className="text-[var(--pt-muted)]">Девичья фамилия</span>
            <input
              className="w-full rounded-md border border-[var(--pt-border)] bg-[var(--pt-bg-elevated)] px-2 py-1.5 text-sm"
              value={data.maidenName ?? ''}
              onChange={(e) => onChange(personId, { maidenName: e.target.value })}
            />
          </label>
        ) : null}

        <section className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--pt-muted)]">
            География
          </div>
          <label className="block space-y-1 text-xs">
            <span className="text-[var(--pt-muted)]">Место рождения</span>
            <input
              className="w-full rounded-md border border-[var(--pt-border)] bg-[var(--pt-bg-elevated)] px-2 py-1.5 text-sm"
              value={data.birthPlace ?? ''}
              onChange={(e) => onChange(personId, { birthPlace: e.target.value })}
            />
          </label>
          <label className="block space-y-1 text-xs">
            <span className="text-[var(--pt-muted)]">Место смерти</span>
            <input
              className="w-full rounded-md border border-[var(--pt-border)] bg-[var(--pt-bg-elevated)] px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              value={data.deathPlace ?? ''}
              disabled={!hasDeathDate}
              title={
                hasDeathDate
                  ? undefined
                  : 'Укажите дату смерти, чтобы заполнить место смерти'
              }
              onChange={(e) => onChange(personId, { deathPlace: e.target.value })}
            />
          </label>
        </section>

        <label className="block space-y-1 text-xs">
          <span className="text-[var(--pt-muted)]">Заметки</span>
          <textarea
            className="min-h-[72px] w-full rounded-md border border-[var(--pt-border)] bg-[var(--pt-bg-elevated)] px-2 py-1.5 text-sm"
            value={data.notes ?? ''}
            onChange={(e) => onChange(personId, { notes: e.target.value })}
          />
        </label>

        <section className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--pt-muted)]">
            Родство
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="rounded-md border border-[var(--pt-border)] px-2 py-1 text-[11px] hover:bg-white/5"
              onClick={() => addSpouseFor(personId)}
            >
              + Супруг
            </button>
            <button
              type="button"
              className="rounded-md border border-[var(--pt-border)] px-2 py-1 text-[11px] hover:bg-white/5"
              onClick={() => addChildFor(personId)}
            >
              + Ребёнок
            </button>
            <button
              type="button"
              className="rounded-md border border-[var(--pt-border)] px-2 py-1 text-[11px] hover:bg-white/5"
              onClick={() => startLink(personId, 'spouse')}
            >
              Брак с…
            </button>
            <button
              type="button"
              className="rounded-md border border-[var(--pt-border)] px-2 py-1 text-[11px] hover:bg-white/5"
              onClick={() => startLink(personId, 'parent')}
            >
              Родитель для…
            </button>
          </div>

          <RelationGroup
            title="Супруги"
            items={rel.spouses}
            onOpen={selectPerson}
            onUnlink={unlinkEdge}
          />
          <RelationGroup
            title="Братья / сёстры"
            items={rel.siblings}
            onOpen={selectPerson}
            onUnlink={unlinkEdge}
          />
          <RelationGroup
            title="Родители"
            items={rel.parents}
            onOpen={selectPerson}
            onUnlink={unlinkEdge}
          />
          <RelationGroup
            title="Дети"
            items={rel.children}
            onOpen={selectPerson}
            onUnlink={unlinkEdge}
          />
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--pt-muted)]">
              Вложения
            </div>
            <button
              type="button"
              className="rounded-md border border-[var(--pt-border)] px-2 py-1 text-xs hover:bg-white/5"
              onClick={() => fileInput.current?.click()}
            >
              + Файл
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                void onFilesSelected(e.target.files)
                e.target.value = ''
              }}
            />
          </div>

          {(data.attachments ?? []).length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--pt-border)] px-3 py-4 text-center text-xs text-[var(--pt-muted)]">
              Документы, сканы, PDF — сюда
            </div>
          ) : (
            <ul className="space-y-1.5">
              {(data.attachments ?? []).map((a) => {
                const href = resolveMediaUrl(a)
                return (
                  <li
                    key={a.id}
                    className="flex items-center gap-2 rounded-md border border-[var(--pt-border)] bg-[var(--pt-bg-elevated)] px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      {href ? (
                        <a
                          href={href}
                          download={a.name}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-xs text-[var(--pt-accent)] hover:underline"
                        >
                          {a.name}
                        </a>
                      ) : (
                        <div className="truncate text-xs">{a.name}</div>
                      )}
                      <div className="text-[10px] text-[var(--pt-muted)]">
                        {a.mimeType} · {formatSize(a.size)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-xs text-rose-300 hover:underline"
                      onClick={() => removeAttachment(a.id)}
                    >
                      удалить
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <button
          type="button"
          className="w-full rounded-md border border-rose-800/60 px-2 py-2 text-xs text-rose-300 hover:bg-rose-950/40"
          onClick={() => {
            if (confirm('Удалить человека и все его связи?')) {
              removePerson(personId)
              onClose()
            }
          }}
        >
          Удалить человека
        </button>
      </div>

      {pendingPhoto ? (
        <PhotoCropDialog
          imageUrl={pendingPhoto.url}
          fileName={pendingPhoto.fileName}
          onCancel={clearPendingPhoto}
          onApply={applyCroppedPhoto}
        />
      ) : null}
    </aside>
  )
}

function RelationGroup({
  title,
  items,
  onOpen,
  onUnlink,
}: {
  title: string
  items: { edgeId: string; id: string; label: string }[]
  onOpen: (id: string) => void
  onUnlink: (edgeId: string) => void
}) {
  if (!items.length) {
    return (
      <div className="text-[11px] text-[var(--pt-muted)]">
        {title}: —
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <div className="text-[11px] text-[var(--pt-muted)]">{title}</div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li
            key={item.edgeId}
            className="flex items-center gap-2 rounded-md border border-[var(--pt-border)] bg-[var(--pt-bg-elevated)] px-2 py-1"
          >
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-xs text-[var(--pt-accent)] hover:underline"
              onClick={() => onOpen(item.id)}
            >
              {item.label}
            </button>
            <button
              type="button"
              className="text-[10px] text-rose-300 hover:underline"
              onClick={() => onUnlink(item.edgeId)}
            >
              отвязать
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
