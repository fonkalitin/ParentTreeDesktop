// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
type MenuItem = {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

type Props = {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  return (
    <div
      className="fixed z-50 min-w-[200px] overflow-hidden rounded-lg border border-[var(--pt-border)] bg-[var(--pt-panel)] py-1 shadow-2xl"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          disabled={item.disabled}
          className={[
            'block w-full px-3 py-1.5 text-left text-xs hover:bg-white/5 disabled:opacity-40',
            item.danger ? 'text-rose-300' : 'text-[var(--pt-text)]',
          ].join(' ')}
          onClick={() => {
            if (item.disabled) return
            item.onClick()
            onClose()
          }}
        >
          {item.label}
        </button>
      ))}
      <button
        type="button"
        className="mt-1 block w-full border-t border-[var(--pt-border)] px-3 py-1.5 text-left text-xs text-[var(--pt-muted)] hover:bg-white/5"
        onClick={onClose}
      >
        Отмена
      </button>
    </div>
  )
}
