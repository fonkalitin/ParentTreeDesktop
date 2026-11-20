// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { PersonFlowData } from '../layout/layoutTree'
import { SIBLING_PORT_DX } from '../lib/marriageGeometry'
import { PersonCardFace } from './PersonCardFace'

type PersonFlowNode = Node<PersonFlowData, 'person'>

/**
 * Port convention:
 * - Top center (blue): «От родителя»
 * - Orphans: teal sibling ports left of center
 * - Gray phantom: right of top-center
 * - Bottom (blue): «К детям»; sides (gold): брак
 */
function PersonNodeComponent({ data, selected }: NodeProps<PersonFlowNode>) {
  const orphan = Boolean(data.isOrphan)

  return (
    <div className="relative">
      <PersonCardFace data={data} selected={selected} />

      <Handle
        type="target"
        id="port-top"
        position={Position.Top}
        isConnectable
        title="От родителя"
        className="pt-port pt-port--top nodrag nopan"
      />

      {orphan ? (
        <>
          <Handle
            type="source"
            id="port-sibling-out"
            position={Position.Top}
            isConnectable
            title="Брат / сестра · временно"
            className="pt-port pt-port--sibling nodrag nopan"
            style={{ left: `calc(50% - ${SIBLING_PORT_DX}px)`, top: -2 }}
          />
          <Handle
            type="target"
            id="port-sibling-in"
            position={Position.Top}
            isConnectable
            title="Брат / сестра · временно"
            className="pt-port pt-port--sibling nodrag nopan"
            style={{ left: `calc(50% - ${SIBLING_PORT_DX}px)`, top: -2 }}
          />
        </>
      ) : null}

      <Handle
        type="source"
        id="port-phantom"
        position={Position.Top}
        isConnectable
        title="Фантом-связь (неопределённая)"
        className="pt-port pt-port--phantom nodrag nopan"
        style={{ left: `calc(50% + ${SIBLING_PORT_DX}px)`, top: -2 }}
      />
      <Handle
        type="target"
        id="port-phantom-in"
        position={Position.Top}
        isConnectable
        title="Фантом-связь (неопределённая)"
        className="pt-port pt-port--phantom nodrag nopan"
        style={{ left: `calc(50% + ${SIBLING_PORT_DX}px)`, top: -2 }}
      />

      <Handle
        type="source"
        id="port-bottom"
        position={Position.Bottom}
        isConnectable
        title="К детям"
        className="pt-port pt-port--bottom nodrag nopan"
      />

      <Handle
        type="source"
        id="port-spouse-out"
        position={Position.Right}
        isConnectable
        title="Брак"
        className="pt-port pt-port--side nodrag nopan"
        style={{ top: '50%' }}
      />
      <Handle
        type="target"
        id="port-spouse-in"
        position={Position.Left}
        isConnectable
        title="Брак"
        className="pt-port pt-port--side nodrag nopan"
        style={{ top: '50%' }}
      />
    </div>
  )
}

export const PersonNode = memo(PersonNodeComponent)
