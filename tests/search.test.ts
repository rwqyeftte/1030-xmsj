import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../contracts/fixtures.json';
import type {AppData, QueryRecord} from '../contracts/domain';
import {publicResults,searchCatalog} from '../src/search';
import {withCourseFiles} from '../src/featured';
const seed=()=>structuredClone(fixture) as AppData;
const params=(q:Record<string,string>={})=>new URLSearchParams(q);
const ids=(resources:ReturnType<typeof publicResults>)=>resources.map(r=>r.id);
const addQuery=(data:AppData,rules:QueryRecord['rules'])=>{data.savedQueries.push({id:'test-query',ownerId:'demo-user',scope:'public',q:'',mode:'standard',rules,targetProjectId:null});return params({queryId:'test-query'});};

test('AI模式直接匹配自然语言中的公开主题，保留原描述且不改变常规检索',()=>{
 const d=seed(),q='我想找有关保温瓶的研究资料',p=params({q,mode:'ai'});
 const before=JSON.stringify(d);
 assert.deepEqual(ids(publicResults(d,p)),ids(publicResults(d,params({q:'保温瓶'}))));
 assert.ok(publicResults(d,p).length>0);
 assert.equal(publicResults(d,params({q,mode:'standard'})).length,0);
 assert.equal(p.get('q'),q);assert.equal(JSON.stringify(d),before);
});

test('自动主题匹配仍遵守高级条件与筛选，保存的AI策略可直接重用',()=>{
 const d=seed(),p=addQuery(d,[{field:'title',operator:'NOT',value:'合成'}]);
 d.savedQueries.find(q=>q.id==='test-query')!.mode='ai';
 p.set('q','请帮我找保温瓶的资料');p.set('types','image');
 const expected=params({q:'保温瓶',queryId:'test-query',types:'image',mode:'standard'});
 assert.deepEqual(ids(publicResults(d,p)),ids(publicResults(d,expected)));
 assert.ok(publicResults(d,p).length>0);
});

test('描述无已知主题时按原词查询，不返回全库或泄露私人资料',()=>{
 const d=seed();
 assert.equal(publicResults(d,params({q:'帮我找量子纠缠论文',mode:'ai'})).length,0);
 assert.deepEqual(ids(publicResults(d,params({q:'同一段落',mode:'ai'}))),['DEMO-TEXT']);
 d.resources.find(r=>r.id==='PRIVATE-DEMO')!.subjects=['仅私有主题'];
 assert.equal(publicResults(d,params({q:'寻找仅私有主题',mode:'ai'})).length,0);
});

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

test('馆藏原文命中可追到书页或论文段落，库内资料说明不会混为原文',()=>{
 const d=withCourseFiles(seed());
 const book=searchCatalog(d,params({q:'快门不稳定'}));
 assert.deepEqual(ids(book.results),['B01']);
 const b=book.evidence.get('B01')!;
 assert.equal(b.field,'图书原页摘录');assert.equal(b.page,4);
 assert.ok(b.text.includes('快门不稳定'));assert.deepEqual(b.terms,['快门不稳定']);
 const paper=searchCatalog(d,params({q:'走出追求超附加值的误区'}));
 const a=paper.evidence.get('A01')!;
 assert.equal(a.field,'论文正文');assert.equal(a.paragraphId,'A01-p1-abstract');assert.equal(a.page,1);
 const advanced=addQuery(d,[{field:'fulltext',operator:'AND',value:'先试制期间'}]);
 assert.deepEqual(searchCatalog(d,advanced).results,[]);
 d.savedQueries.at(-1)!.rules[0].value='快门不稳定';
 assert.deepEqual(ids(searchCatalog(d,advanced).results),['B01']);
 d.savedQueries.at(-1)!.rules[0].value='南京路';
 assert.deepEqual(searchCatalog(d,advanced).results,[]);
 d.resources.find(r=>r.id==='A01')!.versionId='unrelated-paper';
 assert.deepEqual(searchCatalog(d,params({q:'走出追求超附加值的误区'})).results,[]);
});

test('资料类型计数保留同查询的其它类型和筛选，入库排序使用真实文件批次',()=>{
 const d=withCourseFiles(seed());
 const filtered=searchCatalog(d,params({types:'paper',source:'center_preview'}));
 assert.equal(filtered.results.length,4);
 assert.deepEqual(filtered.typeCounts,{book:4,paper:4,image:18,video:3});
 assert.equal(searchCatalog(d,params({sort:'new',types:'video'})).results[0].id,'V02');
 const mixed=searchCatalog(d,params({q:'保温瓶'})).results;
 assert.ok(mixed.findIndex(r=>r.isDemo)>0);
 assert.ok(mixed.slice(mixed.findIndex(r=>r.isDemo)).every(r=>r.isDemo));
 const scoped=searchCatalog(d,params({types:'video',q:'南京路',source:'center_preview'}));
 assert.deepEqual(scoped.typeCounts,{video:1});assert.deepEqual(ids(scoped.results),['V02']);
});

test('馆藏异名按完整查询词扩展，原词优先且证据保留原图题名用字',()=>{
 const d=withCourseFiles(seed()),course={source:'center_preview'};
 const find=(q:string)=>searchCatalog(d,params({q,...course}));
 const camera=find('照相机');
 assert.deepEqual(ids(camera.results),['B01','I03','I01','I02']);
 const evidence=camera.evidence.get('I01')!;
 assert.equal(evidence.field,'题名（同义词）');assert.deepEqual(evidence.terms,['相机']);
 assert.ok(evidence.text.includes('海鸥双镜头相机'));assert.ok(!evidence.text.includes('照相机'));
 assert.deepEqual(ids(find('保温瓶').results),['I16','I17','I05']);
 assert.deepEqual(ids(find('热水瓶').results),['I05','I16','I17']);
 assert.ok(ids(find('海鸥 照相机').results).includes('I01'));
 assert.ok(!ids(find('海鸥双镜头照相机').results).includes('I01'));
});

test('高级字段条件与存档的模型方案保持其字面语义',()=>{
 const d=withCourseFiles(seed());
 const p=addQuery(d,[{field:'title',operator:'AND',value:'保温瓶'}]);
 p.set('source','center_preview');p.set('q','保温瓶');
 assert.deepEqual(ids(searchCatalog(d,p).results),['I16','I17']);
 d.savedQueries.at(-1)!.rules=[{field:'title',operator:'NOT',value:'保温瓶'}];
 assert.deepEqual(ids(searchCatalog(d,p).results),['I05']);
 d.savedQueries.at(-1)!.rules=[];
 Object.assign(d.savedQueries.at(-1)!,{mode:'ai',q:'保温瓶',interpretation:{keywords:['保温瓶'],types:['image']}});
 const planned=searchCatalog(d,p);
 assert.deepEqual(ids(planned.results),['I16','I17']);
});
