import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {selectText} from './text-selection.mjs';

// Opt in to one paid AI search request. Default uses a controlled model response.
const live=process.argv.includes('--live');
const originalFetch=globalThis.fetch;
if(!live) {
  process.env.DEEPSEEK_API_KEY='test-only';
  globalThis.fetch=async(url,options)=>{
    if(String(url)!=='https://api.deepseek.com/responses')return originalFetch(url,options);
    const sent=JSON.parse(options.body);
    assert.equal(sent.model,'deepseek-flash');
    const {input}=sent;
    if(sent.text.format.name==='catalog_query'){
      const {question,publicCatalog}=JSON.parse(input);
      assert.equal(question,'请找有关保温瓶的图像资料');
      assert.equal(publicCatalog.length,29);
      assert.ok(publicCatalog.some(r=>r.id==='V02'&&r.title==='南京路夜景'&&r.subjects.includes('商业街景')));
      assert.ok(publicCatalog.every(r=>Object.keys(r).every(k=>['id','type','title','subjects'].includes(k))));
      const text=JSON.stringify({keywords:['保温瓶'],types:['image']});
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text}]}]});
    }
    throw Error('Unexpected model request');
  };
}
const running=process.argv.includes('--running')&&live;
const server=running?null:await createServer({cacheDir:'node_modules/.vite-reader-tests',server:{host:'127.0.0.1',port:0},logLevel:'error'});
let browser;
try {
  await server?.listen();
  const base=running?'http://127.0.0.1:5188/':server.resolvedUrls.local[0];
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage();
  await page.goto(base+'search');
  await page.getByRole('button',{name:'AI 辅助检索',exact:true}).click();
  await page.getByTestId('search-input').fill('请找有关保温瓶的图像资料');
  await page.getByTestId('search-submit').click();
  await expect(page.getByTestId('gpt-search-plan')).toContainText('保温瓶',{timeout:55000});
  await expect(page.getByTestId('gpt-search-plan')).toContainText(/图像|图片/);
  const hits=page.locator('[data-testid^="resource-card-"]');
  await expect(hits.first()).toBeVisible();
  console.log((live?'Live':'Controlled')+' DeepSeek search: '+await page.getByTestId('gpt-search-plan').textContent()+' / '+await page.getByTestId('results-count').textContent());
  const first=await hits.first().getAttribute('data-testid');
  await page.reload();
  await expect(page.getByTestId(first)).toBeVisible();
  console.log('PASS DeepSeek search and results reload');
  if(!live)await verifyReaderQuestions(page,base);
} finally {
  await browser?.close();
  await server?.close();
  globalThis.fetch=originalFetch;
}

async function verifyReaderQuestions(page,base){
  const requests=[];
  await page.route('**/api/reader',async route=>{
    const payload=route.request().postDataJSON();
    assert.equal(payload.task,'chat');
    requests.push(payload);
    const {resourceIds:[resourceId],page:pageNumber,paragraphId}=payload;
    const label=paragraphId?'所选段落':pageNumber?'节选第 '+pageNumber+' 页':'编目说明';
    await route.fulfill({json:{answer:'关于「'+payload.question+'」的回答',sources:[{
      id:resourceId+'-'+(paragraphId||pageNumber||'catalog'),resourceId,title:resourceId,label,page:pageNumber,paragraphId
    }]}});
  });
  const chat=page.getByTestId('research-chat');
  const aiTab=page.getByRole('button',{name:'AI 辅助',exact:true});
  async function send(question){
    await chat.getByRole('textbox').fill(question);
    await chat.getByRole('button',{name:'发送',exact:true}).click();
    await expect(chat.getByText('关于「'+question+'」的回答',{exact:true})).toBeVisible();
  }
  await page.goto(base+'resources/B01/read?projectId=project-empty');
  await page.getByLabel('我的观察与解释').fill('已有研究草稿');
  await aiTab.click();
  await send('第一页介绍什么？');
  assert.equal(requests.at(-1).page,1);
  await page.getByRole('button',{name:'下一页',exact:true}).click();
  await expect(chat.locator('header')).toContainText('节选第 2 页');
  await send('第二页补充了什么？');
  assert.equal(requests.at(-1).page,2);
  assert.deepEqual(requests.at(-1).history.map(item=>item.role),['user','assistant']);
  await chat.getByRole('link',{name:'B01 · 节选第 1 页'}).click();
  await expect(chat.locator('header')).toContainText('节选第 1 页');
  assert.equal(new URL(page.url()).searchParams.get('projectId'),'project-empty');
  await page.getByRole('button',{name:'下一页',exact:true}).click();
  await expect(chat.locator('header')).toContainText('节选第 2 页');
  await chat.getByRole('button',{name:'加入笔记草稿'}).first().click();
  await expect(page.getByLabel('我的观察与解释')).toHaveValue(/已有研究草稿[\s\S]*第一页介绍什么/);
  await expect(page.getByTestId('note-editor').locator('.source-block')).toContainText(/第\s*1\s*页/);
  await aiTab.click();
  await expect(chat.locator('.chat-turn')).toHaveCount(2);
  await page.goto(base+'resources/A02/read');
  await expect(page.locator('[data-text-paragraph]').first()).toBeVisible();
  const quote=await selectText(page.getByTestId('reader-content'),1,1,1,9);
  await page.getByRole('button',{name:'问 AI',exact:true}).click();
  await send('选中这句话是什么意思？');
  assert.equal(requests.at(-1).passage,quote);
  assert.ok(requests.at(-1).paragraphId);
  assert.equal(requests.at(-1).originAnchor,undefined);
  const secondQuote=await selectText(page.getByTestId('reader-content'),1,10,1,18);
  await page.getByRole('button',{name:'问 AI',exact:true}).click();
  await send('同段的另一句话呢？');
  assert.equal(requests.at(-1).passage,secondQuote);
  await page.reload();
  await aiTab.click();
  await chat.getByRole('button',{name:'加入笔记草稿'}).first().click();
  await expect(page.getByTestId('note-editor').locator('.selected-source-quote')).toHaveText(quote);
  for(const id of ['I01','V01']){
    await page.goto(base+'resources/'+id+'/read');
    await aiTab.click();
    await expect(chat.locator('header')).toContainText('馆藏编目说明');
    await send('记录了什么？');
    assert.deepEqual(requests.at(-1).resourceIds,[id]);
    assert.equal(requests.at(-1).passage,undefined);
    await chat.getByRole('button',{name:'加入笔记草稿'}).click();
    await expect(page.getByLabel('笔记内容')).toHaveValue(/关于「记录了什么？/);
  }
  console.log('PASS reader chat across pages, selected text, sources, note drafts and media');
}
