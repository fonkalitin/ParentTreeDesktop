import test from 'node:test'
import assert from 'node:assert/strict'
import { portableTree, cloneDocument } from '../src/lib/portableTree.ts'

const document = () => ({
  version:'1.0', metadata:{title:'Test tree',createdAt:'2026-01-01',updatedAt:'2026-01-01',treeId:'legacy-record',archivedAt:'old'},
  nodes:[{id:'one',type:'person',position:{x:0,y:0},data:{label:'One',gender:'M',
    photoRef:{key:'shared.png',mimeType:'image/png'},
    attachments:[{id:'a',key:'shared.png',name:'photo.png',mimeType:'image/png',size:1}]}}],
  edges:[],clusters:[],phantoms:[]
})
test('portable copy detaches legacy metadata, embeds/deduplicates media, preserves source', async () => {
  const source=document(); const before=structuredClone(source); let calls=0
  const copy=await portableTree(source,async()=>{calls++;return 'data:image/png;base64,AA=='})
  assert.equal(calls,1)
  assert.equal(copy.metadata.treeId,undefined)
  assert.equal(copy.metadata.archivedAt,undefined)
  assert.equal(copy.nodes[0].data.photoRef.key,undefined)
  assert.equal(copy.nodes[0].data.attachments[0].key,undefined)
  assert.equal(copy.nodes[0].data.attachments[0].id,'a')
  assert.match(copy.nodes[0].data.attachments[0].dataUrl,/^data:/)
  assert.deepEqual(source,before)
})
test('missing media aborts export without mutating source',async()=>{
 const source=document(); const before=structuredClone(source)
 await assert.rejects(portableTree(source,async()=>{throw Error('offline')}),/offline/)
 assert.deepEqual(source,before)
})
test('embedded media requires no network, including imported legacy metadata',async()=>{
 const source=document()
 source.nodes[0].data.photoRef={key:'old',dataUrl:'data:image/png;base64,AA=='}
 source.nodes[0].data.attachments=[]
 const copy=await portableTree(source,async()=>{throw Error('unexpected network')})
 assert.equal(copy.nodes[0].data.photoRef.key,undefined)
 assert.equal(copy.nodes[0].data.photoRef.dataUrl,'data:image/png;base64,AA==')
 assert.equal(cloneDocument(source).metadata.treeId,undefined)
})
test('legacy photo is embedded; invalid input rejected',async()=>{
 const source=document(); source.nodes[0].data.photoRef=null;source.nodes[0].data.attachments=[]
 source.nodes[0].data.photo='https://example.invalid/photo'
 const copy=await portableTree(source,async()=> 'data:image/png;base64,AA==')
 assert.match(copy.nodes[0].data.photo,/^data:/)
 assert.throws(()=>cloneDocument({nodes:[]}),/ParentTree/)
})
