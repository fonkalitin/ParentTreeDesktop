// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import type { FamDocument } from '../types/fam'

export type HostToWebMessage =
  | { type: 'tree:load'; payload: FamDocument | Record<string, unknown>; path?: string; recovery?: boolean }
  | { type: 'tree:saved'; path: string }
  /** Quiet autosave ack. recovery=true → wrote to userData/localStorage, not the open .fam. */
  | { type: 'tree:autosaved'; path: string; recovery: boolean; requestId?: string }
  | { type: 'tree:autosave-error'; message: string; requestId?: string }
  | { type: 'tree:new' }
  | {
      type: 'command'
      name:
        | 'exportLocal'
        | 'save'
        | 'saveAs'
        | 'open'
        | 'fit'
        | 'undo'
        | 'redo'
        | 'find'
        | 'exportPng'
        | 'exportPdf'
        | 'clearAllRelations'
    }

export type WebToHostMessage =
  | { type: 'ready' }
  | { type: 'tree:changed'; dirty: boolean }
  | { type: 'file:open' }
  | { type: 'tree:export-local'; payload: FamDocument }
  | { type: 'tree:save'; payload: FamDocument; path?: string; saveAs?: boolean }
  | { type: 'tree:autosave'; payload: FamDocument; path?: string; requestId?: string }
  | { type: 'export:file'; dataUrl: string; suggestedName: string }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }

type HostApi = {
  isDesktop: boolean
  requestOpen: () => void
  requestSave: (doc: FamDocument, path?: string, saveAs?: boolean) => void
  /** Silent persist: known .fam path, or recovery location (no Save dialog). */
  requestAutosave: (doc: FamDocument, path?: string, requestId?: string) => void
  requestExportFile: (dataUrl: string, suggestedName: string) => void
  onHostMessage: (handler: (msg: HostToWebMessage) => void) => () => void
}

declare global {
  interface Window {
    parentTree?: {
      hasUnsavedChanges?: () => boolean
      send: (msg: WebToHostMessage) => void
      onMessage: (handler: (msg: HostToWebMessage) => void) => () => void
    }
  }
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}

const BROWSER_AUTOSAVE_KEY = 'parenttree.autosave.recovery'

function createBrowserHost(): HostApi {
  const listeners = new Set<(msg: HostToWebMessage) => void>()

  return {
    isDesktop: false,
    requestOpen() {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.fam,.json,application/json'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) return
        const text = await file.text()
        const payload = JSON.parse(text) as Record<string, unknown>
        listeners.forEach((l) => l({ type: 'tree:load', payload, path: file.name }))
      }
      input.click()
    },
    requestSave(doc) {
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${doc.metadata.title || 'tree'}.fam`
      a.click()
      URL.revokeObjectURL(url)
    },
    requestAutosave(doc, _path, requestId) {
      // Browser has no silent .fam path — keep a recovery snapshot in localStorage.
      try {
        localStorage.setItem(BROWSER_AUTOSAVE_KEY, JSON.stringify(doc))
        listeners.forEach((l) =>
          l({ type: 'tree:autosaved', path: BROWSER_AUTOSAVE_KEY, recovery: true, requestId }),
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Не удалось автосохранить'
        listeners.forEach((l) => l({ type: 'tree:autosave-error', message, requestId }))
      }
    },
    requestExportFile(dataUrl, suggestedName) {
      downloadDataUrl(dataUrl, suggestedName)
    },
    onHostMessage(handler) {
      listeners.add(handler)
      return () => listeners.delete(handler)
    },
  }
}

function createDesktopHost(): HostApi {
  return {
    isDesktop: true,
    requestOpen() {
      window.parentTree?.send({ type: 'file:open' })
    },
    requestSave(doc, path, saveAs) {
      window.parentTree?.send({ type: 'tree:save', payload: doc, path, saveAs })
    },
    requestAutosave(doc, path, requestId) {
      window.parentTree?.send({ type: 'tree:autosave', payload: doc, path, requestId })
    },
    requestExportFile(dataUrl, suggestedName) {
      window.parentTree?.send({ type: 'export:file', dataUrl, suggestedName })
    },
    onHostMessage(handler) {
      return window.parentTree!.onMessage(handler)
    },
  }
}

export function getHost(): HostApi {
  if (window.parentTree) return createDesktopHost()
  return createBrowserHost()
}

export function notifyReady() {
  window.parentTree?.send({ type: 'ready' })
}
