import test from 'node:test';
import assert from 'node:assert/strict';
import seed from '../contracts/fixtures.json';
import type {AppData} from '../contracts/domain';
import {connectedCards,summarySources,composeSummary,addSummaryCard} from '../src/board-summary';
const pid='project-demo-01';
function data(){return structuredClone(seed) as AppData;}

test('相连范围支持多卡片、循环连线，排除失效关系与其他项目',()=>{
  const d=data(),nodes=d.boardNodes.filter(n=>n.projectId===pid),[a,b,c]=nodes;
  assert.deepEqual(new Set(connectedCards(d,pid,[a.id])),new Set([a.id,b.id]));
  for(const [index,from,to] of [[0,b,c],[1,c,a]] as const){const id='test-rel-'+index;d.relations.push({id,projectId:pid,from:from.ref,to:to.ref,type:'compare',rationale:'test',anchorIds:[],state:'confirmed',aiAssisted:false,needsReview:false});d.edgeBindings.push({id,relationId:id,sourceNodeId:from.id,targetNodeId:to.id});}
  assert.equal(connectedCards(d,pid,[a.id]).length,3);
  d.relations.find(r=>r.id==='test-rel-0')!.state='inactive';d.relations.find(r=>r.id==='test-rel-1')!.state='inactive';
  assert.equal(connectedCards(d,pid,[a.id]).length,2);
  assert.deepEqual(connectedCards(d,'project-empty',[a.id]),[]);
});
test('汇总只读取选中来源和匹配版本，目录与画面描述不冒充全文',()=>{
  const d=data(),nodes=d.boardNodes.filter(n=>n.projectId===pid),sources=summarySources(d,pid,nodes.slice(0,2).map(n=>n.id));
  assert.equal(sources.length,2);assert.equal(sources[0].basis,'text');assert.equal(sources[1].basis,'description');
  assert.ok(sources[0].excerpt.includes('合成文本'));assert.equal(sources[0].resourceVersionId,d.resources.find(r=>r.id===sources[0].ref.id)!.versionId);
  d.resources.find(r=>r.id===sources[0].ref.id)!.versionId='new-unprovided-version';
  const stale=summarySources(d,pid,[nodes[0].id]);assert.equal(stale[0].basis,'metadata');assert.ok(!stale[0].excerpt.includes('合成文本'));
  const body=composeSummary(d,pid,[stale[0],sources[1]],'观察结构');assert.match(body,/只有目录/);assert.match(body,/未识别图片或视频画面/);
});
test('重复节点去重；不读取其他用户的私有来源；保留笔记修订和锚点',()=>{
  const d=data(),node=d.boardNodes.find(n=>n.projectId===pid&&n.ref.kind==='note')!,note=d.notes.find(n=>n.id===node.ref.id)!;
  const sources=summarySources(d,pid,[node.id,node.id]);assert.equal(sources.length,1);assert.equal(sources[0].ref.revision,node.ref.revision||note.currentRevision);assert.ok(sources[0].anchorIds.length>0);
  note.ownerId='someone-else';assert.equal(summarySources(d,pid,[node.id]).length,0);
});
test('汇总结果使用实际正文、研究重点和已有关系理由',()=>{
  const d=data(),[a,b]=d.boardNodes.filter(n=>n.projectId===pid),content=d.contents.find(c=>c.resourceId===a.ref.id)!;
  if(content.kind!=='text')throw Error('fixture');content.paragraphs=[{id:'p1',text:'容量的标注位于瓶底。'},{id:'p2',text:'瓶盖采用螺旋结构。'},{id:'p3',text:'把手便于握持。'},{id:'p4',text:'保温性能需要通过实验验证。'}];
  const sources=summarySources(d,pid,[a.id,b.id],'保温性能');assert.match(sources[0].excerpt,/保温性能需要通过实验验证/);
  const body=composeSummary(d,pid,sources,'保温性能');assert.match(body,/整理重点：保温性能/);assert.match(body,/已记录的关系/);assert.match(body,/\[1\]/);assert.match(body,/\[2\]/);
});
test('一次事务创建汇总卡与来源连线，不复制或改写原资料，持久化保留引用',()=>{
  const d=data(),originalResources=structuredClone(d.resources),originalNodes=structuredClone(d.boardNodes),ids=d.boardNodes.filter(n=>n.projectId===pid).slice(0,3).map(n=>n.id);
  const node=addSummaryCard(d,pid,ids,'比较材料','研究汇总','test-summary','2026-10-31T00:00:00Z');
  assert.deepEqual(d.resources,originalResources);assert.deepEqual(d.boardNodes.slice(0,originalNodes.length),originalNodes);
  const persisted=JSON.parse(JSON.stringify(d)) as AppData,idea=persisted.ideas.find(i=>i.id==='test-summary')!;
  assert.equal(idea.type,'summary');assert.equal(idea.summary!.sources.length,3);assert.equal(idea.summary!.method,'local_extract');
  assert.equal(persisted.edgeBindings.filter(e=>e.targetNodeId===node.id).length,3);
  assert.equal(persisted.relations.filter(r=>r.to.id===idea.id&&r.type==='summary_source').length,3);
  assert.ok(!connectedCards(persisted,pid,[ids[0]]).includes(node.id));
});
test('少于两项或归档时不创建汇总卡',()=>{
  const d=data(),ids=d.boardNodes.filter(n=>n.projectId===pid).map(n=>n.id),before=JSON.stringify(d);
  assert.throws(()=>addSummaryCard(d,pid,[ids[0]],'','汇总','x','now'),/至少/);assert.equal(JSON.stringify(d),before);
  d.projects.find(p=>p.id===pid)!.status='archived';const archived=JSON.stringify(d);assert.throws(()=>addSummaryCard(d,pid,ids,'','汇总','x','now'),/不可编辑/);assert.equal(JSON.stringify(d),archived);
});
