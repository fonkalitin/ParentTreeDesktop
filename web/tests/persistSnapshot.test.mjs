import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSnapshotWriter } from '../src/lib/persistSnapshot.ts'

test('newer edits remain dirty when an older snapshot is acknowledged', async () => {
  const events = []; let current = 1
  const write = createSnapshotWriter({
    writeFile: async () => { events.push('disk') },
    acknowledge: async () => { events.push('acknowledged'); current = 2 },
    isCurrent: snapshot => current === snapshot,
    saved: () => events.push('clean'),
  })
  await write(1)
  assert.deepEqual(events, ['disk', 'acknowledged'])
})
test('failed acknowledgement preserves file copy and permits retry', async () => {
  let failed = true; let copies = 0; let saved = 0
  const write = createSnapshotWriter({
    writeFile: async () => { copies++ },
    acknowledge: async () => { if (failed) throw Error('acknowledgement failed') },
    isCurrent: () => true, saved: () => saved++,
  })
  await assert.rejects(write(1), /acknowledgement failed/)
  assert.equal(copies, 1); assert.equal(saved, 0)
  failed = false; await write(1)
  assert.equal(saved, 1)
})
test('slow request never permits parallel acknowledgement', async () => {
  let release; let acknowledgements = 0
  const gate = new Promise(resolve => { release = resolve })
  const write = createSnapshotWriter({
    writeFile: async () => {},
    acknowledge: async () => { acknowledgements++; await gate },
    isCurrent: () => true, saved: () => {},
  })
  const first = write(1)
  await Promise.resolve()
  assert.equal(await write(2), false)
  release(); await first
  assert.equal(acknowledgements, 1)
})
test('disk failure prevents acknowledgement and false saved acknowledgement', async () => {
  let acknowledgements = 0; let saved = 0
  const write = createSnapshotWriter({
    writeFile: async () => { throw Error('disk full') },
    acknowledge: async () => { acknowledgements++ },
    isCurrent: () => true, saved: () => saved++,
  })
  await assert.rejects(write(1), /disk full/)
  assert.equal(acknowledgements, 0); assert.equal(saved, 0)
})
