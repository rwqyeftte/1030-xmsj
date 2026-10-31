import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../contracts/fixtures.json';
import type {AppData} from '../contracts/domain';
import {upgradeDemoSearchExample} from '../src/query-presets';
import {publicResults} from '../src/search';

test('旧版默认保温瓶示例补入条件，保留其他数据且只升级一次',()=>{
  const before=structuredClone(fixture) as AppData;
  delete before.demoSearchExampleVersion;before.savedQueries[0].rules=[];
  before.savedQueries[0].targetProjectId='project-demo-01';
  before.savedQueries.push({...before.savedQueries[0],id:'my-query',q:'用户自存策略'});
  const after=upgradeDemoSearchExample(before);
  assert.equal(before.savedQueries[0].rules.length,0);
  assert.deepEqual(after.savedQueries[0].rules,fixture.savedQueries[0].rules);
  const expected=structuredClone(before);expected.demoSearchExampleVersion=2;expected.savedQueries[0].rules=after.savedQueries[0].rules;expected.savedQueries[0].targetProjectId=null;
  assert.deepEqual(after,expected);
  after.savedQueries[0].rules=[];
  assert.equal(upgradeDemoSearchExample(after),after);
});

test('已有带条件示例解除默认项目关联，保留条件和其他策略的项目',()=>{
  const before=structuredClone(fixture) as AppData;before.demoSearchExampleVersion=1;
  before.savedQueries[0].targetProjectId='project-demo-01';
  before.savedQueries[0].rules[1].value='用户调整过的关键词';
  before.savedQueries.push({...structuredClone(before.savedQueries[0]),id:'my-project-query'});
  const after=upgradeDemoSearchExample(before);
  assert.equal(after.savedQueries[0].targetProjectId,null);
  assert.deepEqual(after.savedQueries[0].rules,before.savedQueries[0].rules);
  assert.deepEqual(after.savedQueries[1],before.savedQueries[1]);
  const custom=structuredClone(before);custom.savedQueries[0].targetProjectId='project-empty';
  assert.equal(upgradeDemoSearchExample(custom).savedQueries[0].targetProjectId,'project-empty');
  assert.equal(upgradeDemoSearchExample(after),after);
});

test('用户已修改的策略不会被示例升级覆盖；默认条件有结果且可修改',()=>{
  const changed=structuredClone(fixture) as AppData;delete changed.demoSearchExampleVersion;
  changed.savedQueries[0].rules=[{field:'title',operator:'AND',value:'我的条件'}];
  assert.deepEqual(upgradeDemoSearchExample(changed).savedQueries,changed.savedQueries);
  const data=structuredClone(fixture) as AppData;
  const p=new URLSearchParams({q:'保温瓶',queryId:'query-demo-01'});
  const original=publicResults(data,p);
  assert.ok(original.length>0);assert.ok(original.every(r=>!r.title.includes('合成')));
  data.savedQueries[0].rules[1].operator='AND';
  const revised=publicResults(data,p);
  assert.ok(revised.some(r=>r.id==='DEMO-TEXT'));assert.ok(revised.every(r=>r.title.includes('合成')));
});
