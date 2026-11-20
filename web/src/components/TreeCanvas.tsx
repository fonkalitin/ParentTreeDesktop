// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  Background,
  ConnectionLineType,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Node,
  type OnConnectEnd,
  type OnConnectStart,
} from '@xyflow/react'
import { PersonNode } from './PersonNode'
import { ClusterNode } from './ClusterNode'
import { ContextMenu } from './ContextMenu'
import { CanvasControls } from './CanvasControls'
import { FamilyBands } from './FamilyBands'
import { useTreeStore } from '../store/treeStore'
import type { CanvasFlowData, PersonFlowData } from '../layout/layoutTree'
import type { FamEdgeType } from '../types/fam'
import { DND_PERSON_MIME } from '../lib/peopleCatalog'
import {
  clusterKindLabel,
  DND_CANVAS_PERSON_MIME,
  DND_CLUSTER_TEMPLATE_MIME,
  DND_FROM_CLUSTER_MIME,
  hitClusterAt,
  PERSON_H,
  PERSON_W,
} from '../lib/clusterGeometry'
import type { FamClusterKind } from '../types/fam'
import {
  collectMarriageJunctions,
  hitMarriageJunction,
} from '../lib/marriageGeometry'
import {
  collectSiblingJunctions,
  hitSiblingJunction,
  siblingGroupOf,
} from '../lib/siblingGeometry'

const nodeTypes = { person: PersonNode, cluster: ClusterNode }

/**
 * Derive FamEdge kind from PersonNode port ids.
 * Returns null only when neither handle is a typed kinship port
 * (all current person ports are typed — picker path is unused).
 */
function kinshipFromPorts(
  sourceHandle?: string | null,
  targetHandle?: string | null,
): FamEdgeType | null {
  const src = sourceHandle ?? ''
  const tgt = targetHandle ?? ''
  if (!src && !tgt) return null
  if (src.includes('spouse') || tgt.includes('spouse')) return 'spouse'
  // Only the dedicated teal sibling ports mean bratstvo (not top-center child port)
  if (src.includes('sibling') || tgt.includes('sibling')) {
    if (src.includes('sibling') && tgt.includes('sibling')) return 'sibling'
    // Parent bottom → accidentally hit sibling port: still parent
    if (src.includes('bottom') || tgt.includes('bottom') || src.includes('top') || tgt.includes('top')) {
      return 'parent'
    }
    return 'sibling'
  }
  if (src.includes('bottom') || tgt.includes('top')) return 'parent'
  if (src.includes('top') || tgt.includes('bottom')) return 'parent'
  return null
}

/** Parent edge orientation: bottom = parent source, top = child target. */
function parentEndpoints(
  fromId: string,
  toId: string,
  sourceHandle?: string | null,
): { parentId: string; childId: string } {
  const srcIsBottom = (sourceHandle ?? '').includes('bottom')
  return srcIsBottom
    ? { parentId: fromId, childId: toId }
    : { parentId: toId, childId: fromId }
}

function clientPoint(event: MouseEvent | TouchEvent) {
  if ('changedTouches' in event && event.changedTouches[0]) {
    return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY }
  }
  const m = event as MouseEvent
  return { x: m.clientX, y: m.clientY }
}

