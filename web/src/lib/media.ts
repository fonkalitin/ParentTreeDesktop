// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import type { MediaRef } from '../types/fam'

export function resolveMediaUrl(ref?: MediaRef | string | null): string | null {
  if (!ref) return null
  if (typeof ref === 'string') return ref.startsWith('data:') ? ref : null
  if (ref.dataUrl?.startsWith('data:')) return ref.dataUrl
  return null
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

export function calcAge(birth?: string, death?: string): number | null {
  const b = Number.parseInt(birth ?? '', 10)
  if (!Number.isFinite(b)) return null
  const end = death ? Number.parseInt(death, 10) : new Date().getFullYear()
  if (!Number.isFinite(end) || end < b) return null
  return end - b
}
