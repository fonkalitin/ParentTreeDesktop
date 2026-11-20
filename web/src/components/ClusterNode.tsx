// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import { memo, useCallback, useRef, type DragEvent, type PointerEvent } from 'react'
import { Handle, Position, useReactFlow, type Node, type NodeProps } from '@xyflow/react'
import type { ClusterFlowData } from '../layout/layoutTree'
import {
  clusterKindLabel,
  clusterSize,
  CLUSTER_COLLAPSED_BODY,
  CLUSTER_HEADER,
  CLUSTER_PAD,
  DND_CANVAS_PERSON_MIME,
  DND_FROM_CLUSTER_MIME,
  hitClusterAt,
  isPhantomGroupKind,
  MEMBER_GAP,
  MEMBER_MINI_H,
  PERSON_H,
  PERSON_W,
} from '../lib/clusterGeometry'
import { DND_PERSON_MIME } from '../lib/peopleCatalog'
import { resolveMediaUrl } from '../lib/media'
import { formatLifespanRu } from '../lib/partialDate'
import { useTreeStore } from '../store/treeStore'
import { PersonCardFace } from './PersonCardFace'

type ClusterFlowNode = Node<ClusterFlowData, 'cluster'>

type ExtractDrag = {
  personId: string
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  /** True once movement exceeds threshold (gesture is a drag, not a click). */
  armed: boolean
  /** HTML5 dragStart fired — prefer native drop; dragEnd may still fall back. */
  html5: boolean
}

