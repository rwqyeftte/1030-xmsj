import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../contracts/fixtures.json';
import type {AppData} from '../contracts/domain';
import {addMembers,placeNode,assertWritable,makeReviewData,commitData,canRead} from '../src/store';
const seed=()=>structuredClone(fixture) as AppData;
test('加入项目引用幂等、不复制资料主记录、默认不摆放',()=>{
 const d=seed(), total=d.resources.length, nodes=d.boardNodes.length;
 addMembers(d,'project-empty',[{kind:'resource',id:'DEMO-TEXT'},{kind:'resource',id:'DEMO-TEXT'}]);
 assert.equal(d.projectMembers.filter(m=>m.projectId==='project-empty').length,1);
 assert.equal(d.resources.length,total);assert.equal(d.boardNodes.length,nodes);
});
test('放置默认复用已有节点，与项目文件共用同一引用',()=>{
 const d=seed();const a=placeNode(d,'project-empty',{kind:'resource',id:'DEMO-TEXT'});const b=placeNode(d,'project-empty',{kind:'resource',id:'DEMO-TEXT'});
 assert.equal(a.id,b.id);assert.equal(d.boardNodes.filter(n=>n.projectId==='project-empty').length,1);assert.equal(d.projectMembers.filter(m=>m.projectId==='project-empty').length,1);
});
test('归档项目拒绝直接命令和通用提交修改',()=>{
 const d=seed();assert.throws(()=>assertWritable(d,'project-archived'),/只读/);
 assert.throws(()=>addMembers(d,'project-archived',[{kind:'resource',id:'DEMO-TEXT'}]),/只读/);
 assert.throws(()=>commitData(d,x=>x.researchPlans.find(p=>p.projectId==='project-archived')!.sections.topic.body='写入',()=>{}),/只读/);
});
test('事务存储失败不改变原状态，成功后获得新的已提交状态',()=>{
 const d=seed(), original=JSON.stringify(d);
 assert.throws(()=>commitData(d,x=>addMembers(x,'project-empty',[{kind:'resource',id:'DEMO-TEXT'}]),()=>{throw new Error('quota');}),/quota/);
 assert.equal(JSON.stringify(d),original);
 let persisted='';const saved=commitData(d,x=>addMembers(x,'project-empty',[{kind:'resource',id:'DEMO-TEXT'}]),s=>{persisted=s;});
 assert.deepEqual(JSON.parse(persisted),saved);assert.notDeepEqual(saved,d);
});
test('访客不能读私人资料或个人笔记',()=>{
 const d=seed();d.session.userId=null;
 assert.equal(canRead(d,{kind:'resource',id:'PRIVATE-DEMO'}),false);assert.equal(canRead(d,{kind:'note',id:'note-demo-01'}),false);assert.equal(canRead(d,{kind:'resource',id:'DEMO-TEXT'}),true);
});
test('评审数据克隆隔离，空画布不会清除基准保存内容',()=>{
 const initial=JSON.stringify(fixture);const empty=makeReviewData('P14__empty');const readonly=makeReviewData('P14__read-only');
 assert.equal(empty.boardNodes.filter(n=>n.projectId==='project-demo-01').length,0);assert.equal(readonly.projects[0].status,'archived');assert.equal(JSON.stringify(fixture),initial);assert.ok(seed().boardNodes.length>0);
});
test('不可访问引用使整组提交失败',()=>{
 const d=seed();const before=d.projectMembers.length;
 assert.throws(()=>commitData(d,x=>addMembers(x,'project-empty',[{kind:'resource',id:'DEMO-TEXT'},{kind:'resource',id:'MISSING'}]),()=>{}),/失效/);
 assert.equal(d.projectMembers.length,before);
});
