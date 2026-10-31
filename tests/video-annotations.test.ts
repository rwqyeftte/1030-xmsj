import test from 'node:test';
import assert from 'node:assert/strict';
import seed from '../contracts/fixtures.json';
import type {AppData} from '../contracts/domain';
import {validVideoAnchor,videoTime,videoAnchorLabel,hasDemoVideo,videoNotes,type VideoAnchor} from '../src/video-annotations';

const base={id:'test-video',resourceId:'DEMO-VIDEO',resourceVersionId:'DEMO-VIDEO-v1',isDemo:true,kind:'video' as const};
test('时间点和旧片段分别校验，拒绝越界、倒序、非有限值',()=>{
  assert.ok(validVideoAnchor({...base,startSec:0,endSec:0,point:true},20));
  assert.ok(validVideoAnchor({...base,startSec:20,endSec:20,point:true},20));
  assert.ok(validVideoAnchor({...base,startSec:3,endSec:7},20));
  for(const range of [{startSec:3,endSec:3},{startSec:3,endSec:7,point:true},{startSec:-1,endSec:5},{startSec:21,endSec:21,point:true},{startSec:7,endSec:3},{startSec:NaN,endSec:5},{startSec:0,endSec:Infinity}])assert.equal(validVideoAnchor({...base,...range},20),false);
  assert.equal(videoTime(3661.8),'1:01:01');assert.equal(videoTime(65),'01:05');
  assert.equal(videoAnchorLabel({...base,startSec:5,endSec:5,point:true}),'00:05');
  assert.equal(videoAnchorLabel({...base,startSec:3,endSec:7}),'00:03–00:07');
});
test('演示短片严格匹配资料和内容版本，其他视频不会被替换',()=>{
  const data=structuredClone(seed) as AppData,r=data.resources.find(r=>r.id==='DEMO-VIDEO')!,c=data.contents.find(c=>c.id===r.contentId)!;
  assert.ok(hasDemoVideo(r,c));
  for(const changed of [{...r,id:'private-video'},{...r,isDemo:false},{...r,contentId:null},{...r,versionId:'v2'},{...r,access:'restricted' as const}])assert.equal(hasDemoVideo(changed,c),false);
  assert.equal(hasDemoVideo(r,{...c,versionId:'v2'}),false);
});
test('视频笔记按时间排序，限制当前用户、当前版本和最新修订，保留旧片段',()=>{
  const data=structuredClone(seed) as AppData;data.notes=[];data.anchors=[];
  for(const [id,start,end,point] of [['later',10,10,true],['earlier',3,7,false]] as const){
    const a:VideoAnchor={...base,id,startSec:start,endSec:end,point};data.anchors.push(a);
    data.notes.push({id,ownerId:data.session.userId!,originProjectId:null,title:id,type:'observation',currentRevision:1,revisions:[{revision:1,body:id,anchorIds:[id],createdAt:'2026-10-31',aiAssisted:false}],relatedNoteIds:[]});
  }
  const before=JSON.stringify(data);assert.deepEqual(videoNotes(data,'DEMO-VIDEO').map(n=>n.note.id),['earlier','later']);assert.equal(JSON.stringify(data),before);
  data.notes[0].currentRevision=2;data.notes[0].revisions.push({...data.notes[0].revisions[0],revision:2,anchorIds:[]});assert.equal(videoNotes(data,'DEMO-VIDEO').length,1);
  data.notes[1].ownerId='other-user';assert.equal(videoNotes(data,'DEMO-VIDEO').length,0);
  data.notes[1].ownerId=data.session.userId!;data.resources.find(r=>r.id==='DEMO-VIDEO')!.versionId='v2';assert.equal(videoNotes(data,'DEMO-VIDEO').length,0);
});
