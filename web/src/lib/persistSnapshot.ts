// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
/** One writer; only an acknowledgement for the current snapshot may clear dirty. */
export function createSnapshotWriter<S>(ops: {
  writeFile: (snapshot: S) => Promise<void>
  acknowledge: (snapshot: S) => Promise<void>
  isCurrent: (snapshot: S) => boolean
  saved: (snapshot: S) => void
}) {
  let busy = false
  let disk: Promise<void> = Promise.resolve()
  const backup = (snapshot: S) => {
    const next = disk.catch(() => {}).then(() => ops.writeFile(snapshot))
    disk = next
    return next
  }
  return async (snapshot: S) => {
    if (busy) { await backup(snapshot); return false }
    busy = true
    try {
      await backup(snapshot)
      await ops.acknowledge(snapshot)
      if (ops.isCurrent(snapshot)) ops.saved(snapshot)
      return true
    } finally { busy = false }
  }
}
