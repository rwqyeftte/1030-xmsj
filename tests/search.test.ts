import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../contracts/fixtures.json';
import type {AppData, QueryRecord} from '../contracts/domain';
import {publicResults} from '../src/search';
const seed=()=>structuredClone(fixture) as AppData;
const params=(q:Record<string,string>={})=>new URLSearchParams(q);
const ids=(resources:ReturnType<typeof publicResults>)=>resources.map(r=>r.id);
const addQuery=(data:AppData,rules:QueryRecord['rules'])=>{data.savedQueries.push({id:'test-query',ownerId:'demo-user',scope:'public',q:'',mode:'standard',rules,targetProjectId:null});return params({queryId:'test-query'});};

test('公开关键词检索命中题名和主题，所有会话均排除私有资料',()=>{
 const d=seed();const found=ids(publicResults(d,params({q:'保温瓶'})));
 assert.ok(found.includes('I16'));assert.ok(found.includes('DEMO-TEXT'));assert.equal(found.includes('PRIVATE-DEMO'),false);
 d.session.userId=null;assert.deepEqual(ids(publicResults(d,params({q:'保温瓶'}))),found);
});
test('对照所需演示材料可通过公开关键词检索找到，真实目录不伪造全文',()=>{
 const d=seed();const found=ids(publicResults(d,params({q:'同一段落'})));
 assert.deepEqual(found,['DEMO-TEXT']);
 assert.equal(publicResults(d,params({q:'从未提供的史料原文'})).length,0);
});
test('类型筛选与查询取交集，可同时选择多种类型',()=>{
 const d=seed();const all=publicResults(d,params({q:'保温瓶'}));
 const filtered=publicResults(d,params({q:'保温瓶',types:'image,article'}));
 assert.ok(filtered.length>0);assert.ok(filtered.length<all.length);
 assert.ok(filtered.every(r=>['image','article'].includes(r.mediaType)&&all.some(a=>a.id===r.id)));
});
test('来源、主题、可读范围共同约束相同结果集',()=>{
 const d=seed();const result=publicResults(d,params({subjects:'保温瓶',source:'synthetic',access:'demo_readable'}));
 assert.deepEqual(ids(result),['DEMO-TEXT','DEMO-IMAGE','DEMO-VIDEO']);
});
test('列表、图文、归类、加载量均不改变检索范围与总数',()=>{
 const d=seed();const expected=ids(publicResults(d,params({q:'保温瓶'})));
 for(const view of ['list','grid','grouped'])assert.deepEqual(ids(publicResults(d,params({q:'保温瓶',view,loaded:'1'}))),expected);
});
test('专题内检索只取公开成员，未知专题不能静默扩大范围',()=>{
 const d=seed();const result=publicResults(d,params({topicId:'topic-demo-01'}));
 assert.equal(result.length,5);assert.ok(result.every(r=>d.topics[0].resourceIds.includes(r.id)));
 assert.deepEqual(publicResults(d,params({topicId:'unknown'})),[]);
});
test('缺失高级策略返回空结果，让UI明确提示条件不可恢复',()=>{
 assert.deepEqual(publicResults(seed(),params({queryId:'missing'})),[]);
});
test('AND、OR、NOT按顺序作用且不会通过OR泄露私人记录',()=>{
 const d=seed();const p=addQuery(d,[{field:'title',operator:'AND',value:'不存在'},{field:'title',operator:'OR',value:'私人上传'}]);
 assert.deepEqual(publicResults(d,p),[]);
 d.savedQueries.find(q=>q.id==='test-query')!.rules=[{field:'subject',operator:'AND',value:'摄影器材'},{field:'title',operator:'NOT',value:'取景'}];
 const result=publicResults(d,p);assert.ok(result.length>0);assert.ok(result.every(r=>r.subjects.includes('摄影器材')&&!r.title.includes('取景')));
});
test('高级原文条件仅检索任务包实际合成正文',()=>{
 const d=seed();const p=addQuery(d,[{field:'fulltext',operator:'AND',value:'材料编号、版本和位置'}]);
 assert.deepEqual(ids(publicResults(d,p)),['DEMO-TEXT']);
});
test('没有基础关键词时首条OR条件也必须真正限制结果',()=>{
 const d=seed();const p=addQuery(d,[{field:'title',operator:'OR',value:'合成阅读测试文本'}]);
 assert.deepEqual(ids(publicResults(d,p)),['DEMO-TEXT']);
});
test('题名含1975不被推断为出版日期；原始日期未详单独可筛选',()=>{
 const d=seed();assert.ok(ids(publicResults(d,params({q:'1975'}))).includes('B04'));
 assert.equal(ids(publicResults(d,params({date:'known'}))).includes('B04'),false);
 assert.ok(ids(publicResults(d,params({date:'unknown'}))).includes('B04'));
 const p=addQuery(d,[{field:'date',operator:'AND',value:'1975'}]);assert.equal(ids(publicResults(d,p)).includes('B04'),false);
});
test('排序只改变排列，不改变资料ID集合或原始仓库顺序',()=>{
 const d=seed(), before=JSON.stringify(d);const initial=ids(publicResults(d,params()));
 const sorted=publicResults(d,params({sort:'title'}));assert.deepEqual(ids(sorted).sort(),initial.sort());
 assert.equal(JSON.stringify(d),before);assert.equal(new Set(ids(sorted)).size,sorted.length);
});
test('日期排序把真正缺失的原始日期置后，保留日期类型',()=>{
 const d=seed();d.resources[0].sourceDate='1980';d.resources[0].sourceDateType='publication';
 d.resources[1].sourceDate='1990';d.resources[1].sourceDateType='object';
 const sorted=publicResults(d,params({sort:'date'}));assert.deepEqual(ids(sorted).slice(0,2),['B02','B01']);assert.equal(sorted[0].sourceDateType,'object');
});
