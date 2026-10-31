import test from 'node:test';
import assert from 'node:assert/strict';
import seed from '../contracts/fixtures.json';
import type {AppData} from '../contracts/domain';
import {boxBetween,moveBox,resizeBox,validImageBox,imageNotes} from '../src/image-annotations';

test('反向框选和越界拖动始终得到图内区域，零面积不可保存',()=>{
  const b=boxBetween({x:.8,y:.9},{x:.2,y:.3});
  assert.ok(validImageBox(b));assert.equal(b.x,.2);assert.equal(b.y,.3);
  assert.deepEqual(boxBetween({x:-1,y:-1},{x:2,y:3}),{x:0,y:0,width:1,height:1});
  assert.equal(validImageBox(boxBetween({x:.4,y:.4},{x:.4,y:.4})),false);
  assert.equal(validImageBox({...b,width:Infinity}),false);
  assert.equal(validImageBox({...b,x:NaN}),false);
});
test('移动和四角缩放不会越界、反转或改变原对象',()=>{
  const b={x:.25,y:.25,width:.5,height:.5},before={...b};
  assert.deepEqual(moveBox(b,10,-10),{x:.5,y:0,width:.5,height:.5});
  for(const corner of ['nw','ne','sw','se'])for(const point of [{x:-10,y:-10},{x:10,y:10},{x:.5,y:.5}])assert.ok(validImageBox(resizeBox(b,corner,point)));
  const edge={x:.995,y:.995,width:.005,height:.005};
  assert.ok(validImageBox(resizeBox(edge,'se',{x:2,y:2})));
  assert.deepEqual(b,before);
});
test('图片笔记列表只包含当前用户、当前图片版本和笔记最新修订的区域',()=>{
  const data=structuredClone(seed) as AppData;
  const original=imageNotes(data,'DEMO-IMAGE');assert.equal(original.length,2);
  const before=JSON.stringify(data),record=original[0];
  const other=structuredClone(record.note);other.id='other-user-note';other.ownerId='someone-else';data.notes.push(other);
  assert.equal(imageNotes(data,'DEMO-IMAGE').length,2);
  record.note.currentRevision=2;record.note.revisions.push({...record.revision,revision:2,anchorIds:[]});
  assert.equal(imageNotes(data,'DEMO-IMAGE').length,1);
  data.resources.find(r=>r.id==='DEMO-IMAGE')!.versionId='new-version';
  assert.equal(imageNotes(data,'DEMO-IMAGE').length,0);
  const clean=structuredClone(seed) as AppData;imageNotes(clean,'DEMO-IMAGE');assert.equal(JSON.stringify(clean),before);
  clean.session.userId=null;assert.equal(imageNotes(clean,'DEMO-IMAGE').length,0);
});
