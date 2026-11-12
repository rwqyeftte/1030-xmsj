import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../contracts/fixtures.json';
import type {AppData,SourceAnchor} from '../contracts/domain';
import {readingCardRef} from '../src/reading-card';
import {commitData,placeNode} from '../src/store';

const data=()=>structuredClone(fixture) as AppData;
const draft={title:'相同引文',body:'我的观察',type:'interpretation',ai:false};
const pid='project-empty';

test('重复选择同一处原文和观察复用卡片，同文异处分别定位',()=>{
  const d=data(),r=d.resources.find(r=>r.id==='DEMO-TEXT')!;
  const a:SourceAnchor={id:'new-anchor',isDemo:true,resourceId:r.id,resourceVersionId:r.versionId,kind:'text',paragraphId:'p1',startOffset:0,endOffset:2,quote:'设计'};
  const first=placeNode(d,pid,readingCardRef(d,pid,r,a,draft));
  const same=placeNode(d,pid,readingCardRef(d,pid,r,{...a,id:'another-selection'},draft));
  assert.equal(same.id,first.id);
  // The researcher dragged their first card to what used to be the next default slot.
  Object.assign(first,{x:350,y:60});
  const elsewhere=placeNode(d,pid,readingCardRef(d,pid,r,{...a,id:'different',paragraphId:'p2'},draft));
  assert.notEqual(elsewhere.ref.id,first.ref.id);
  assert.ok(elsewhere.x+elsewhere.width<=first.x || elsewhere.x>=first.x+first.width ||
    elsewhere.y+elsewhere.height<=first.y || elsewhere.y>=first.y+first.height);
  assert.equal(d.notes.find(n=>n.id===first.ref.id)?.revisions[0].body,draft.body);
  assert.deepEqual(d.notes.find(n=>n.id===elsewhere.ref.id)?.revisions[0].anchorIds,['different']);
});

test('以选区直接存卡保留原坐标，不要求填写观察；存储失败时不留下空白笔记',()=>{
  const d=data(),r=d.resources.find(r=>r.id==='DEMO-IMAGE')!;
  const a:SourceAnchor={id:'crop',isDemo:true,kind:'image',resourceId:r.id,resourceVersionId:r.versionId,x:.2,y:.3,width:.4,height:.1};
  const place=(state:AppData)=>placeNode(state,pid,readingCardRef(state,pid,r,a,{title:'',body:'',type:'observation',ai:false}));
  const original=JSON.stringify(d);
  assert.throws(()=>commitData(d,place,()=>{throw Error('quota');}),/quota/);
  assert.equal(JSON.stringify(d),original);
  const node=place(d);
  const note=d.notes.find(n=>n.id===node.ref.id)!;
  assert.ok(note.title);
  assert.deepEqual(d.anchors.find(source=>source.id===note.revisions[0].anchorIds[0]),a);
  assert.equal(note.revisions[0].body,'');
});
