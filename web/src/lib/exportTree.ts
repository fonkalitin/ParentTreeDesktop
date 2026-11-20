// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import { getNodesBounds, getViewportForBounds, type Node } from '@xyflow/react'
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import type { CanvasFlowData } from '../layout/layoutTree'

/** Light paper-friendly background for PNG/PDF export. */
const EXPORT_BG = '#f7f8fa'
const PADDING = 48
const MAX_SIDE = 8192
const EXPORT_CLASS = 'pt-export-light'

function safeName(title: string, ext: string) {
  const base = (title || 'дерево').replace(/[<>:"/\\|?*]+/g, '_').trim() || 'дерево'
  return `${base}.${ext}`
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}

/** Normalize data URLs for PDF export (jsPDF inserts `;filename=…`). */
export function normalizeExportDataUrl(dataUrl: string): string {
  const m = String(dataUrl).match(/^data:([^;,]+)(?:;[^,]*)*;base64,([\s\S]+)$/i)
  if (!m) return dataUrl
  return `data:${m[1]};base64,${m[2]}`
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function withExportLightTheme<T>(viewportEl: HTMLElement, run: () => Promise<T>): Promise<T> {
  const flowRoot = viewportEl.closest('.react-flow') as HTMLElement | null
  const targets = [viewportEl, flowRoot].filter((el): el is HTMLElement => Boolean(el))
  for (const el of targets) el.classList.add(EXPORT_CLASS)
  // Let the browser apply CSS before html-to-image clones computed styles.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  try {
    return await run()
  } finally {
    for (const el of targets) el.classList.remove(EXPORT_CLASS)
  }
}

export async function renderTreePng(
  nodes: Node<CanvasFlowData>[],
  options?: { pixelRatio?: number },
): Promise<{ dataUrl: string; width: number; height: number }> {
  if (!nodes.length) throw new Error('Нет узлов для экспорта')

  const viewportEl = document.querySelector('.react-flow__viewport') as HTMLElement | null
  if (!viewportEl) throw new Error('Холст дерева не найден')

  const bounds = getNodesBounds(nodes)
  let width = Math.ceil(bounds.width + PADDING * 2)
  let height = Math.ceil(bounds.height + PADDING * 2)

  // Keep export within canvas limits
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height, 1))
  width = Math.max(1, Math.ceil(width * scale))
  height = Math.max(1, Math.ceil(height * scale))

  const viewport = getViewportForBounds(bounds, width, height, 0.1, 2, 0.12)
  const pixelRatio = options?.pixelRatio ?? 2

  const dataUrl = await withExportLightTheme(viewportEl, () =>
    toPng(viewportEl, {
      backgroundColor: EXPORT_BG,
      width,
      height,
      pixelRatio,
      cacheBust: true,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        transformOrigin: '0 0',
      },
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true
        return (
          !node.classList?.contains('react-flow__minimap') &&
          !node.classList?.contains('react-flow__controls') &&
          !node.classList?.contains('react-flow__panel') &&
          !node.classList?.contains('react-flow__handle')
        )
      },
    }),
  )

  return { dataUrl, width, height }
}

export async function exportTreePng(
  nodes: Node<CanvasFlowData>[],
  title: string,
  save?: (dataUrl: string, filename: string) => void | Promise<void>,
) {
  const { dataUrl } = await renderTreePng(nodes)
  const filename = safeName(title, 'png')
  const normalized = normalizeExportDataUrl(dataUrl)
  if (save) await save(normalized, filename)
  else downloadDataUrl(normalized, filename)
  return filename
}

export async function exportTreePdf(
  nodes: Node<CanvasFlowData>[],
  title: string,
  save?: (dataUrl: string, filename: string) => void | Promise<void>,
) {
  const { dataUrl, width, height } = await renderTreePng(nodes, { pixelRatio: 2 })
  const orient = width >= height ? 'landscape' : 'portrait'
  const pdf = new jsPDF({
    orientation: orient,
    unit: 'px',
    format: [width, height],
    hotfixes: ['px_scaling'],
  })
  pdf.addImage(dataUrl, 'PNG', 0, 0, width, height)
  const filename = safeName(title, 'pdf')
  // Prefer a clean data URL — jsPDF's datauristring includes `;filename=generated.pdf`
  // which broke Electron's export saver.
  const pdfDataUrl = `data:application/pdf;base64,${arrayBufferToBase64(pdf.output('arraybuffer'))}`
  if (save) await save(pdfDataUrl, filename)
  else pdf.save(filename)
  return filename
}
