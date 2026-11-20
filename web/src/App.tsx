// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import { useEffect, useMemo, useRef } from 'react'
import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { Toolbar } from './components/Toolbar'
import { TreeCanvas } from './components/TreeCanvas'
import { PeopleDrawer } from './components/PeopleDrawer'
import { PersonPanel } from './components/panel/PersonPanel'
import { ClusterPanel } from './components/panel/ClusterPanel'
import { PhantomPanel } from './components/panel/PhantomPanel'
import { EdgePanel } from './components/panel/EdgePanel'
import { getHost, notifyReady, type HostToWebMessage } from './bridge/host'
import { useTreeStore } from './store/treeStore'
import { buildFamFromGraph } from './lib/buildFam'
import { exportTreePdf, exportTreePng } from './lib/exportTree'
import { useLocalFiles } from './hooks/useLocalFiles'
import { cloneDocument } from './lib/portableTree'
import { useAutosave } from './hooks/useAutosave'

function AppShell() {
  useLocalFiles()
  const loadDocument = useTreeStore((s) => s.loadDocument)
  const markSaved = useTreeStore((s) => s.markSaved)
  const { toast: autosaveToast } = useAutosave()
  const updatePerson = useTreeStore((s) => s.updatePerson)
  const selectPerson = useTreeStore((s) => s.selectPerson)
  const selectPhantom = useTreeStore((s) => s.selectPhantom)
  const selectEdge = useTreeStore((s) => s.selectEdge)
  const removePhantomLink = useTreeStore((s) => s.removePhantomLink)
  const unlinkEdge = useTreeStore((s) => s.unlinkEdge)
  const unplaceFromCanvas = useTreeStore((s) => s.unplaceFromCanvas)
  const deleteCluster = useTreeStore((s) => s.deleteCluster)
  const cancelLink = useTreeStore((s) => s.cancelLink)
  const undo = useTreeStore((s) => s.undo)
  const redo = useTreeStore((s) => s.redo)
  const linkMode = useTreeStore((s) => s.linkMode)
  const doc = useTreeStore((s) => s.doc)
  const nodes = useTreeStore((s) => s.nodes)
  const edges = useTreeStore((s) => s.edges)
  const filePath = useTreeStore((s) => s.filePath)
  const selectedId = useTreeStore((s) => s.selectedId)
  const selectedPhantomId = useTreeStore((s) => s.selectedPhantomId)
  const selectedEdgeId = useTreeStore((s) => s.selectedEdgeId)
  const drawerOpen = useTreeStore((s) => s.drawerOpen)
  const setDrawerOpen = useTreeStore((s) => s.setDrawerOpen)
  const panelOpen = useTreeStore((s) => s.panelOpen)
  const setPanelOpen = useTreeStore((s) => s.setPanelOpen)
  const clearAllRelations = useTreeStore((s) => s.clearAllRelations)
  const error = useTreeStore((s) => s.error)
  const clearError = useTreeStore((s) => s.clearError)
  const { fitView } = useReactFlow()
  const hostRef = useRef(getHost())
  const loadedOnce = useRef(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const selectedCluster = useMemo(() => {
    if (!selectedId || !doc) return null
    return doc.clusters?.find((c) => c.id === selectedId) ?? null
  }, [selectedId, doc])

  const selected = useMemo(() => {
    if (!selectedId || !doc || selectedCluster) return null
    const node = doc.nodes.find((n) => n.id === selectedId)
    if (!node) return null
    const flow = nodes.find((n) => n.id === selectedId && n.type !== 'cluster')
    const fd = flow?.data as
      | {
          label?: string
          gender?: typeof node.data.gender
          birth?: string
          death?: string
          maidenName?: string
          birthPlace?: string
          deathPlace?: string
          notes?: string
          photoRef?: typeof node.data.photoRef
          attachments?: typeof node.data.attachments
        }
      | undefined
    return {
      id: selectedId,
      data: {
        ...node.data,
        label: fd?.label ?? node.data.label,
        gender: fd?.gender ?? node.data.gender,
        birth: fd?.birth ?? node.data.birth,
        death: fd?.death ?? node.data.death,
        maidenName: fd?.maidenName ?? node.data.maidenName,
        birthPlace: fd?.birthPlace ?? node.data.birthPlace,
        deathPlace: fd?.deathPlace ?? node.data.deathPlace,
        notes: fd?.notes ?? node.data.notes,
        photoRef: fd?.photoRef ?? node.data.photoRef,
        attachments: fd?.attachments ?? node.data.attachments,
      },
    }
  }, [selectedId, doc, nodes, selectedCluster])

  useEffect(() => {
    if (!loadedOnce.current) {
      loadedOnce.current = true
      {
        const now = new Date().toISOString()
        loadDocument({
          version: '1.0',
          metadata: { title: 'Новое дерево', createdAt: now, updatedAt: now, layoutMode: 'manual' },
          nodes: [], edges: [], clusters: [], phantoms: [],
        })
      }
    }

    const host = hostRef.current
    const unsub = host.onHostMessage((msg: HostToWebMessage) => {
      if (msg.type === 'tree:load') {
        const payload = cloneDocument(msg.payload as import('./types/fam').FamDocument)
        loadDocument(payload, msg.path)
        if (msg.recovery) useTreeStore.setState({ dirty: true })
      } else if (msg.type === 'tree:saved') {
        markSaved(msg.path)
      } else if (msg.type === 'tree:new') {
        loadDocument({
          version: '1.0',
          metadata: {
            title: 'Новое дерево',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            layoutMode: 'manual',
          },
          nodes: [],
          edges: [],
        })
      } else if (msg.type === 'command') {
        if (msg.name === 'fit') fitView({ padding: 0.16 })
        if (msg.name === 'open') host.requestOpen()
        if (msg.name === 'undo') undo()
        if (msg.name === 'redo') redo()
        if (msg.name === 'find') searchInputRef.current?.focus()
        if (msg.name === 'save' || msg.name === 'saveAs') {
          const state = useTreeStore.getState()
          if (!state.doc) return
          const payload = buildFamFromGraph(state.doc, state.nodes, state.edges)
          host.requestSave(payload, state.filePath, msg.name === 'saveAs')
        }
        if (msg.name === 'exportPng' || msg.name === 'exportPdf') {
          const state = useTreeStore.getState()
          if (!state.doc || !state.nodes.length) return
          const title = state.doc.metadata.title || 'дерево'
          const save = (dataUrl: string, filename: string) =>
            host.requestExportFile(dataUrl, filename)
          void (msg.name === 'exportPng'
            ? exportTreePng(state.nodes, title, save)
            : exportTreePdf(state.nodes, title, save)
          ).catch((e) => alert(e instanceof Error ? e.message : 'Ошибка экспорта'))
        }
        if (msg.name === 'clearAllRelations') {
          clearAllRelations()
        }
      }
    })

    notifyReady()
    return unsub
  }, [loadDocument, markSaved, fitView, undo, redo, clearAllRelations])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const host = hostRef.current
      const inField =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement

      if (e.ctrlKey && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        host.requestOpen()
      }
      if (e.ctrlKey && e.key.toLowerCase() === 's' && doc) {
        e.preventDefault()
        const payload = buildFamFromGraph(doc, nodes, edges)
        host.requestSave(payload, filePath, e.shiftKey)
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      if (
        (e.ctrlKey && e.key.toLowerCase() === 'y') ||
        (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault()
        redo()
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
      if (e.key === 'Escape') {
        if (linkMode) cancelLink()
        else {
          selectPerson(undefined)
          selectPhantom(undefined)
          selectEdge(undefined)
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !inField) {
        if (selectedPhantomId) {
          e.preventDefault()
          removePhantomLink(selectedPhantomId)
          return
        }
        if (selectedEdgeId) {
          e.preventDefault()
          unlinkEdge(selectedEdgeId)
          return
        }
        if (selectedId) {
          e.preventDefault()
          // Delete removes from the field only; permanent delete is in context menu
          if (doc?.clusters?.some((c) => c.id === selectedId)) {
            deleteCluster(selectedId, true)
          } else if (nodes.some((n) => n.id === selectedId)) {
            unplaceFromCanvas(selectedId)
          }
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    doc,
    nodes,
    edges,
    filePath,
    markSaved,
    selectPerson,
    selectPhantom,
    selectEdge,
    removePhantomLink,
    unlinkEdge,
    selectedId,
    selectedPhantomId,
    selectedEdgeId,
    unplaceFromCanvas,
    deleteCluster,
    linkMode,
    cancelLink,
    undo,
    redo,
  ])

  return (
    <div className="flex h-full w-full flex-col">
      <Toolbar
        onFit={() => fitView({ padding: 0.16 })}
        searchInputRef={searchInputRef}
      />
      {error ? (
        <div className="border-b border-rose-900/50 bg-rose-950/60 px-3 py-2 text-sm text-rose-100">
          {error}
          <button type="button" className="ml-2 underline" onClick={clearError}>
            закрыть
          </button>
        </div>
      ) : null}
      <div className="relative flex min-h-0 flex-1">
        <PeopleDrawer open={drawerOpen} onToggle={() => setDrawerOpen(!drawerOpen)} />
        <main className="min-w-0 flex-1">
          <TreeCanvas />
        </main>
        {autosaveToast ? (
          <div
            className="pointer-events-none absolute bottom-3 left-1/2 z-40 -translate-x-1/2 rounded-md border border-[var(--pt-border)] bg-[var(--pt-panel)]/95 px-3 py-1.5 text-xs text-[var(--pt-muted)] shadow-lg"
            role="status"
          >
            {autosaveToast}
          </div>
        ) : null}
        {selectedCluster || selected || selectedPhantomId || selectedEdgeId ? (
          <>
            <button
              type="button"
              className="absolute right-0 top-1/2 z-30 -translate-y-1/2 rounded-l-md border border-r-0 border-[var(--pt-border)] bg-[var(--pt-panel)] px-1.5 py-3 text-xs text-[var(--pt-muted)] shadow-lg hover:text-[var(--pt-text)]"
              style={{ marginRight: panelOpen ? 320 : 0 }}
              onClick={() => setPanelOpen(!panelOpen)}
              title={
                panelOpen
                  ? selectedPhantomId
                    ? 'Скрыть панель фантома'
                    : selectedEdgeId
                      ? 'Скрыть панель связи'
                      : selectedCluster
                        ? 'Скрыть панель контейнера'
                        : 'Скрыть карточку человека'
                  : selectedPhantomId
                    ? 'Показать панель фантома'
                    : selectedEdgeId
                      ? 'Показать панель связи'
                      : selectedCluster
                        ? 'Показать панель контейнера'
                        : 'Показать карточку человека'
              }
            >
              {panelOpen ? '›' : '‹'}
            </button>
            {panelOpen ? (
              selectedPhantomId ? (
                <PhantomPanel
                  phantomId={selectedPhantomId}
                  onClose={() => selectPhantom(undefined)}
                />
              ) : selectedEdgeId ? (
                <EdgePanel
                  edgeId={selectedEdgeId}
                  onClose={() => selectEdge(undefined)}
                />
              ) : selectedCluster ? (
                <ClusterPanel
                  cluster={selectedCluster}
                  onClose={() => selectPerson(undefined)}
                />
              ) : selected ? (
                <PersonPanel
                  personId={selected.id}
                  data={selected.data}
                  onChange={updatePerson}
                  onClose={() => selectPerson(undefined)}
                />
              ) : null
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ReactFlowProvider>
      <AppShell />
    </ReactFlowProvider>
  )
}