function ClusterNodeComponent({ id, data, selected }: NodeProps<ClusterFlowNode>) {
  const addPersonToCluster = useTreeStore((s) => s.addPersonToCluster)
  const removePersonFromCluster = useTreeStore((s) => s.removePersonFromCluster)
  const selectPerson = useTreeStore((s) => s.selectPerson)
  const setClusterCollapsed = useTreeStore((s) => s.setClusterCollapsed)
  const updateCluster = useTreeStore((s) => s.updateCluster)
  const applyClusterRelations = useTreeStore((s) => s.applyClusterRelations)
  const selectedId = useTreeStore((s) => s.selectedId)
  const { screenToFlowPosition, getNodes } = useReactFlow()

  const rootRef = useRef<HTMLDivElement>(null)
  const extractRef = useRef<ExtractDrag | null>(null)
  /** Last client point seen during HTML5 drag (dragover on window). */
  const lastHtml5PointRef = useRef<{ x: number; y: number } | null>(null)
  const html5DropOkRef = useRef(false)

  const pointInsideSelf = useCallback((clientX: number, clientY: number) => {
    const root = rootRef.current
    if (!root) return true
    const rect = root.getBoundingClientRect()
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    )
  }, [])

  const locked = data.locked !== false

  const finishExtractAt = useCallback(
    (personId: string, clientX: number, clientY: number) => {
      if (locked) return false
      if (pointInsideSelf(clientX, clientY)) return false
      const pos = screenToFlowPosition({ x: clientX, y: clientY })
      const others = getNodes().filter((n) => n.type === 'cluster' && n.id !== id)
      const hit = hitClusterAt(others, pos.x, pos.y)
      if (hit) {
        addPersonToCluster(hit.id, personId)
        return true
      }
      removePersonFromCluster(id, personId, pos)
      return true
    },
    [
      addPersonToCluster,
      getNodes,
      id,
      locked,
      pointInsideSelf,
      removePersonFromCluster,
      screenToFlowPosition,
    ],
  )

  const onDragOver = useCallback((e: DragEvent) => {
    const types = Array.from(e.dataTransfer.types)
    if (
      types.includes(DND_PERSON_MIME) ||
      types.includes(DND_CANVAS_PERSON_MIME) ||
      types.includes(DND_FROM_CLUSTER_MIME) ||
      types.includes('text/plain')
    ) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
    }
  }, [])

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const personId =
        e.dataTransfer.getData(DND_PERSON_MIME) ||
        e.dataTransfer.getData(DND_CANVAS_PERSON_MIME) ||
        e.dataTransfer.getData('text/plain')
      if (!personId || personId === id) return
      const fromCluster = e.dataTransfer.getData(DND_FROM_CLUSTER_MIME)
      // Dropping back onto the same cluster — no-op
      if (fromCluster === id) {
        html5DropOkRef.current = true
        return
      }
      html5DropOkRef.current = true
      addPersonToCluster(id, personId)
    },
    [addPersonToCluster, id],
  )

  const beginMemberHtml5Drag = useCallback(
    (personId: string, e: DragEvent) => {
      if (locked) {
        e.preventDefault()
        return
      }
      e.stopPropagation()
      html5DropOkRef.current = false
      lastHtml5PointRef.current = { x: e.clientX, y: e.clientY }
      if (extractRef.current?.personId === personId) {
        extractRef.current.html5 = true
      }
      e.dataTransfer.setData(DND_PERSON_MIME, personId)
      e.dataTransfer.setData('text/plain', personId)
      e.dataTransfer.setData(DND_FROM_CLUSTER_MIME, id)
      // copyMove so pane can use move and catalog-style targets can use copy
      e.dataTransfer.effectAllowed = 'copyMove'

      const onWinDragOver = (ev: Event) => {
        const de = ev as globalThis.DragEvent
        if (typeof de.clientX === 'number' && de.clientX !== 0) {
          lastHtml5PointRef.current = { x: de.clientX, y: de.clientY }
        }
      }
      const onWinDragEnd = () => {
        window.removeEventListener('dragover', onWinDragOver, true)
        window.removeEventListener('dragend', onWinDragEnd, true)
      }
      window.addEventListener('dragover', onWinDragOver, true)
      window.addEventListener('dragend', onWinDragEnd, true)
    },
    [id, locked],
  )

  const onMemberHtml5DragEnd = useCallback(
    (personId: string, e: DragEvent) => {
      // Successful HTML5 drop already handled by TreeCanvas / another cluster
      if (html5DropOkRef.current || e.dataTransfer.dropEffect !== 'none') {
        extractRef.current = null
        return
      }
      const pt = lastHtml5PointRef.current ?? { x: e.clientX, y: e.clientY }
      finishExtractAt(personId, pt.x, pt.y)
      extractRef.current = null
    },
    [finishExtractAt],
  )

  const onMemberPointerDown = useCallback(
    (personId: string, e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      // Keep RF from treating this as node drag / pan; still allow HTML5 dragStart
      e.stopPropagation()
      if (locked) {
        // Selection only — no extract when locked
        selectPerson(personId)
        return
      }
      extractRef.current = {
        personId,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        armed: false,
        html5: false,
      }

      const onMove = (ev: globalThis.PointerEvent) => {
        const d = extractRef.current
        if (!d || d.pointerId !== ev.pointerId) return
        d.lastX = ev.clientX
        d.lastY = ev.clientY
        if (!d.armed) {
          const dist = Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY)
          if (dist >= 10) d.armed = true
        }
      }

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove, true)
        window.removeEventListener('pointerup', onUp, true)
        window.removeEventListener('pointercancel', onCancel, true)
      }

      const onUp = (ev: globalThis.PointerEvent) => {
        const d = extractRef.current
        cleanup()
        if (!d || d.pointerId !== ev.pointerId) return
        // HTML5 took over — leave extract to dragEnd / drop handlers
        if (d.html5) return
        extractRef.current = null
        if (!d.armed) {
          selectPerson(personId)
          return
        }
        finishExtractAt(personId, ev.clientX, ev.clientY)
      }

      const onCancel = (ev: globalThis.PointerEvent) => {
        const d = extractRef.current
        if (!d || d.pointerId !== ev.pointerId) return
        cleanup()
        // Chromium fires pointercancel when HTML5 drag starts (often before/with
        // dragStart). Defer so dragStart can mark html5; then either dragEnd
        // finishes, or we fall back to pointer extract.
        queueMicrotask(() => {
          const cur = extractRef.current
          if (!cur || cur.personId !== personId) return
          if (cur.html5) return
          extractRef.current = null
          if (cur.armed) finishExtractAt(personId, cur.lastX, cur.lastY)
        })
      }

      window.addEventListener('pointermove', onMove, true)
      window.addEventListener('pointerup', onUp, true)
      window.addEventListener('pointercancel', onCancel, true)
    },
    [finishExtractAt, locked, selectPerson],
  )

  const kindTitle = clusterKindLabel(data.kind)
  const compact = Boolean(data.compact)
  const size = clusterSize(data.memberIds.length, data.collapsed, compact)
  const memberH = compact ? MEMBER_MINI_H : PERSON_H
  const canApply =
    !isPhantomGroupKind(data.kind) && data.memberIds.length >= 2

  /** Exact RF default dock — source+target on the same side must share one pixel. */
  const portTop = {
    left: '50%',
    top: 0,
    right: 'auto',
    bottom: 'auto',
    transform: 'translate(-50%, -50%)',
  } as const
  const portBottom = {
    left: '50%',
    top: 'auto',
    right: 'auto',
    bottom: 0,
    transform: 'translate(-50%, 50%)',
  } as const
  const portLeft = {
    left: 0,
    top: '50%',
    right: 'auto',
    bottom: 'auto',
    transform: 'translate(-50%, -50%)',
  } as const
  const portRight = {
    left: 'auto',
    top: '50%',
    right: 0,
    bottom: 'auto',
    transform: 'translate(50%, -50%)',
  } as const

  return (
    <div
      ref={rootRef}
      className={[
        'cluster-card relative flex flex-col overflow-visible rounded-lg border bg-[var(--pt-panel)] shadow-[0_8px_22px_rgba(0,0,0,0.45)]',
        selected ? 'cluster-card--selected' : '',
      ].join(' ')}
      style={{
        width: size.w,
        height: size.h,
        borderColor: 'var(--pt-border)',
        boxSizing: 'border-box',
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <Handle
        type="source"
        id="port-phantom-top"
        position={Position.Top}
        isConnectable
        title="Фантом-связь"
        className="pt-port pt-port--phantom nodrag nopan"
        style={portTop}
      />
      <Handle
        type="target"
        id="port-phantom-top-in"
        position={Position.Top}
        isConnectable
        title="Фантом-связь"
        className="pt-port pt-port--phantom nodrag nopan"
        style={portTop}
      />
      <Handle
        type="source"
        id="port-phantom-bottom"
        position={Position.Bottom}
        isConnectable
        title="Фантом-связь"
        className="pt-port pt-port--phantom nodrag nopan"
        style={portBottom}
      />
      <Handle
        type="target"
        id="port-phantom-bottom-in"
        position={Position.Bottom}
        isConnectable
        title="Фантом-связь"
        className="pt-port pt-port--phantom nodrag nopan"
        style={portBottom}
      />
      <Handle
        type="source"
        id="port-phantom-right"
        position={Position.Right}
        isConnectable
        title="Фантом-связь"
        className="pt-port pt-port--phantom nodrag nopan"
        style={portRight}
      />
      <Handle
        type="target"
        id="port-phantom-right-in"
        position={Position.Right}
        isConnectable
        title="Фантом-связь"
        className="pt-port pt-port--phantom nodrag nopan"
        style={portRight}
      />
      <Handle
        type="source"
        id="port-phantom-left"
        position={Position.Left}
        isConnectable
        title="Фантом-связь"
        className="pt-port pt-port--phantom nodrag nopan"
        style={portLeft}
      />
      <Handle
        type="target"
        id="port-phantom-left-in"
        position={Position.Left}
        isConnectable
        title="Фантом-связь"
        className="pt-port pt-port--phantom nodrag nopan"
        style={portLeft}
      />

      <div
        className="flex shrink-0 items-center gap-1 border-b border-[var(--pt-border)] px-1.5"
        style={{ height: CLUSTER_HEADER, boxSizing: 'border-box' }}
      >
        <button
          type="button"
          className="nodrag nopan flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] text-[var(--pt-muted)] hover:bg-white/5 hover:text-[var(--pt-text)]"
          title={data.collapsed ? 'Развернуть контейнер' : 'Свернуть контейнер'}
          onClick={(e) => {
            e.stopPropagation()
            setClusterCollapsed(id, !data.collapsed)
          }}
        >
          {data.collapsed ? '▸' : '▾'}
        </button>
        <div className="min-w-0 flex-1 leading-none">
          <div className="truncate text-[11px] font-semibold leading-tight text-[var(--pt-text)]">
            {data.label}
          </div>
          <div className="truncate text-[9px] uppercase leading-tight tracking-wide text-[var(--pt-muted)]">
            {kindTitle} · {data.memberIds.length}
          </div>
        </div>
        {canApply ? (
          <button
            type="button"
            className="nodrag nopan flex h-5 shrink-0 items-center justify-center rounded border border-[var(--pt-accent)]/45 px-1 text-[9px] font-semibold text-[var(--pt-accent)] hover:bg-[var(--pt-accent)]/15"
            title="Применить связь · создать рёбра по типу контейнера"
            onClick={(e) => {
              e.stopPropagation()
              applyClusterRelations(id)
            }}
          >
            ≈
          </button>
        ) : null}
        <button
          type="button"
          className="nodrag nopan flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[var(--pt-border)] text-[10px] text-[var(--pt-muted)] hover:bg-white/5 hover:text-[var(--pt-text)]"
          title={locked ? 'Разблокировать · можно вытащить карточки' : 'Заблокировать · нельзя вытащить'}
          onClick={(e) => {
            e.stopPropagation()
            updateCluster(id, { locked: !locked })
          }}
        >
          {locked ? '🔒' : '🔓'}
        </button>
        {!data.collapsed ? (
          <button
            type="button"
            className="nodrag nopan flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[var(--pt-border)] text-[10px] text-[var(--pt-muted)] hover:bg-white/5 hover:text-[var(--pt-text)]"
            title={compact ? 'Полные фото' : 'Мини-вид'}
            onClick={(e) => {
              e.stopPropagation()
              updateCluster(id, { compact: !compact })
            }}
          >
            {compact ? '▣' : '▤'}
          </button>
        ) : null}
      </div>

      {data.collapsed ? (
        <div
          className="flex items-center px-2 text-[10px] text-[var(--pt-muted)]"
          style={{ height: CLUSTER_COLLAPSED_BODY, boxSizing: 'border-box' }}
        >
          {data.memberIds.length
            ? `${data.memberIds.length} чел. · перетащите сюда`
            : 'Пусто · перетащите карточки'}
        </div>
      ) : (
        <div
          className={[
            'flex min-h-0 flex-1 flex-col overflow-hidden',
            compact ? 'items-stretch' : 'items-center',
          ].join(' ')}
          style={{
            padding: CLUSTER_PAD,
            gap: MEMBER_GAP,
            boxSizing: 'border-box',
          }}
        >
          {data.members.length === 0 ? (
            <div
              className="flex w-full items-center justify-center rounded border border-dashed border-[var(--pt-border)] px-2 text-center text-[10px] text-[var(--pt-muted)]"
              style={{ height: memberH, width: PERSON_W }}
            >
              Перетащите карточки с поля или из каталога
            </div>
          ) : compact ? (
            data.members.map((m) => {
              const thumb = resolveMediaUrl(m.photoRef)
              const years = formatLifespanRu(m.birth, m.death)
              return (
                <div
                  key={m.id}
                  className={[
                    'nodrag nopan flex shrink-0 items-center gap-1.5 overflow-hidden rounded-md border border-[var(--pt-border)] bg-[var(--pt-bg)]/70 px-1.5',
                    locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
                  ].join(' ')}
                  style={{ height: MEMBER_MINI_H, width: '100%', boxSizing: 'border-box' }}
                  draggable={!locked}
                  title={
                    locked
                      ? 'Контейнер заблокирован — разблокируйте, чтобы вытащить'
                      : 'Перетащите на поле, чтобы вытащить'
                  }
                  onPointerDown={(e) => onMemberPointerDown(m.id, e)}
                  onDragStart={(e) => beginMemberHtml5Drag(m.id, e)}
                  onDragEnd={(e) => onMemberHtml5DragEnd(m.id, e)}
                >
                  <span
                    className="h-7 w-7 shrink-0 overflow-hidden rounded"
                    style={{
                      background: m.gender === 'M' ? 'var(--pt-male)' : 'var(--pt-female)',
                    }}
                  >
                    {thumb ? (
                      <img src={thumb} alt="" className="h-full w-full object-cover" draggable={false} />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[11px] text-[var(--pt-text)]">
                      {m.label}
                    </span>
                    {years ? (
                      <span className="block truncate text-[9px] text-[var(--pt-muted)]">
                        {years}
                      </span>
                    ) : null}
                  </span>
                </div>
              )
            })
          ) : (
            data.members.map((m) => {
              const { id: memberId, ...face } = m
              return (
                <div
                  key={memberId}
                  className={[
                    'nodrag nopan shrink-0 overflow-visible',
                    locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
                  ].join(' ')}
                  style={{ height: PERSON_H, width: PERSON_W, boxSizing: 'border-box' }}
                  draggable={!locked}
                  title={
                    locked
                      ? 'Контейнер заблокирован — разблокируйте, чтобы вытащить'
                      : 'Перетащите на поле, чтобы вытащить'
                  }
                  onPointerDown={(e) => onMemberPointerDown(memberId, e)}
                  onDragStart={(e) => beginMemberHtml5Drag(memberId, e)}
                  onDragEnd={(e) => onMemberHtml5DragEnd(memberId, e)}
                >
                  <PersonCardFace
                    data={face}
                    selected={selectedId === memberId}
                  />
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export const ClusterNode = memo(ClusterNodeComponent)
