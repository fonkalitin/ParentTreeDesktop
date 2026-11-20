// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import type { FamDocument, MediaRef } from '../types/fam'

/** Validate and clone a portable document without mutating the input. */
export function cloneDocument(source: FamDocument): FamDocument {
  if (!source || !source.metadata || !Array.isArray(source.nodes)) throw new Error('Это не файл древа ParentTree')
  const copy = structuredClone(source)
  delete copy.metadata.treeId
  delete (copy.metadata as typeof copy.metadata & { archivedAt?: string }).archivedAt
  return copy
}

/** Embed every referenced binary before emitting a portable file; fail rather than omit content. */
export async function portableTree(source: FamDocument, load: (ref: MediaRef) => Promise<string>): Promise<FamDocument> {
  const copy = cloneDocument(source)
  const cache = new Map<string, Promise<string>>()
  async function embed(ref: MediaRef): Promise<MediaRef> {
    const { key, ...result } = ref
    if (result.dataUrl?.startsWith('data:')) return result
    if (key) {
      if (!cache.has(key)) cache.set(key, load(ref))
      const dataUrl = await cache.get(key)!
      if (!dataUrl.startsWith('data:')) throw new Error('Не удалось включить вложение в файл')
      return { ...result, dataUrl }
    }
    if (ref.size) throw new Error('У вложения отсутствуют данные')
    return result
  }
  for (const person of copy.nodes) {
    if (person.data.photo && !person.data.photo.startsWith('data:')) {
      const inline = await load({ dataUrl: person.data.photo })
      if (!inline.startsWith('data:')) throw new Error('Не удалось включить фотографию в файл')
      person.data.photo = inline
    }
    if (person.data.photoRef) person.data.photoRef = await embed(person.data.photoRef)
    if (person.data.attachments)
      person.data.attachments = await Promise.all(person.data.attachments.map(async item => ({ id: item.id, name: item.name, mimeType: item.mimeType, size: item.size, ...await embed(item) })))
  }
  return copy
}