export function TreeCanvas() {
  const storeNodes = useTreeStore((s) => s.nodes)
  const storeEdges = useTreeStore((s) => s.edges)
  const families = useTreeStore((s) => s.families)
  const doc = useTreeStore((s) => s.doc)
  const linkMode = useTreeStore((s) => s.linkMode)
  const setGraph = useTreeStore((s) => s.setGraph)
  const selectPerson = useTreeStore((s) => s.selectPerson)
  const placeOnCanvas = useTreeStore((s) => s.placeOnCanvas)
  const unplaceFromCanvas = useTreeStore((s) => s.unplaceFromCanvas)
  const addSpouseFor = useTreeStore((s) => s.addSpouseFor)
  const addChildFor = useTreeStore((s) => s.addChildFor)
  const removePerson = useTreeStore((s) => s.removePerson)
  const createCluster = useTreeStore((s) => s.createCluster)
  const addPersonToCluster = useTreeStore((s) => s.addPersonToCluster)
  const removePersonFromCluster = useTreeStore((s) => s.removePersonFromCluster)
  const setClusterCollapsed = useTreeStore((s) => s.setClusterCollapsed)
  const updateCluster = useTreeStore((s) => s.updateCluster)
  const deleteCluster = useTreeStore((s) => s.deleteCluster)
  const addPhantomLink = useTreeStore((s) => s.addPhantomLink)
  const startLink = useTreeStore((s) => s.startLink)
  const cancelLink = useTreeStore((s) => s.cancelLink)
  const linkRelation = useTreeStore((s) => s.linkRelation)
  const linkChildToMarriage = useTreeStore((s) => s.linkChildToMarriage)
  const linkSiblingGroupToParents = useTreeStore((s) => s.linkSiblingGroupToParents)
  const spouseOf = useTreeStore((s) => s.spouseOf)
  const snapToGrid = useTreeStore((s) => s.snapToGrid)
  const gridSize = useTreeStore((s) => s.gridSize)
  const selectedId = useTreeStore((s) => s.selectedId)
  const focusNodeId = useTreeStore((s) => s.focusNodeId)
  const focusToken = useTreeStore((s) => s.focusToken)
  const { setCenter, getNodes, screenToFlowPosition } = useReactFlow()
  const draggingRef = useRef(false)
  const connectFromRef = useRef<{ nodeId: string; handleId: string | null } | null>(null)
  const connectedRef = useRef(false)
  const [menu, setMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null)

  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges)

  useEffect(() => {
    if (draggingRef.current) return
    // Keep RF measured sizes so FamilyBands ports stay aligned;
    // mirror store selectedId onto RF `selected` so placeOnCanvas / panel picks highlight.
    setNodes((prev) => {
      const measured = new Map(prev.map((n) => [n.id, n.measured]))
      return storeNodes.map((n) => ({
        ...n,
        measured: measured.get(n.id) ?? n.measured,
        selected: n.id === selectedId,
      }))
    })
    setEdges(storeEdges)
  }, [storeNodes, storeEdges, selectedId, setNodes, setEdges])

  const personNodes = useMemo(
    () => nodes.filter((n) => n.type !== 'cluster') as Node<PersonFlowData>[],
    [nodes],
  )

  const junctions = useMemo(() => {
    if (!doc) return []
    return collectMarriageJunctions(
      personNodes,
      doc.edges.filter((e) => e.type === 'spouse'),
    )
  }, [doc, personNodes])

  const siblingJunctions = useMemo(() => {
    if (!doc) return []
    return collectSiblingJunctions(
      personNodes,
      doc.edges.filter((e) => e.type === 'sibling'),
      doc.edges.filter((e) => e.type === 'parent'),
    )
  }, [doc, personNodes])

  const onNodeDragStart = useCallback(
    (_: unknown, node: Node) => {
      draggingRef.current = true
      selectPerson(node.id)
    },
    [selectPerson],
  )

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      draggingRef.current = false
      selectPerson(node.id)
      const live = getNodes() as Node<CanvasFlowData>[]
      if (node.type !== 'cluster') {
        const cx = node.position.x + PERSON_W / 2
        const cy = node.position.y + PERSON_H / 2
        const hit = hitClusterAt(
          live.filter((n) => n.type === 'cluster' && n.id !== node.id),
          cx,
          cy,
        )
        if (hit) {
          addPersonToCluster(hit.id, node.id, live)
          return
        }
      }
      setGraph(live, edges)
    },
    [addPersonToCluster, edges, selectPerson, setGraph, getNodes],
  )

  useEffect(() => {
    if (!focusNodeId) return
    const node = getNodes().find((n) => n.id === focusNodeId)
    if (!node) return
    const w = node.measured?.width ?? 132
    const h = node.measured?.height ?? 148
    setCenter(node.position.x + w / 2, node.position.y + h / 2, {
      zoom: Math.max(0.85, Math.min(1.25, 1)),
      duration: 380,
    })
  }, [focusToken, focusNodeId, getNodes, setCenter])

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    // Nested cluster members set effectAllowed=move; Chromium cancels the drop if
    // dropEffect is incompatible (e.g. copy vs move). Prefer move for extracts /
    // canvas relocates, copy only for catalog / template drops.
    const types = Array.from(e.dataTransfer.types)
    if (
      types.includes(DND_FROM_CLUSTER_MIME) ||
      types.includes(DND_CANVAS_PERSON_MIME)
    ) {
      e.dataTransfer.dropEffect = 'move'
    } else if (types.includes(DND_CLUSTER_TEMPLATE_MIME)) {
      e.dataTransfer.dropEffect = 'copy'
    } else {
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })

      const templateKind = e.dataTransfer.getData(DND_CLUSTER_TEMPLATE_MIME)
      if (templateKind) {
        const kind = templateKind as FamClusterKind
        createCluster({
          kind,
          label: clusterKindLabel(kind),
          position: { x: pos.x - 76, y: pos.y - 40 },
        })
        return
      }

      const id =
        e.dataTransfer.getData(DND_PERSON_MIME) || e.dataTransfer.getData('text/plain')
      if (!id || id.startsWith('cluster:')) return
      const fromCluster = e.dataTransfer.getData(DND_FROM_CLUSTER_MIME)
      if (fromCluster) {
        const src = doc?.clusters?.find((c) => c.id === fromCluster)
        // Locked source → ignore extract (members stay in cluster)
        if (src && src.locked !== false) return
        // Drop on empty pane → extract at cursor; store snaps / falls back to row
        removePersonFromCluster(fromCluster, id, pos)
        return
      }
      placeOnCanvas(id, pos)
    },
    [createCluster, doc?.clusters, placeOnCanvas, removePersonFromCluster, screenToFlowPosition],
  )

  const onConnectStart: OnConnectStart = useCallback((_event, params) => {
    connectFromRef.current = {
      nodeId: params.nodeId ?? '',
      handleId: params.handleId ?? null,
    }
    connectedRef.current = false
    setMenu(null)
  }, [])

  const onConnect = useCallback(
    (connection: Connection) => {
      const fromId = connection.source
      const toId = connection.target
      if (!fromId || !toId || fromId === toId) return
      connectedRef.current = true

      const live = getNodes() as Node<CanvasFlowData>[]
      const fromNode = live.find((n) => n.id === fromId)
      const toNode = live.find((n) => n.id === toId)
      const srcH = connection.sourceHandle ?? ''
      const tgtH = connection.targetHandle ?? ''
      const phantom =
        fromNode?.type === 'cluster' ||
        toNode?.type === 'cluster' ||
        srcH.includes('phantom') ||
        tgtH.includes('phantom')

      if (phantom) {
        addPhantomLink(
          fromId,
          toId,
          fromNode?.type === 'cluster' ? 'cluster' : 'person',
          toNode?.type === 'cluster' ? 'cluster' : 'person',
          connection.sourceHandle,
          connection.targetHandle,
        )
        return
      }

      const kind = kinshipFromPorts(connection.sourceHandle, connection.targetHandle)
      // All person kinship ports are typed — create immediately; no picker.
      if (!kind) return

      if (kind === 'parent') {
        const { parentId, childId } = parentEndpoints(
          fromId,
          toId,
          connection.sourceHandle,
        )
        linkRelation(parentId, childId, 'parent')
        return
      }

      linkRelation(fromId, toId, kind)
    },
    [addPhantomLink, getNodes, linkRelation],
  )

  const onConnectEnd: OnConnectEnd = useCallback(
    (event) => {
      const from = connectFromRef.current
      connectFromRef.current = null
      if (connectedRef.current || !from?.nodeId) return

      const { x, y } = clientPoint(event)
      const flow = screenToFlowPosition({ x, y })
      const liveAll = getNodes() as Node<CanvasFlowData>[]
      const liveNodes = liveAll.filter((n) => n.type !== 'cluster') as Node<PersonFlowData>[]
      const spouseEdges = (doc?.edges ?? []).filter((e) => e.type === 'spouse')
      const siblingEdges = (doc?.edges ?? []).filter((e) => e.type === 'sibling')
      const parentEdges = (doc?.edges ?? []).filter((e) => e.type === 'parent')

      const liveMarriage = collectMarriageJunctions(liveNodes, spouseEdges)
      const marriageHit = hitMarriageJunction(
        liveMarriage.length ? liveMarriage : junctions,
        flow.x,
        flow.y,
        36,
      )
      if (marriageHit) {
        if (from.nodeId === marriageHit.parentA || from.nodeId === marriageHit.parentB) return
        // Drop on marriage ●: if drag started from a sibling group, attach ALL siblings
        const kids = siblingGroupOf(liveNodes, siblingEdges, from.nodeId)
        if (kids.length > 1) {
          linkSiblingGroupToParents(kids, marriageHit.parentA, marriageHit.parentB)
        } else {
          linkChildToMarriage(from.nodeId, marriageHit.parentA, marriageHit.parentB)
        }
        return
      }

      const liveSibling = collectSiblingJunctions(liveNodes, siblingEdges, parentEdges)
      const siblingHit = hitSiblingJunction(
        liveSibling.length ? liveSibling : siblingJunctions,
        flow.x,
        flow.y,
        36,
      )
      if (!siblingHit) return
      // Dropping a member onto their own sibling ● does nothing
      if (siblingHit.memberIds.includes(from.nodeId)) return

      // Parent (or one spouse) → sibling-group ● → all siblings become children
      const other = spouseOf(from.nodeId)
      if (other && !siblingHit.memberIds.includes(other)) {
        linkSiblingGroupToParents(siblingHit.memberIds, from.nodeId, other)
      } else {
        linkSiblingGroupToParents(siblingHit.memberIds, from.nodeId)
      }
    },
    [
      screenToFlowPosition,
      getNodes,
      doc,
      junctions,
      siblingJunctions,
      linkChildToMarriage,
      linkSiblingGroupToParents,
      spouseOf,
    ],
  )

  return (
    <div className="relative h-full w-full">
      {linkMode ? (
        <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel)] px-3 py-1.5 text-xs text-[var(--pt-text)] shadow-lg">
          {linkMode.type === 'spouse'
            ? 'Выберите супруга/супругу кликом'
            : linkMode.type === 'sibling'
              ? 'Выберите брата/сестру кликом'
              : 'Выберите ребёнка кликом (родитель уже выбран)'}
          <button type="button" className="ml-3 text-[var(--pt-accent)] underline" onClick={cancelLink}>
            отмена
          </button>
        </div>
      ) : null}

      {!nodes.length ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="max-w-sm rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel)]/90 px-5 py-4 text-center shadow-xl backdrop-blur">
            <div className="text-sm font-medium text-[var(--pt-text)]">Поле пустое</div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--pt-muted)]">
              Перетащите людей или шаблон группы из каталога слева. Вложите карточки в группу с
              поля. Серые порты — фантом-связи. Брак — боковые; ребёнок пары — к золотому ●.
            </p>
          </div>
        </div>
      ) : null}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onConnectStart={onConnectStart}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onNodeClick={(_, node) => {
          setMenu(null)
          selectPerson(node.id)
        }}
        onPaneClick={() => {
          setMenu(null)
          if (!linkMode) selectPerson(undefined)
        }}
        onNodeContextMenu={(e, node) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY, nodeId: node.id })
          selectPerson(node.id)
        }}
        isValidConnection={(c) => Boolean(c.source && c.target && c.source !== c.target)}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{
          hidden: true,
          style: { stroke: 'transparent', strokeWidth: 0, opacity: 0 },
          interactionWidth: 0,
        }}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{
          stroke: 'var(--pt-accent)',
          strokeWidth: 2,
          strokeDasharray: '6 4',
        }}
        minZoom={0.08}
        maxZoom={2}
        nodesConnectable
        edgesFocusable={false}
        nodesDraggable
        nodeDragThreshold={8}
        selectNodesOnDrag={false}
        snapToGrid={snapToGrid}
        snapGrid={[gridSize, gridSize]}
        panOnDrag
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        preventScrolling
        proOptions={{ hideAttribution: true }}
        className="h-full w-full"
        colorMode="dark"
      >
        <Background gap={gridSize} color="#243041" />
        <FamilyBands doc={doc} families={families} nodes={nodes as Node<CanvasFlowData>[]} />
        <CanvasControls />
        <MiniMap
          nodeStrokeWidth={2}
          nodeColor={(n) => {
            if (n.type === 'cluster') return '#7a8494'
            return (n.data as PersonFlowData)?.gender === 'F' ? '#d47a9c' : '#4f8fd8'
          }}
          maskColor="rgba(15,20,25,0.72)"
          pannable
          zoomable
        />
      </ReactFlow>

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={
            nodes.find((n) => n.id === menu.nodeId)?.type === 'cluster'
              ? [
                  {
                    label: 'Свойства группы…',
                    onClick: () => selectPerson(menu.nodeId),
                  },
                  {
                    label: 'Полные / мини фото',
                    onClick: () => {
                      const c = doc?.clusters?.find((x) => x.id === menu.nodeId)
                      if (c) updateCluster(menu.nodeId, { compact: !c.compact })
                    },
                  },
                  {
                    label: 'Свернуть / развернуть',
                    onClick: () => {
                      const c = doc?.clusters?.find((x) => x.id === menu.nodeId)
                      if (c) setClusterCollapsed(menu.nodeId, !c.collapsed)
                    },
                  },
                  {
                    label: 'Распустить · выложить рядом',
                    onClick: () => deleteCluster(menu.nodeId, true),
                  },
                  {
                    label: 'Удалить контейнер',
                    danger: true,
                    onClick: () => {
                      if (confirm('Удалить контейнер? Люди останутся на поле рядом.')) {
                        deleteCluster(menu.nodeId, true)
                      }
                    },
                  },
                ]
              : [
                  {
                    label: 'Добавить супруга/супругу',
                    onClick: () => addSpouseFor(menu.nodeId),
                  },
                  {
                    label: 'Добавить ребёнка',
                    onClick: () => addChildFor(menu.nodeId),
                  },
                  {
                    label: 'Вложить в новую группу',
                    onClick: () => {
                      const n = nodes.find((x) => x.id === menu.nodeId)
                      createCluster({
                        memberIds: [menu.nodeId],
                        position: n
                          ? { x: n.position.x - 40, y: n.position.y - 20 }
                          : undefined,
                      })
                    },
                  },
                  {
                    label: 'Связать браком с…',
                    onClick: () => startLink(menu.nodeId, 'spouse'),
                  },
                  {
                    label: 'Сделать родителем для…',
                    onClick: () => startLink(menu.nodeId, 'parent'),
                  },
                  {
                    label: 'Убрать с поля',
                    onClick: () => unplaceFromCanvas(menu.nodeId),
                  },
                  {
                    label: 'Удалить из базы',
                    danger: true,
                    onClick: () => {
                      if (confirm('Удалить человека из базы и все его связи?')) {
                        removePerson(menu.nodeId)
                      }
                    },
                  },
                ]
          }
        />
      ) : null}
    </div>
  )
}
