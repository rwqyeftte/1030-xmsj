import test from 'node:test';
import assert from 'node:assert/strict';
import {makeTextSelection,resolveTextAnchor} from '../src/text-anchors';

const paragraphs=[{id:'p1',text:'前文。重复句。后文。重复句。结束。'},{id:'p2',text:'第二段的开头与结尾。'},{id:'p3',text:'第三段。'}];

test('same sentence repeated in a paragraph resolves to the selected occurrence',()=>{
  const start=paragraphs[0].text.lastIndexOf('重复句。');
  const selection=makeTextSelection(paragraphs,'p1',start,'p1',start+4)!;
  assert.equal(selection.quote,'重复句。');
  assert.deepEqual(resolveTextAnchor(paragraphs,selection),[{paragraphId:'p1',start,end:start+4}]);
});
test('partial endpoints across three paragraphs preserve full middle paragraph',()=>{
  const selection=makeTextSelection(paragraphs,'p1',10,'p3',2)!;
  assert.equal(selection.quote,paragraphs[0].text.slice(10)+'\n\n'+paragraphs[1].text+'\n\n第三');
  assert.deepEqual(resolveTextAnchor(paragraphs,selection),[{paragraphId:'p1',start:10,end:paragraphs[0].text.length},{paragraphId:'p2',start:0,end:paragraphs[1].text.length},{paragraphId:'p3',start:0,end:2}]);
});
test('empty, reverse, missing and out-of-bounds ranges cannot become sources',()=>{
  for(const args of [['p1',1,'p1',1],['p2',0,'p1',2],['absent',0,'p1',1],['p1',-1,'p1',2],['p1',0,'p1',999]] as const)assert.equal(makeTextSelection(paragraphs,...args),null);
  assert.equal(makeTextSelection([{id:'blank',text:'   '}],'blank',0,'blank',3),null);
});
test('whitespace at selection boundaries and empty terminal paragraph are removed',()=>{
  const ps=[{id:'a',text:'  中文🙂  '},{id:'b',text:'内容'}];
  const selection=makeTextSelection(ps,'a',0,'b',0)!;
  assert.equal(selection.quote,'中文🙂');
  assert.deepEqual(resolveTextAnchor(ps,selection),[{paragraphId:'a',start:2,end:6}]);
});
test('a changed source or corrupted offset does not highlight a different occurrence',()=>{
  const selection=makeTextSelection(paragraphs,'p1',10,'p2',4)!;
  assert.equal(resolveTextAnchor([{...paragraphs[0],text:'新增'+paragraphs[0].text},...paragraphs.slice(1)],selection),null);
  assert.equal(resolveTextAnchor(paragraphs,{...selection,endOffset:999}),null);
  assert.equal(resolveTextAnchor(paragraphs,{...selection,quote:'其他文字'}),null);
});
test('legacy notes remain locatable; ambiguous legacy quotes need context',()=>{
  assert.deepEqual(resolveTextAnchor(paragraphs,{paragraphId:'p1',quote:'前文。'}),[{paragraphId:'p1',start:0,end:3}]);
  assert.equal(resolveTextAnchor(paragraphs,{paragraphId:'p1',quote:'重复句。'}),null);
  assert.deepEqual(resolveTextAnchor(paragraphs,{paragraphId:'p1',quote:'重复句。',prefix:'后文。'}),[{paragraphId:'p1',start:10,end:14}]);
});
