import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../contracts/fixtures.json';
import catalog from '../contracts/topics.json';
import type {AppData} from '../contracts/domain';
import {withCourseFiles} from '../src/featured';
import {searchCatalog} from '../src/search';

test('已有本地目录升级到真实专题，专题内检索使用策划成员',()=>{
  const local=structuredClone(fixture) as AppData;
  const data=withCourseFiles(local);
  assert.ok(local.topics[0].resourceIds.includes('DEMO-IMAGE'));
  assert.deepEqual(data.topics.map(t=>t.id),catalog.map(t=>t.id));
  for(const topic of data.topics){
    const declared=catalog.find(t=>t.id===topic.id)!;
    assert.deepEqual(topic.resourceIds,declared.resourceIds);
    assert.equal(new Set(topic.resourceIds).size,topic.resourceIds.length);
    const matches=searchCatalog(data,new URLSearchParams({topicId:topic.id})).results;
    assert.deepEqual(matches.map(r=>r.id).sort(),[...topic.resourceIds].sort());
    assert.ok(matches.every(r=>!r.isDemo&&r.access==='file_available'));
  }
});

test('专题目录不提供私有和受限成员，旧项目和笔记保持其资料编号',()=>{
  const local=structuredClone(fixture) as AppData;
  local.resources.find(r=>r.id==='I05')!.visibility='private';
  local.resources.find(r=>r.id==='I16')!.access='restricted';
  const data=withCourseFiles(local);
  const topic=data.topics.find(t=>t.id==='topic-demo-01')!;
  assert.ok(!topic.resourceIds.includes('I05')&&!topic.resourceIds.includes('I16'));
  assert.equal(data.projects,local.projects);
  assert.equal(data.notes,local.notes);
});
