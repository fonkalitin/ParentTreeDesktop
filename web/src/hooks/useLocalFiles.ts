// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import { useEffect } from 'react'
import { getHost, type HostToWebMessage } from '../bridge/host'
import { useTreeStore } from '../store/treeStore'
import { buildFamFromGraph } from '../lib/buildFam'
import { portableTree } from '../lib/portableTree'
import { fileToDataUrl, resolveMediaUrl } from '../lib/media'

/** Exporting a copy does not clear pending changes in the open document. */
export function useLocalFiles() {
  const dirty = useTreeStore(s => s.dirty)
  if (window.parentTree) window.parentTree.hasUnsavedChanges = () => useTreeStore.getState().dirty
  useEffect(() => { window.parentTree?.send({ type: 'tree:changed', dirty }) }, [dirty])
  useEffect(() => {
    let exporting = false
    const exportFile = async () => {
      if (exporting) return
      const state = useTreeStore.getState()
      if (!state.doc) return
      exporting = true
      try {
        const payload = await portableTree(buildFamFromGraph(state.doc, state.nodes, state.edges), async ref => {
          const url = resolveMediaUrl(ref)
          if (!url) throw new Error('Не найдено вложение')
          const response = await fetch(url)
          if (!response.ok) throw new Error('Не удалось загрузить фото или вложение для экспорта')
          const blob = await response.blob()
          return fileToDataUrl(new File([blob], ref.name || 'media', { type: blob.type }))
        })
        window.parentTree?.send({ type: 'tree:export-local', payload })
      } catch (e) {
        useTreeStore.setState({ error: e instanceof Error ? e.message : 'Не удалось экспортировать файл' })
      } finally { exporting = false }
    }
    window.addEventListener('parenttree:export-local-request', exportFile)
    const unsubscribe = getHost().onHostMessage((message: HostToWebMessage) => {
      if (message.type === 'command' && message.name === 'exportLocal') void exportFile()
    })
    return () => { unsubscribe(); window.removeEventListener('parenttree:export-local-request', exportFile) }
  }, [])
}
