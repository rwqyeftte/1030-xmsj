import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import test from 'node:test';
import {createReaderHandler} from '../scripts/reader-api.mjs';

const emptyChat = JSON.stringify({task:'chat', question:'有哪些资料？', resourceIds:[]});

function readerRequests(siteOrigin?: string) {
  const handle = createReaderHandler(siteOrigin);
  return () => {
    const host = 'localhost:8787';
    const request = Object.assign(new PassThrough(), {
      method:'POST', headers:{host, origin:siteOrigin || 'http://' + host, 'content-type':'application/json'},
    });
    const response = {statusCode:200, setHeader() {}, end() {}};
    const status = handle(request, response).then(() => response.statusCode);
    return {
      async finish(body = emptyChat) {
        request.end(body);
        return status;
      },
    };
  };
}

for (const [name, origin, limit] of [
  ['公开', 'https://example.org', 10],
  ['本地', undefined, 2],
] as const) {
  test(name + '阅读服务达到并发上限时拒绝新请求，处理结束后恢复', async () => {
    const start = readerRequests(origin);
    const held = Array.from({length:limit}, start);
    assert.equal(await start().finish(), 429);
    assert.equal(await start().finish(), 429);
    assert.equal(await held.pop()!.finish('{'), 400);
    const replacement = start();
    assert.equal(await start().finish(), 429);
    assert.equal(await replacement.finish(), 200);
    for (const request of held) assert.equal(await request.finish(), 200);
    assert.equal(await start().finish(), 200);
  });
}

test('公开阅读服务可在一小时内连续完成超过 30 次请求', async () => {
  const start = readerRequests('https://example.org');
  for (let i = 0; i < 35; i++) assert.equal(await start().finish(), 200);
});
