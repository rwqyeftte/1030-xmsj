import test from 'node:test';
import assert from 'node:assert/strict';
import seed from '../contracts/fixtures.json';
import type {AppData} from '../contracts/domain';
import {upgradeDemoReadingExample} from '../src/reader-example';
import {makeTextSelection,resolveTextAnchor} from '../src/text-anchors';

function legacy(){
  const data=structuredClone(seed) as AppData;
  const content=data.contents.find(c=>c.resourceId==='DEMO-TEXT')!;
  if(content.kind!=='text')throw new Error('Expected text fixture');
  content.paragraphs=content.paragraphs.slice(0,3);
  return {data,content};
}
test('旧演示正文仅追加段落，现有跨段摘录、笔记及其他用户数据保持完整',()=>{
  const {data,content}=legacy();
  const range=makeTextSelection(content.paragraphs,'para-1',28,'para-2',22)!;
  const before=structuredClone(data),after=upgradeDemoReadingExample(data);
  const expanded=after.contents.find(c=>c.id===content.id)!;
  assert.equal(expanded.kind,'text');if(expanded.kind!=='text')return;
  assert.equal(expanded.paragraphs.length,12);
  assert.deepEqual(expanded.paragraphs.slice(0,3),content.paragraphs);
  assert.deepEqual(resolveTextAnchor(expanded.paragraphs,range),resolveTextAnchor(content.paragraphs,range));
  const expected=structuredClone(before);
  expected.contents[expected.contents.findIndex(c=>c.id===content.id)]=expanded;
  assert.deepEqual(after,expected);assert.deepEqual(data,before);
  assert.equal(upgradeDemoReadingExample(after),after);
});
test('不覆盖已修改的正文，不恢复已失效或移除的内容',()=>{
  const changed=legacy();changed.content.paragraphs[0].text='用户已有的内容';
  assert.equal(upgradeDemoReadingExample(changed.data),changed.data);
  const stale=legacy();stale.content.versionId='another-version';
  assert.equal(upgradeDemoReadingExample(stale.data),stale.data);
  const removed=legacy();removed.data.contents=[];
  assert.equal(upgradeDemoReadingExample(removed.data),removed.data);
  const unavailable=legacy();unavailable.data.resources.find(r=>r.id==='DEMO-TEXT')!.contentId=null;
  assert.equal(upgradeDemoReadingExample(unavailable.data),unavailable.data);
  const complete=structuredClone(seed) as AppData;
  assert.equal(upgradeDemoReadingExample(complete),complete);
});
