// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import { useEffect, useRef, useState } from 'react'
import { getHost } from '../bridge/host'
import { useTreeStore } from '../store/treeStore'
import { buildFamFromGraph } from '../lib/buildFam'
import { createSnapshotWriter } from '../lib/persistSnapshot'

/** Disk first, one writer, snapshot-aware acknowledgements, bounded retry rate. */
export function useAutosave() {
  const dirty = useTreeStore(s => s.dirty)
  const doc = useTreeStore(s => s.doc)
  const nodes = useTreeStore(s => s.nodes)
  const edges = useTreeStore(s => s.edges)
  const filePath = useTreeStore(s => s.filePath)
  const [toast, setToast] = useState<string | null>(null)
  const run = useRef<() => void>(() => {})

  useEffect(() => {
    const host = getHost()
    type Snapshot = ReturnType<typeof useTreeStore.getState>
    let active = true
    let retry: ReturnType<typeof setTimeout> | undefined
    let pending: { id: string; resolve: (recovery: boolean) => void; reject: (e: Error) => void } | undefined
    let localRecovery = true
    let backedUp = false
    const unsubscribe = host.onHostMessage(msg => {
      if (!pending || (msg.type !== 'tree:autosaved' && msg.type !== 'tree:autosave-error') || msg.requestId !== pending.id) return
      if (msg.type === 'tree:autosaved') pending.resolve(msg.recovery)
      else pending.reject(new Error(msg.message))
    })
    const write = createSnapshotWriter<Snapshot>({
      async writeFile(snapshot) {
        backedUp = false
        const id = crypto.randomUUID()
        localRecovery = await new Promise<boolean>((resolve, reject) => {
          pending = { id, resolve, reject }
          const timer = setTimeout(() => pending?.reject(new Error('Нет подтверждения записи резервной копии')), 30_000)
          const finish = (fn: () => void) => { clearTimeout(timer); pending = undefined; fn() }
          pending.resolve = recovery => finish(() => resolve(recovery))
          pending.reject = error => finish(() => reject(error))
          host.requestAutosave(buildFamFromGraph(snapshot.doc!, snapshot.nodes, snapshot.edges), snapshot.filePath, id)
        })
        backedUp = true
      },
      async acknowledge() {},
      isCurrent(snapshot) {
        const current = useTreeStore.getState()
        return active && current.doc === snapshot.doc && current.nodes === snapshot.nodes &&
          current.edges === snapshot.edges && current.filePath === snapshot.filePath
      },
      saved(snapshot) {
        if (!localRecovery) {
          snapshot.markSaved(snapshot.filePath)
          setToast('Сохранено в файл')
        } else setToast('Резервная копия записана; выберите файл для сохранения')
      },
    })
    const attempt = async () => {
      const snapshot = useTreeStore.getState()
      if (!snapshot.dirty || !snapshot.doc || document.querySelector('[aria-modal="true"]')) return
      let delay = 3000
      let attempted = false
      try { attempted = await write(snapshot) }
      catch (error) {
        attempted = true
        delay = 15_000
        if (active) setToast(backedUp
          ? 'Копия записана; повтор сохранения через 15 с.'
          : 'Не удалось записать резервную копию: ' + (error instanceof Error ? error.message : String(error)))
      } finally {
        if (attempted && active && useTreeStore.getState().dirty) {
          clearTimeout(retry)
          retry = setTimeout(() => void attempt(), delay)
        }
      }
    }
    run.current = () => { void attempt() }
    const trigger = () => run.current()
    window.addEventListener('parenttree:save-now', trigger)
    const interval = setInterval(trigger, 60_000)
    return () => {
      active = false
      clearTimeout(retry)
      clearInterval(interval)
      unsubscribe()
      pending?.reject(new Error('Редактор закрыт'))
      window.removeEventListener('parenttree:save-now', trigger)
    }
  }, [])

  useEffect(() => {
    if (!dirty || !doc) return
    const timer = setTimeout(() => run.current(), 3000)
    return () => clearTimeout(timer)
  }, [dirty, doc, nodes, edges, filePath])
  return { toast }
}