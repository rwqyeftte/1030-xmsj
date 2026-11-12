import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import test from 'node:test';
import passages from '../contracts/pdf-passages.json';
import {createReaderHandler} from '../scripts/reader-api.mjs';

test('精读只发送当前页的文字摘录，拒绝不存在的来源和页码', async t => {
  const localFetch = globalThis.fetch;
  const modelInputs: Array<{source: string; excerptPage: number; passage: string}> = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, 'https://api.deepseek.com/responses');
    const body = JSON.parse(String(options.body));
    assert.equal(body.text.format.name, 'pdf_reading');
    modelInputs.push(JSON.parse(body.input));
    return Response.json({status:'completed', output:[{content:[{type:'output_text', text:'{"answer":"受控阅读解读"}'}]}]});
  });

  const formerKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'controlled-test';
  const server = createServer(createReaderHandler());
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const origin = 'http://127.0.0.1:' + address.port;
    const payload = {task:'read_pdf', resourceId:'A04', page:1, passage:passages.A04[0], question:'作者用了什么方法？'};
    const post = (overrides: object = {}) => localFetch(origin + '/api/reader', {
      method:'POST', headers:{Origin:origin, 'Content-Type':'application/json'},
      body:JSON.stringify({...payload, ...overrides}),
    });
    const res = await post();
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {resourceId:'A04', page:1, answer:'受控阅读解读'});
    assert.equal(modelInputs[0].passage, passages.A04[0]);
    assert.equal(modelInputs[0].source, '本页文字摘录');
    assert.equal(modelInputs[0].excerptPage, 1);
    assert.equal((await post({page:2, passage:'读者摘录的文字'})).status, 200);
    assert.equal(modelInputs[1].source, '读者录入的本页文字');
    assert.equal(modelInputs[1].excerptPage, 2);
    assert.equal(modelInputs[1].passage, '读者摘录的文字');
    assert.equal((await post({resourceId:'private-file'})).status, 400);
    assert.equal((await post({page:3})).status, 400);
    assert.equal((await post({passage:'   '})).status, 400);
    assert.equal(modelInputs.length, 2);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (formerKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = formerKey;
  }
});
