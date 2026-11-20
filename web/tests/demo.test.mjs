import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
test('ordinary demonstration document: four grandparents, parents and two children', () => {
 const doc = JSON.parse(fs.readFileSync(new URL('../../examples/Ивановы.fam', import.meta.url), 'utf8'))
 const embedded = JSON.parse(fs.readFileSync(new URL('../../desktop/demo.fam', import.meta.url), 'utf8'))
 assert.deepEqual(doc, embedded)
 assert.equal(doc.nodes.length, 8)
 assert.deepEqual(new Set(doc.metadata.placedIds), new Set(doc.nodes.map(n => n.id)))
 assert.equal(doc.edges.filter(e => e.type === 'spouse').length, 3)
 const depth = id => {
   const parents = doc.edges.filter(e => e.type === 'parent' && e.target === id).map(e => e.source)
   return parents.length ? 1 + Math.max(...parents.map(depth)) : 0
 }
 const levels = doc.nodes.map(n => depth(n.id))
 assert.deepEqual([0,1,2].map(level => levels.filter(v => v === level).length), [4,2,2])
 assert.ok(doc.nodes.every(n => n.data.notes.includes('Вымышленный')))
})
