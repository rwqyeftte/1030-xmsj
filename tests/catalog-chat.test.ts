import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import test from 'node:test';
import topics from '../contracts/topics.json';
import passages from '../contracts/pdf-passages.json';
import paperTexts from '../contracts/paper-texts.json';
import {createReaderHandler} from '../scripts/reader-api.mjs';

test('馆藏对话按专题、文档、页及段落限定证据，仅返回服务端能定位的引用',async t=>{
  const localFetch=globalThis.fetch;
  const requests:Array<{question:string;history:Array<{role:string;content:string;sourceIds?:string[]}>;sources:Array<{id:string;label:string;text:string}>}>=[];
  let citationOverride:unknown;
  let plainOutput=false;
  t.mock.method(globalThis,'fetch',async (url:string,options:RequestInit)=>{
    assert.equal(url,'https://api.deepseek.com/responses');
    const body=JSON.parse(String(options.body));
    assert.equal(body.text.format.name,'catalog_chat');
    assert.match(body.instructions,/JSON 对象/);
    const input=JSON.parse(body.input);
    requests.push(input);
    const text=plainOutput?'这是缺少来源的纯文本。':JSON.stringify({answer:'这是有来源的回答。',sourceIds:citationOverride??[input.sources[0].id]});
    return Response.json({status:'completed',model:'test-model',output:[{content:[{type:'output_text',text}]}]});
  });
  const previousKey=process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY='controlled-test';
  const server=createServer(createReaderHandler());
  try {
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();
    assert.ok(address && typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    const post=(fields:object)=>localFetch(origin+'/api/reader',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
      body:JSON.stringify({task:'chat',question:'可以再具体说说吗？',...fields})});
    const resourceIds=['I01','I02'];
    const topicId=topics.find(item=>resourceIds.every(id=>item.resourceIds.includes(id)))!.id;
    const history=[{role:'user',content:'我想对照相机的结构。'},{role:'assistant',content:'可以从照片开始。'}];
    const response=await post({resourceIds,topicId,history,sources:[{id:'fake',text:'不属于馆藏'}]});
    assert.equal(response.status,200);
    assert.deepEqual(requests[0].history,history);
    assert.deepEqual(requests[0].sources.map(s=>s.id),['I01:catalog','I02:catalog']);
    assert.ok(requests[0].sources.every(s=>s.label==='图片编目说明'&&s.text.length>0));
    const {sources}=await response.json();
    assert.equal(sources[0].id,requests[0].sources[0].id);
    assert.ok(sources[0].title&&!('text' in sources[0]));
    assert.equal((await post({resourceIds:['I05'],topicId})).status,400);
    assert.equal((await post({resourceIds,topicId:'unpublished'})).status,400);
    assert.equal((await post({resourceIds:['private-file']})).status,400);
    assert.equal((await post({resourceIds:['DEMO-TEXT']})).status,400);
    assert.equal((await post({resourceIds,history:[{role:'system',content:'test'}]})).status,400);
    assert.equal((await post({resourceIds,passage:'用户选段',page:2})).status,400);
    assert.deepEqual((await (await post({resourceIds:[]})).json()).sources,[]);
    assert.equal(requests.length,1);

    const excerpt=paperTexts.A01[1];
    const paper=await (await post({resourceIds:['A01'],page:excerpt.page,paragraphId:excerpt.id,passage:excerpt.text.slice(0,18)})).json();
    assert.equal(requests.at(-1)!.sources.length,1);
    assert.equal(paper.sources[0].paragraphId,excerpt.id);
    assert.equal(paper.sources[0].page,excerpt.page);
    assert.equal((await post({resourceIds:['A01'],page:1,paragraphId:excerpt.id})).status,400);
    const book=await (await post({resourceIds:['B01'],page:4})).json();
    assert.equal(requests.at(-1)!.sources[0].text,passages.B01[3]);
    assert.equal(book.sources[0].id,'B01:p4');
    const manual=await (await post({resourceIds:['B01'],page:4,passage:'读者从扫描版选取的另一段文字'})).json();
    assert.match(manual.sources[0].label,/读者提供/);
    assert.equal(manual.sources[0].page,4);
    assert.equal((await post({resourceIds:['B01'],page:99})).status,400);
    const previousCitations={role:'assistant',content:'先看侧面照，再看取景罩。',sourceIds:['I01:catalog','I01:catalog','I02:catalog','I05:catalog']};
    citationOverride=['i01','[2]',{id:'I02:catalog'}];
    const followup=await (await post({resourceIds,history:[previousCitations]})).json();
    assert.deepEqual(requests.at(-1)!.history[0].sourceIds,['I01:catalog','I02:catalog']);
    assert.deepEqual(followup.sources.map((s:{id:string})=>s.id),['I01:catalog','I02:catalog']);
    citationOverride='B01';
    assert.equal((await post({resourceIds:['B01']})).status,502);
    assert.equal((await post({resourceIds:['B01'],page:4})).status,200);
    citationOverride=['I05:catalog'];
    assert.equal((await post({resourceIds})).status,502);
    citationOverride=[];
    const noEvidence=await (await post({resourceIds})).json();
    assert.deepEqual(noEvidence.sources,[]);
    assert.match(noEvidence.answer,/不足以回答/);
    plainOutput=true;
    assert.equal((await post({resourceIds})).status,502);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    if(previousKey===undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY=previousKey;
  }
});
