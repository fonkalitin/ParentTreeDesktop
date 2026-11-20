// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import type { Attachment, MediaRef } from '../types/fam'
import { fileToDataUrl } from './media'
export async function toPhotoRef(file: File): Promise<MediaRef> {
  return { dataUrl: await fileToDataUrl(file), mimeType: file.type, name: file.name, size: file.size }
}
export async function toAttachment(file: File): Promise<Attachment> {
  return { ...await toPhotoRef(file), id: crypto.randomUUID(), name: file.name, mimeType: file.type, size: file.size }
}
