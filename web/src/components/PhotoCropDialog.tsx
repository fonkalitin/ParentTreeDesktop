// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'

/** Matches PersonCardFace photo area: 132×84. */
export const CARD_PHOTO_ASPECT = 132 / 84

const PREVIEW_W = 330
const PREVIEW_H = Math.round(PREVIEW_W / CARD_PHOTO_ASPECT)
const EXPORT_W = 528
const EXPORT_H = Math.round(EXPORT_W / CARD_PHOTO_ASPECT)

const MIN_ZOOM = 0.25
const MAX_ZOOM = 3

type Props = {
  imageUrl: string
  fileName?: string
  onCancel: () => void
  onApply: (file: File) => void | Promise<void>
}

type DragState = {
  pointerId: number
  startX: number
  startY: number
  originOffsetX: number
  originOffsetY: number
}

function coverBaseScale(iw: number, ih: number, fw: number, fh: number) {
  return Math.max(fw / iw, fh / ih)
}

function clampOffsets(
  offsetX: number,
  offsetY: number,
  iw: number,
  ih: number,
  zoom: number,
  fw: number,
  fh: number,
) {
  const base = coverBaseScale(iw, ih, fw, fh)
  const scaledW = iw * base * zoom
  const scaledH = ih * base * zoom
  // Larger than frame: pan to crop edges. Smaller (zoom-out): pan within letterbox.
  const maxX = Math.abs(scaledW - fw) / 2
  const maxY = Math.abs(scaledH - fh) / 2
  return {
    offsetX: Math.min(maxX, Math.max(-maxX, offsetX)),
    offsetY: Math.min(maxY, Math.max(-maxY, offsetY)),
  }
}

async function renderCroppedFile(
  img: HTMLImageElement,
  zoom: number,
  offsetX: number,
  offsetY: number,
  fileName: string,
): Promise<File> {
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  const base = coverBaseScale(iw, ih, PREVIEW_W, PREVIEW_H)
  const scale = base * zoom
  const scaledW = iw * scale
  const scaledH = ih * scale
  const left = (PREVIEW_W - scaledW) / 2 + offsetX
  const top = (PREVIEW_H - scaledH) / 2 + offsetY

  // Map preview viewport → natural image coords, then draw into export canvas.
  const srcX = -left / scale
  const srcY = -top / scale
  const srcW = PREVIEW_W / scale
  const srcH = PREVIEW_H / scale

  const canvas = document.createElement('canvas')
  canvas.width = EXPORT_W
  canvas.height = EXPORT_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas недоступен')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#121820'
  ctx.fillRect(0, 0, EXPORT_W, EXPORT_H)
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, EXPORT_W, EXPORT_H)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Не удалось сохранить кадр'))),
      'image/jpeg',
      0.92,
    )
  })

  const baseName = (fileName || 'photo').replace(/\.[^.]+$/, '') || 'photo'
  return new File([blob], `${baseName}-card.jpg`, { type: 'image/jpeg' })
}

export function PhotoCropDialog({ imageUrl, fileName, onCancel, onApply }: Props) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [busy, setBusy] = useState(false)
  const dragRef = useRef<DragState | null>(null)

  useEffect(() => {
    setZoom(1)
    setOffsetX(0)
    setOffsetY(0)
    setNatural(null)
  }, [imageUrl])

  const onImgLoad = useCallback(() => {
    const img = imgRef.current
    if (!img) return
    setNatural({ w: img.naturalWidth, h: img.naturalHeight })
    setZoom(1)
    setOffsetX(0)
    setOffsetY(0)
  }, [])

  const applyClamp = useCallback(
    (ox: number, oy: number, z: number) => {
      if (!natural) return { offsetX: ox, offsetY: oy }
      return clampOffsets(ox, oy, natural.w, natural.h, z, PREVIEW_W, PREVIEW_H)
    },
    [natural],
  )

  const setZoomClamped = (next: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
    const clamped = applyClamp(offsetX, offsetY, z)
    setZoom(z)
    setOffsetX(clamped.offsetX)
    setOffsetY(clamped.offsetY)
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originOffsetX: offsetX,
      originOffsetY: offsetY,
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    const clamped = applyClamp(drag.originOffsetX + dx, drag.originOffsetY + dy, zoom)
    setOffsetX(clamped.offsetX)
    setOffsetY(clamped.offsetY)
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null
  }

  const imageStyle = (() => {
    if (!natural) return { opacity: 0 as const }
    const base = coverBaseScale(natural.w, natural.h, PREVIEW_W, PREVIEW_H)
    const scale = base * zoom
    const w = natural.w * scale
    const h = natural.h * scale
    return {
      width: w,
      height: h,
      transform: `translate(${(PREVIEW_W - w) / 2 + offsetX}px, ${(PREVIEW_H - h) / 2 + offsetY}px)`,
      opacity: 1,
    }
  })()

  async function handleApply() {
    const img = imgRef.current
    if (!img || !natural || busy) return
    setBusy(true)
    try {
      const file = await renderCroppedFile(img, zoom, offsetX, offsetY, fileName ?? 'photo')
      await onApply(file)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка обработки фото')
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Кадрирование фото"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel()
      }}
    >
      <div className="w-full max-w-[420px] rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel)] shadow-2xl">
        <div className="border-b border-[var(--pt-border)] px-4 py-3">
          <div className="text-sm font-semibold">Фото на карточку</div>
          <div className="mt-0.5 text-xs text-[var(--pt-muted)]">
            Масштаб и положение — как на карточке
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div
            className="relative mx-auto overflow-hidden rounded-t-lg bg-[var(--pt-photo-bg)] touch-none select-none"
            style={{ width: PREVIEW_W, height: PREVIEW_H, cursor: busy ? 'wait' : 'grab' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <img
              ref={imgRef}
              src={imageUrl}
              alt=""
              {...(imageUrl.startsWith('http') ? { crossOrigin: 'anonymous' as const } : {})}
              draggable={false}
              className="pointer-events-none absolute left-0 top-0 max-w-none origin-top-left"
              style={imageStyle}
              onLoad={onImgLoad}
            />
            <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/15" />
          </div>

          <label className="block space-y-1 text-xs">
            <div className="flex items-center justify-between text-[var(--pt-muted)]">
              <span>Масштаб</span>
              <span>{Math.round(zoom * 100)}%</span>
            </div>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              disabled={!natural || busy}
              onChange={(e) => setZoomClamped(Number(e.target.value))}
              className="w-full accent-[var(--pt-accent)]"
            />
          </label>

          <p className="text-[11px] text-[var(--pt-muted)]">
            Перетащите фото мышью, чтобы сдвинуть кадр.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--pt-border)] px-4 py-3">
          <button
            type="button"
            className="rounded-md border border-[var(--pt-border)] px-3 py-1.5 text-xs text-[var(--pt-muted)] hover:bg-white/5 disabled:opacity-50"
            disabled={busy}
            onClick={onCancel}
          >
            Отмена
          </button>
          <button
            type="button"
            className="rounded-md bg-[var(--pt-accent)] px-3 py-1.5 text-xs font-medium text-slate-950 disabled:opacity-50"
            disabled={!natural || busy}
            onClick={() => void handleApply()}
          >
            {busy ? 'Сохранение…' : 'Применить'}
          </button>
        </div>
      </div>
    </div>
  )
}
