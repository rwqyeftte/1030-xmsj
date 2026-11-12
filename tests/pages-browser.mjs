import http from 'node:http';
import {selectText} from './text-selection.mjs';
import {readingBoardJourney} from './reading-board.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium,expect} from '@playwright/test';

// Serve exact files only: no SPA fallback, matching Pages hash-route requirements.
const root=path.resolve('dist-pages'),prefix='/1030-xmsj/';
const mimeTypes={
  '.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.pdf':'application/pdf','.jpg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm'
};
const featuredIds=['B01','B02','B03','B04','I01','I02','I03','I04'];
const paperIds=['A01','A02','A03','A04'];
const featuredVideoIds=['V01','V03'];
const newlyDigitizedIds=[...Array.from({length:14},(_,i)=>'I'+String(i+5).padStart(2,'0')),'V02'];
const arrivalIds=[...newlyDigitizedIds,...featuredIds,...paperIds,...featuredVideoIds];
const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  if(!url.pathname.startsWith(prefix)){res.writeHead(404);res.end();return;}
  const file=path.resolve(root,decodeURIComponent(url.pathname.slice(prefix.length))||'index.html');
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const body=await fs.readFile(file);
  const mime=mimeTypes[path.extname(file)]||'application/octet-stream';
  res.setHeader('Content-Type',mime);
  if(mime.startsWith('video/')){
    // Chrome seeks through a media file using byte ranges, as on the deployed static host.
    res.setHeader('Accept-Ranges','bytes');
    const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
    if(range){
      const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),body.length-1):body.length-1;
      if(start>end){res.writeHead(416,{'Content-Range':'bytes */'+body.length});res.end();return;}
      res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${body.length}`,'Content-Length':end-start+1});res.end(body.subarray(start,end+1));return;
    }
  }
  res.end(body);
}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(4174,'127.0.0.1',resolve));
const base='http://127.0.0.1:4174'+prefix;
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
const page=await context.newPage();page.setDefaultTimeout(8000);
// Pages serves static files. Isolate the external model for these offline UI checks.
await page.route('**/api/reader',async route=>{
  const body=route.request().postDataJSON();
  assert.equal(body.task,'search');
  await route.fulfill({json:{keywords:['保温瓶'],types:[]}});
});
const results=[],errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.accept());
const go=async(route)=>{await page.goto(base+'#'+route);await page.waitForSelector('main');};
const check=async(name,fn)=>{try{await fn();results.push({name,result:'pass'});console.log('PASS',name);}catch(e){results.push({name,result:'fail',error:String(e)});console.error('FAIL',name,String(e));}};
const bookPageCounts={B01:6,B02:4,B03:4,B04:4};
const documentReader=container=>container.getByRole('region',{name:'文档阅读器',exact:true});
const renderedPage=reader=>reader.locator('canvas:visible, img:visible').first();
async function pageInk(reader){
  return renderedPage(reader).evaluate(el=>{
    if(el instanceof HTMLImageElement && (!el.complete || !el.naturalWidth))return '';
    if(!el.width || !el.height)return '';
    const sample=document.createElement('canvas');sample.width=64;sample.height=64;
    const paint=sample.getContext('2d');paint.fillStyle='white';paint.fillRect(0,0,64,64);
    paint.drawImage(el,0,0,64,64);
    const pixels=paint.getImageData(0,0,64,64).data;
    return pixels.some((value,i)=>i%4!==3 && value<220)?sample.toDataURL():'';
  });
}
async function expectBookPage(reader,number,total){
  await expect(reader).toContainText(new RegExp(`第\\s*${number}\\s*/\\s*${total}\\s*页`));
  await expect(renderedPage(reader)).toBeVisible();
  await expect(renderedPage(reader)).toHaveAccessibleName(new RegExp(`第\\s*${number}\\s*页`));
  await expect.poll(()=>pageInk(reader)).not.toBe('');
}
try{
  await check('saved example loads editable rules, reloads on same URL, and saves a separate revised strategy',async()=>{
    await go('/search');
    const preset=page.locator('.strategy-row').filter({has:page.getByRole('link',{name:'使用条件',exact:true})}).filter({hasText:'保温瓶'}).first();
    await expect(preset).toContainText('2 条条件');
    await preset.getByRole('link',{name:'使用条件',exact:true}).click();
    await expect(page.locator('.discovery-target')).toHaveCount(0);
    assert.equal(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).has('targetProjectId'),false);
    await expect(page.getByLabel('条件1字段',{exact:true})).toHaveValue('title');
    await expect(page.getByLabel('条件1关键词',{exact:true})).toHaveValue('保温瓶');
    await expect(page.getByLabel('条件2逻辑',{exact:true})).toHaveValue('NOT');
    await expect(page.getByLabel('条件2关键词',{exact:true})).toHaveValue('合成');
    await fs.mkdir('test-results/homepage',{recursive:true});
    await page.screenshot({path:'test-results/homepage/saved-conditions-round5.png',fullPage:true});
    await page.getByLabel('条件2逻辑',{exact:true}).selectOption('AND');
    await preset.getByRole('link',{name:'使用条件',exact:true}).click();
    await expect(page.getByLabel('条件2逻辑',{exact:true})).toHaveValue('NOT');
    await page.getByLabel('条件2逻辑',{exact:true}).selectOption('AND');
    await page.getByRole('button',{name:'保存检索策略',exact:true}).click();
    await page.getByLabel('策略名称（必填）',{exact:true}).fill('保温瓶合成材料');
    await page.getByRole('dialog').getByRole('button',{name:'保存策略',exact:true}).click();
    const queries=await page.evaluate(()=>JSON.parse(localStorage.getItem('literature-center:v1:data')).savedQueries);
    assert.equal(queries.find(q=>q.id==='query-demo-01').rules[1].operator,'NOT');
    assert.equal(queries.find(q=>q.name==='保温瓶合成材料').rules[1].operator,'AND');
    await page.locator('.strategy-row').filter({hasText:'保温瓶合成材料'}).getByRole('link',{name:'重新检索',exact:true}).click();
    await expect(page.getByTestId('resource-card-DEMO-TEXT')).toBeVisible();
    await page.getByRole('link',{name:'修改检索策略 →',exact:true}).click();
    await expect(page.getByLabel('条件2逻辑',{exact:true})).toHaveValue('AND');
    await page.getByRole('button',{name:'移除条件 2',exact:true}).click();
    await page.getByRole('button',{name:'＋ 添加条件',exact:true}).click();
    await page.getByLabel('条件2关键词',{exact:true}).fill('合成');
    await page.getByTestId('search-submit').click();
    await expect(page.getByTestId('resource-card-DEMO-TEXT')).toBeVisible();
    await page.reload();await expect(page.getByTestId('resource-card-DEMO-TEXT')).toBeVisible();
  });
  await check('AI description searches directly and saved strategies retain AI mode',async()=>{
    await go('/search');
    await page.getByRole('button',{name:'AI 辅助检索',exact:true}).click();
    await expect(page.getByTestId('search-input')).toHaveAttribute('placeholder','可用自然语言描述');
    await expect(page.getByText('模拟 AI，不连接模型',{exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'生成候选检索词',exact:true})).toHaveCount(0);
    const description='我想找有关保温瓶的研究资料';
    await page.getByTestId('search-input').fill(description);
    await page.getByRole('button',{name:'保存检索策略',exact:true}).click();
    await page.getByLabel('策略名称（必填）',{exact:true}).fill('自然语言检索验收');
    await page.getByRole('dialog').getByRole('button',{name:'保存策略',exact:true}).click();
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('literature-center:v1:data')).savedQueries.find(q=>q.name==='自然语言检索验收'));
    assert.equal(saved.mode,'ai');assert.equal(saved.q,description);
    await page.locator('.strategy-row').filter({hasText:'自然语言检索验收'}).getByRole('link',{name:'重新检索',exact:true}).click();
    await expect(page.getByTestId('resource-card-DEMO-TEXT')).toBeVisible();
    await go('/search?mode=ai');await page.getByTestId('search-input').fill(description);
    await fs.mkdir('test-results/homepage',{recursive:true});
    await page.screenshot({path:'test-results/homepage/search-ai-round4.png',fullPage:true});
    await page.getByTestId('search-submit').click();
    await expect(page.locator('main')).toHaveAttribute('data-page-id','P03');
    await expect(page.getByTestId('resource-card-DEMO-TEXT')).toBeVisible();
    await expect(page.getByTestId('search-input')).toHaveValue(description);
    await expect(page.getByRole('button',{name:'确认使用候选词',exact:true})).toHaveCount(0);
    await page.reload();await expect(page.getByTestId('resource-card-DEMO-TEXT')).toBeVisible();
  });
  await check('homepage entry, simplified AI tab and search still work',async()=>{
    for(const url of [base,base+'#/']){
      await page.goto(url);await expect(page.locator('main')).toHaveAttribute('data-page-id','P01');
      await page.reload();await expect(page.getByRole('heading',{name:'发现资源',exact:true})).toBeVisible();
    }
    const homeLink=page.getByTestId('global-nav').getByRole('link').first();
    await expect(homeLink).toHaveText('首页');
    await expect(homeLink).toHaveAttribute('aria-current','page');
    await expect(page.locator('.topic-grid h3')).toHaveText(['日常器物的视觉表达','看懂产品结构']);
    assert.deepEqual(await page.locator('[data-page-id="P01"] .resource-card').evaluateAll(cards=>cards.map(c=>c.dataset.resourceId)),featuredIds);
    const search=page.locator('.home-search');
    await search.getByRole('button',{name:'AI 辅助检索',exact:true}).click();
    await expect(search.locator('.notice')).toHaveCount(0);
    await expect(search).not.toContainText('提交后，DeepSeek');
    await expect(search).not.toContainText('模拟');
    await page.getByTestId('search-input').fill('保温瓶');
    await search.getByRole('button',{name:'常规检索',exact:true}).click();
    await expect(page.getByTestId('search-input')).toHaveValue('保温瓶');
    await search.getByRole('button',{name:'AI 辅助检索',exact:true}).click();
    await page.getByTestId('search-submit').click();
    await expect(page.locator('main')).toHaveAttribute('data-page-id','P03');
    await expect(page.getByTestId('resource-card-DEMO-TEXT')).toBeVisible();
    await page.goBack();await expect(page.locator('main')).toHaveAttribute('data-page-id','P01');
  });
  await check('every home card previews its own available content without downloads or writes',async()=>{
    await go('/');
    const more=page.getByRole('button',{name:'加载更多资源',exact:true});
    const types=page.getByRole('group',{name:'精选资料类型'});
    const cards=page.locator('.resource-card');
    await types.getByRole('button',{name:'论文资料',exact:true}).click();
    assert.deepEqual(await cards.evaluateAll(items=>items.map(c=>c.dataset.resourceId)),paperIds);
    await expect(cards.locator('.catalog-register > span:first-child')).toHaveText(paperIds.map(()=>'论文资料'));
    for(const img of await cards.locator('.catalog-label img').all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(()=>img.evaluate(el=>el.naturalWidth)).toBeGreaterThan(0);
    }
    await types.getByRole('button',{name:'全部类型',exact:true}).click();
    while(await more.count())await more.click();
    const count=await cards.count();
    assert.deepEqual(await cards.evaluateAll(items=>items.map(c=>c.dataset.resourceId)),[...featuredIds,...paperIds,...featuredVideoIds]);
    await expect(more).toHaveCount(0);
    await expect(cards.getByRole('button',{name:'下载资料',exact:true})).toHaveCount(0);
    const before=await page.evaluate(()=>localStorage.getItem('literature-center:v1:data'));
    const downloads=[];const onDownload=d=>downloads.push(d.suggestedFilename());page.on('download',onDownload);
    for(let i=0;i<count;i++){
      const card=cards.nth(i),id=await card.getAttribute('data-resource-id'),title=await card.locator('h3').innerText();
      const button=card.getByRole('button',{name:'预览',exact:true});await button.click();
      const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('heading',{level:2})).toHaveText('资料预览 · '+title);
      const video=featuredVideoIds.includes(id);
      const media=dialog.locator('figure.featured-media');
      if(bookPageCounts[id]){
        const reader=documentReader(dialog);
        await expectBookPage(reader,1,bookPageCounts[id]);
        await expect(reader.getByRole('button',{name:'上一页',exact:true})).toBeDisabled();
      }else if(paperIds.includes(id)){
        const transcript=dialog.getByRole('article',{name:'论文正文节选'});
        await expect(transcript).toBeVisible();
        assert.ok((await transcript.innerText()).length>=350);
      }else if(video){
        const player=media.locator('video');
        await expect(player).toBeVisible();
        await expect.poll(()=>player.evaluate(el=>el.videoWidth)).toBeGreaterThan(0);
        await player.evaluate(async el=>{el.muted=true;await el.play();});
        await expect.poll(()=>player.evaluate(el=>el.currentTime)).toBeGreaterThan(0);
        await player.evaluate(el=>el.pause());
      }else{
        const image=media.locator('img');await expect(image).toBeVisible();
        await expect.poll(()=>image.evaluate(el=>el.naturalWidth)).toBeGreaterThan(0);
      }
      const ext=video?'.mp4':bookPageCounts[id]||paperIds.includes(id)?'.pdf':'.jpg';
      const source=dialog.locator('.featured-links a');
      const hrefs=await source.evaluateAll(links=>links.map(a=>a.href));
      const original=hrefs.find(href=>new URL(href).pathname.toLowerCase().endsWith(ext));
      assert.ok(original,`${id} needs a link to its ${ext} file`);
      assert.ok(original.startsWith(base),'file must resolve inside the Pages site');
      assert.ok(path.basename(new URL(original).pathname).startsWith(id),`file must belong to ${id}`);
      const response=await context.request.head(original);
      assert.equal(response.status(),200);
      assert.equal(response.headers()['content-type'],mimeTypes[ext]);
      await page.keyboard.press('Shift+Tab');
      assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)));
      await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(button).toBeFocused();
    }
    assert.equal(await cards.count(),count);
    assert.equal(await page.evaluate(()=>localStorage.getItem('literature-center:v1:data')),before);
    assert.deepEqual(downloads,[]);page.off('download',onDownload);
    await page.getByTestId('preview-resource-B01').click();
    const dialog=page.getByRole('dialog'),preview=documentReader(dialog);
    await expectBookPage(preview,1,6);
    await preview.getByRole('button',{name:'下一页',exact:true}).click();
    await expectBookPage(preview,2,6);
    await dialog.getByRole('link',{name:'查看详情',exact:true}).click();
    await expect(page.locator('main')).toHaveAttribute('data-page-id','P07');
    await expectBookPage(documentReader(page.locator('main')),2,6);
    await page.getByRole('button',{name:'← 返回来源页面',exact:true}).click();await expect(page.locator('main')).toHaveAttribute('data-page-id','P01');
  });
  await check('book pages turn and zoom in place from the preview and the title on mobile',async()=>{
    await page.setViewportSize({width:390,height:844});
    try{
      await go('/');
      const homeURL=page.url(),tabCount=context.pages().length;
      await page.getByTestId('preview-resource-B01').click();
      const dialog=page.getByRole('dialog'),preview=documentReader(dialog);
      await expectBookPage(preview,1,bookPageCounts.B01);
      const next=preview.getByRole('button',{name:'下一页',exact:true});
      for(let number=2;number<=bookPageCounts.B01;number++){
        const oldPage=await pageInk(preview);
        await next.click();
        await expectBookPage(preview,number,bookPageCounts.B01);
        await expect.poll(()=>pageInk(preview)).not.toBe(oldPage);
      }
      await expect(next).toBeDisabled();
      await preview.getByRole('button',{name:'上一页',exact:true}).click();
      await expectBookPage(preview,5,bookPageCounts.B01);
      assert.equal(page.url(),homeURL);
      await page.keyboard.press('Escape');
      await page.getByTestId('resource-card-B02').locator('h3 a').click();
      await expect(page.locator('main')).toHaveAttribute('data-page-id','P07');
      const detail=documentReader(page.locator('main'));
      await expectBookPage(detail,1,bookPageCounts.B02);
      await detail.getByRole('button',{name:'下一页',exact:true}).click();
      await expectBookPage(detail,2,bookPageCounts.B02);
      const detailURL=page.url();
      const pageWidth=()=>renderedPage(detail).evaluate(el=>el.getBoundingClientRect().width);
      const width=await pageWidth();
      await detail.getByRole('button',{name:'放大',exact:true}).click();
      await expect.poll(pageWidth).toBeGreaterThan(width+1);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await detail.getByRole('button',{name:'缩小',exact:true}).click();
      await expect.poll(pageWidth).toBeCloseTo(width,0);
      assert.equal(page.url(),detailURL);
      assert.equal(context.pages().length,tabCount);
    }finally{await page.setViewportSize({width:1440,height:900});}
  });
  await check('home cards and previews fit desktop and narrow screens',async()=>{
    await fs.mkdir('test-results/homepage',{recursive:true});
    for(const [width,height] of [[1440,900],[1280,800],[390,844]]){
      await page.setViewportSize({width,height});await go('/');
      await page.getByRole('button',{name:'AI 辅助检索',exact:true}).click();
      const covers=page.locator('.resource-card .catalog-visual');
      await expect(covers).toHaveCount(featuredIds.length);
      for(const img of await covers.locator('.catalog-label img').all()){
        await img.scrollIntoViewIfNeeded();
        await expect.poll(()=>img.evaluate(el=>el.naturalWidth)).toBeGreaterThan(0);
      }
      const sizes=await covers.evaluateAll(nodes=>nodes.map(node=>{
        const register=node.querySelector('.catalog-register');
        const caption=node.querySelector('.catalog-caption');
        const img=node.querySelector('.catalog-label img');
        const rect=img.getBoundingClientRect(),topLine=register.getBoundingClientRect(),bottomLine=caption.getBoundingClientRect();
        return {w:rect.width,h:rect.height,fit:getComputedStyle(img).objectFit,
          between:rect.top>=topLine.bottom-1 && rect.bottom<=bottomLine.top+1 &&
            rect.left>=topLine.left-1 && rect.right<=topLine.right+1,
          hasLines:parseFloat(getComputedStyle(register).borderBottomWidth)>0 && parseFloat(getComputedStyle(caption).borderTopWidth)>0};
      }));
      for(const box of sizes){
        assert.ok(box.w>0 && box.h>0 && box.hasLines && box.between,`image outside ruled area at ${width}px`);
        assert.equal(box.fit,'contain');
        assert.ok(Math.abs(box.w-sizes[0].w)<=1 && Math.abs(box.h-sizes[0].h)<=1,`unequal image box at ${width}px`);
      }
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({path:`test-results/homepage/home-${width}.png`,fullPage:true});
      await page.getByTestId('preview-resource-B01').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      assert.ok(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
      await page.screenshot({path:`test-results/homepage/preview-${width}.png`});
      await page.getByRole('button',{name:'关闭对话框',exact:true}).click();
    }
    await page.setViewportSize({width:1440,height:900});
  });
  await check('new arrivals on home and recommendations list real files in accession order and preserve filters on return',async()=>{
    const cards=page.locator('.resource-card');
    const ids=()=>cards.evaluateAll(nodes=>nodes.map(node=>node.dataset.resourceId));
    for(const url of ['/','/recommendations']){
      await go(url);
      const tab=page.getByRole('button',{name:'新入库',exact:true});
      await tab.click();
      await expect(tab).toHaveAttribute('aria-pressed','true');
      const more=page.getByRole('button',{name:/^加载更多/});
      await expect(more).toBeVisible();
      let count=await cards.count();
      while(await more.count()){
        await more.click();
        await expect.poll(()=>cards.count()).toBeGreaterThan(count);
        count=await cards.count();
      }
      assert.deepEqual(await ids(),arrivalIds);
      const dates=await cards.locator('time[datetime]').evaluateAll(nodes=>nodes.map(el=>Date.parse(el.dateTime)));
      assert.equal(dates.length,arrivalIds.length);
      assert.deepEqual(dates,[...dates].sort((a,b)=>b-a));
      assert.ok(dates[newlyDigitizedIds.length-1]>dates[newlyDigitizedIds.length]);
      const covers=cards.locator('.catalog-label img');
      await expect(covers).toHaveCount(arrivalIds.length);
      await page.getByTestId('resource-card-V03').locator('h3 a').click();
      await page.getByRole('button',{name:'← 返回来源页面',exact:true}).click();
      await expect(cards).toHaveCount(arrivalIds.length);
      const types=page.getByRole('group',{name:'新入库资料类型'});
      for(const [type,prefix] of [['图书','B'],['图片','I'],['视频','V'],['论文','A']]){
        await types.getByRole('button',{name:type+'资料',exact:true}).click();
        const available=arrivalIds.filter(id=>id.startsWith(prefix));
        const visible=await ids();
        assert.ok(visible.length>0);
        assert.deepEqual(visible,available.slice(0,visible.length));
        await expect(cards.locator('.catalog-register > span:first-child')).toHaveText(visible.map(()=>type+'资料'));
      }
      const filteredURL=new URL(new URL(page.url()).hash.slice(1),base);
      assert.equal(filteredURL.searchParams.get('tab'),'new');
      assert.equal(filteredURL.searchParams.get('newType'),'paper');
      await page.reload();
      await expect(types.getByRole('button',{name:'论文资料',exact:true})).toHaveAttribute('aria-pressed','true');
      assert.deepEqual(await ids(),paperIds);
      await page.getByTestId('resource-card-A01').locator('h3 a').click();
      await page.getByRole('link',{name:'进入精读',exact:true}).click();
      await expect(page.locator('[data-text-paragraph]').first()).toContainText('包装');
      const back=/返回(?:资料)?详情/;
      await page.getByRole('link',{name:back}).or(page.getByRole('button',{name:back})).click();
      await expect(page.locator('main')).toHaveAttribute('data-page-id','P07');
      await page.getByRole('button',{name:'← 返回来源页面',exact:true}).click();
      await expect(tab).toHaveAttribute('aria-pressed','true');
      await expect(types.getByRole('button',{name:'论文资料',exact:true})).toHaveAttribute('aria-pressed','true');
      assert.deepEqual(await ids(),paperIds);
    }
  });
  await check('recommendation picks and interests lead to the same searchable collection and readers',async()=>{
    const rec=await browser.newPage({viewport:{width:390,height:844}});
    try{
      const seed=JSON.parse(await fs.readFile('contracts/fixtures.json','utf8'));
      seed.projects.find(p=>p.id==='project-empty').question='摄影器材';
      await rec.addInitScript(data=>{
        if(!localStorage.getItem('literature-center:v1:data'))localStorage.setItem('literature-center:v1:data',JSON.stringify(data));
      },seed);
      await rec.goto(base+'#/recommendations');
      const cards=rec.locator('.resource-card');
      const getIds=locator=>locator.evaluateAll(nodes=>nodes.map(n=>n.dataset.resourceId));
      const more=rec.getByRole('button',{name:/^加载更多/});
      async function loadAll(locator){
        while(await more.count()){
          const shown=await locator.count();
          await more.click();
          await expect.poll(()=>locator.count()).toBeGreaterThan(shown);
        }
      }
      const picks=rec.getByRole('group',{name:'精选资料类型'});
      await expect(picks).toBeVisible();
      await loadAll(cards);
      const expected=[...featuredIds,...paperIds,...featuredVideoIds];
      assert.deepEqual((await getIds(cards)).sort(),expected.sort());
      await expect(cards.locator('.catalog-label img')).toHaveCount(expected.length);
      await picks.getByRole('button',{name:'论文资料',exact:true}).click();
      await expect(cards).toHaveCount(4);
      const filtered=rec.url();
      const paper=rec.getByTestId('resource-card-A02');
      await paper.getByRole('button',{name:'预览',exact:true}).click();
      await expect(rec.getByRole('dialog').getByRole('article',{name:'论文正文节选'})).toBeVisible();
      await rec.keyboard.press('Escape');
      await paper.getByRole('link',{name:'进入精读',exact:true}).click();
      await expect(rec.getByTestId('reader-content').locator('[data-text-paragraph]').first()).toBeVisible();
      await rec.getByRole('link',{name:'← 返回来源页面',exact:true}).click();
      assert.equal(rec.url(),filtered);
      assert.deepEqual(await getIds(cards),paperIds);

      await rec.getByRole('link',{name:/检索全部馆藏/}).click();
      const searchCards=rec.locator('.search-record');
      await expect(rec.getByTestId('results-count')).toContainText('29');
      await loadAll(searchCards);
      assert.deepEqual((await getIds(searchCards)).sort(),[...arrivalIds].sort());
      await rec.getByTestId('search-input').fill('A02');
      await rec.getByTestId('search-submit').click();
      await expect(searchCards).toHaveCount(1);
      await expect(searchCards).toHaveAttribute('data-resource-id','A02');

      await rec.goto(base+'#/recommendations?tab=interest');
      await expect(rec.getByRole('button',{name:'兴趣推荐',exact:true})).toHaveAttribute('aria-pressed','true');
      await expect(cards).toHaveCount(0);
      const dialog=rec.getByRole('dialog');
      const settings=rec.getByRole('button',{name:/调整兴趣|设置兴趣/}).first();
      await settings.click();
      const packaging=dialog.getByRole('checkbox',{name:'包装设计',exact:true});
      await packaging.check();
      await dialog.getByRole('button',{name:'确认保存偏好',exact:true}).click();
      await expect(cards).toHaveCount(2);
      await rec.reload();
      await expect(cards).toHaveCount(2);
      assert.deepEqual((await getIds(cards)).sort(),['A01','A02']);
      const interestTypes=rec.getByRole('group',{name:'兴趣资料类型'});
      await interestTypes.getByRole('button',{name:'论文资料',exact:true}).click();
      await expect(interestTypes.getByRole('button',{name:'论文资料',exact:true})).toHaveAttribute('aria-pressed','true');
      await interestTypes.getByRole('button',{name:'全部类型',exact:true}).click();
      await settings.click();
      await expect(packaging).toBeChecked();
      await packaging.uncheck();
      await dialog.getByRole('combobox').selectOption('project-empty');
      await dialog.getByRole('button',{name:'确认保存偏好',exact:true}).click();
      await expect(rec.getByTestId('resource-card-I01')).toBeVisible();
      await expect(rec.getByTestId('resource-card-B01')).toHaveCount(1);
      assert.ok((await getIds(cards)).every(id=>arrivalIds.includes(id)));
      await settings.click();
      await dialog.getByRole('combobox').selectOption('');
      await dialog.getByRole('button',{name:'确认保存偏好',exact:true}).click();
      await expect(cards).toHaveCount(0);
      assert.ok(await rec.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }finally{await rec.close();}
  });
  await check('new photo originals and the Nanjing Road video load in place and open the matching study tools',async()=>{
    await go('/?tab=new');
    const more=page.getByRole('button',{name:/^加载更多/});
    while(!await page.getByTestId('resource-card-V02').count())await more.click();
    const dialog=page.getByRole('dialog');
    for(const id of newlyDigitizedIds){
      const card=page.getByTestId('resource-card-'+id);
      const cover=card.locator('.catalog-label img');
      await cover.scrollIntoViewIfNeeded();
      await expect.poll(()=>cover.evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
      await card.getByRole('button',{name:'预览',exact:true}).click();
      if(id==='V02'){
        const video=dialog.locator('.featured-media video');
        await expect.poll(()=>video.evaluate(el=>el.videoWidth)).toBeGreaterThan(0);
        await video.evaluate(el=>{el.currentTime=2;});
        await expect.poll(()=>video.evaluate(el=>!el.seeking&&el.currentTime)).toBe(2);
      }else{
        const image=dialog.locator('.featured-media img');
        await expect.poll(()=>image.evaluate(el=>el.naturalWidth)).toBeGreaterThan(0);
        await expect(image).toHaveAttribute('src',new RegExp(id+'[^/]*\\.(?:jpg|jpeg|png|webp)$','i'));
      }
      await expect(dialog.getByRole('link',{name:'进入精读',exact:true})).toHaveAttribute('href',new RegExp('/resources/'+id+'/read'));
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }
    for(const [type,id,action] of [['图片','I05','框选记笔记'],['视频','V02','在当前时间记笔记']]){
      await go('/?tab=new');
      await page.getByRole('group',{name:'新入库资料类型'}).getByRole('button',{name:type+'资料',exact:true}).click();
      await page.getByTestId('preview-resource-'+id).click();
      await dialog.getByRole('link',{name:'进入精读',exact:true}).click();
      await expect(page.getByRole('button',{name:action,exact:true})).toBeEnabled();
    }
  });
  await check('course articles open both supplied pages in search preview and resource detail',async()=>{
    await go('/search/results?q=A01');
    const article=page.getByTestId('resource-card-A01');
    await article.getByRole('button',{name:'预览',exact:true}).click();
    const dialog=page.getByRole('dialog'),preview=documentReader(dialog);
    await expect(dialog.getByRole('article',{name:'论文正文节选'})).toContainText('演变历程');
    await dialog.getByRole('button',{name:'PDF 原页',exact:true}).click();
    await expectBookPage(preview,1,2);
    await preview.getByRole('button',{name:'下一页',exact:true}).click();
    await expectBookPage(preview,2,2);
    await expect(preview.getByRole('button',{name:'下一页',exact:true})).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(article.getByRole('button',{name:'预览',exact:true})).toBeFocused();
    await article.locator('h3 a').click();
    const main=page.locator('main'),detail=documentReader(main);
    await expect(main.getByRole('article',{name:'论文正文节选'})).toContainText('演变历程');
    await expect(main.locator('.detail-access-actions a')).toHaveText(['进入精读','下载 PDF 节选']);
    await expect(main.getByRole('button',{name:/获取方式/})).toHaveCount(0);
    await main.getByRole('button',{name:'PDF 原页',exact:true}).click();
    await expectBookPage(detail,1,2);
    const firstPage=await pageInk(detail);
    await detail.getByRole('button',{name:'下一页',exact:true}).click();
    await expectBookPage(detail,2,2);
    await expect.poll(()=>pageInk(detail)).not.toBe(firstPage);
  });
  await check('a book opens in deep reading at the detail page and returns through its original journey',async()=>{
    await page.setViewportSize({width:390,height:844});
    try{
      await go('/');
      await page.getByTestId('resource-card-B01').locator('h3 a').click();
      const main=page.locator('main'),reader=documentReader(main);
      await expect(main).toHaveAttribute('data-page-id','P07');
      await expectBookPage(reader,1,6);
      await reader.getByRole('button',{name:'下一页',exact:true}).click();
      await expectBookPage(reader,2,6);
      const pageTwo=await pageInk(reader);
      await main.getByRole('link',{name:/进入精读/}).click();
      await expect(main).toHaveAttribute('data-page-id','P08');
      const route=new URL(new URL(page.url()).hash.slice(1),base);
      assert.equal(route.pathname,'/resources/B01/read');
      assert.equal(route.searchParams.get('page'),'2');
      await expectBookPage(reader,2,6);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await reader.getByRole('button',{name:'下一页',exact:true}).click();
      await expectBookPage(reader,3,6);
      await expect.poll(()=>pageInk(reader)).not.toBe(pageTwo);
      const returnName=/返回(?:资料)?详情/;
      await main.getByRole('link',{name:returnName}).or(main.getByRole('button',{name:returnName})).click();
      await expect(main).toHaveAttribute('data-page-id','P07');
      await expectBookPage(reader,3,6);
      await main.getByRole('button',{name:'← 返回来源页面',exact:true}).click();
      await expect(main).toHaveAttribute('data-page-id','P01');
    }finally{await page.setViewportSize({width:1440,height:900});}
  });
  await check('an article preview opens deep reading with the search project and a note reopens its original PDF page',async()=>{
    await go('/search/results?q=A01&targetProjectId=project-empty');
    await page.getByTestId('preview-resource-A01').click();
    const dialog=page.getByRole('dialog'),preview=documentReader(dialog);
    await dialog.getByRole('button',{name:'PDF 原页',exact:true}).click();
    await expectBookPage(preview,1,2);
    await preview.getByRole('button',{name:'下一页',exact:true}).click();
    await expectBookPage(preview,2,2);
    await dialog.getByRole('link',{name:/进入精读/}).click();
    const main=page.locator('main'),reader=documentReader(main);
    await expect(main).toHaveAttribute('data-page-id','P08');
    const route=new URL(new URL(page.url()).hash.slice(1),base);
    assert.equal(route.pathname,'/resources/A01/read');
    assert.equal(route.searchParams.get('projectId'),'project-empty');
    assert.equal(route.searchParams.get('page'),'2');
    await expectBookPage(reader,2,2);
    await main.getByRole('button',{name:'记本页笔记',exact:true}).click();
    const title='包装设计文章第二页的研究记录';
    await main.getByLabel('笔记标题',{exact:true}).fill(title);
    await main.getByLabel('我的观察与解释',{exact:true}).fill('回到本页时对照有关使用需求的讨论。');
    await main.getByRole('button',{name:'保存笔记',exact:true}).click();
    await main.getByRole('link',{name:/打开笔记与来源/}).click();
    const anchor=await page.evaluate(title=>{
      const data=JSON.parse(localStorage.getItem('literature-center:v1:data'));
      const note=data.notes.find(n=>n.title===title && n.originProjectId==='project-empty');
      return data.anchors.find(a=>a.id===note?.revisions.at(-1)?.anchorIds[0]);
    },title);
    assert.ok(anchor);assert.equal(anchor.kind,'pdf');assert.equal(anchor.page,2);assert.equal(anchor.resourceId,'A01');
    const source=main.locator('.source-block').getByRole('link',{name:/第\s*2\s*页/});
    await expect(source).toHaveAttribute('href',new RegExp('anchorId='+anchor.id));
    await source.click();
    await expect(main).toHaveAttribute('data-page-id','P08');
    await expectBookPage(reader,2,2);
  });
  await check('selecting across paper paragraphs saves the exact quotation and restores both highlights',async()=>{
    await go('/resources/A01');
    const main=page.locator('main');
    await expect(main.getByRole('button',{name:'论文正文',exact:true})).toHaveAttribute('aria-pressed','true');
    await main.getByRole('link',{name:'进入精读',exact:true}).click();
    const viewer=page.getByTestId('reader-content');
    const paragraphs=viewer.locator('[data-text-paragraph]');
    await expect(paragraphs.first()).toContainText('包装与人类的起源同步');
    const first=await paragraphs.nth(0).innerText(),second=await paragraphs.nth(1).innerText();
    const start=first.length-15,end=23;
    await selectText(viewer,0,start,1,end);
    await viewer.getByRole('button',{name:'记笔记',exact:true}).click();
    const title='论文跨段引文验收';
    await main.getByLabel('笔记标题',{exact:true}).fill(title);
    await main.getByLabel('我的观察与解释',{exact:true}).fill('从摘要末尾与正文开篇对照包装价值。');
    await main.getByRole('button',{name:'保存笔记',exact:true}).click();
    await main.getByRole('link',{name:/打开笔记与来源/}).click();
    const anchor=await page.evaluate(title=>{
      const data=JSON.parse(localStorage.getItem('literature-center:v1:data'));
      const note=data.notes.find(n=>n.title===title);
      return data.anchors.find(a=>a.id===note.revisions.at(-1).anchorIds[0]);
    },title);
    assert.equal(anchor.kind,'text');assert.equal(anchor.resourceId,'A01');
    assert.equal(anchor.paragraphId,'A01-p1-abstract');assert.equal(anchor.endParagraphId,'A01-p2-intro');
    assert.equal(anchor.quote,first.slice(start)+'\n\n'+second.slice(0,end));
    await main.locator('.source-block a[href*="anchorId="]').click();
    await expect(page.getByTestId('anchor-highlight')).toHaveText([first.slice(start),second.slice(0,end)]);
  });
  await check('two course PDFs can be compared using separately chosen pages',async()=>{
    await go('/resources/B01/read');
    await page.getByRole('button',{name:'文献对照',exact:true}).click();
    const picker=page.getByRole('dialog');
    await picker.locator('input[type="radio"][value="A02"]').check();
    await picker.getByRole('button',{name:'开始对照',exact:true}).click();
    await expect(page.locator('main')).toHaveAttribute('data-page-id','P09');
    const sides=page.locator('.compare-side');
    const book=documentReader(sides.nth(0)),article=documentReader(sides.nth(1));
    await expectBookPage(book,1,6);
    await sides.nth(1).getByRole('button',{name:'PDF 原页',exact:true}).click();
    await expectBookPage(article,1,2);
    await book.getByRole('button',{name:'下一页',exact:true}).click();
    await expectBookPage(book,2,6);
    for(const side of await sides.all())await side.getByRole('button',{name:'选为对照来源',exact:true}).click();
    const title='对照相机档案第二页和包装文章第一页';
    await page.getByLabel('比较维度',{exact:true}).fill(title);
    await page.getByRole('button',{name:'保存比较笔记',exact:true}).click();
    await expect(page.getByRole('link',{name:/查看已保存的比较笔记/})).toBeVisible();
    const pages=await page.evaluate(title=>{
      const data=JSON.parse(localStorage.getItem('literature-center:v1:data'));
      const note=data.notes.find(n=>n.title===title);
      return note.revisions.at(-1).anchorIds.map(id=>{
        const a=data.anchors.find(a=>a.id===id);
        return [a.kind,a.resourceId,a.page];
      });
    },title);
    assert.deepEqual(pages,[['pdf','B01',2],['pdf','A02',1]]);
  });
  await check('PDF passage notes retain the selected words or scan region, page crop and zoom-independent position',async()=>{
    await go('/resources/B01/read?page=4');
    const layer=page.locator('.pdf-page-text[data-ocr="true"]');
    const words=layer.locator('.pdf-ocr-line').filter({hasText:'上海照相机厂'}).first().locator('span');
    await words.nth(8).scrollIntoViewIfNeeded();
    const first=await words.nth(8).boundingBox(),last=await words.nth(25).boundingBox();
    await page.mouse.move(first.x+1,first.y+first.height/2);
    await page.mouse.down();
    await page.mouse.move(last.x+last.width-1,last.y+last.height/2,{steps:12});
    await page.mouse.up();
    const cite=page.getByRole('button',{name:'为选段记笔记',exact:true});
    await cite.click();
    const crop=page.locator('.pdf-selection-crop canvas').first();
    await expect(crop).toBeVisible();
    await page.getByLabel('笔记标题',{exact:true}).fill('摄影片段选文');
    await page.getByLabel('我的观察与解释',{exact:true}).fill('对照此段中的型号说明');
    await page.getByRole('button',{name:'保存笔记',exact:true}).click();
    const saved=await page.evaluate(()=>{
      const d=JSON.parse(localStorage.getItem('literature-center:v1:data'));
      const note=d.notes.find(n=>n.title==='摄影片段选文');
      return d.anchors.find(a=>a.id===note.revisions.at(-1).anchorIds[0]);
    });
    assert.equal(saved.page,4);assert.equal(saved.selection.ocr,true);
    assert.ok(saved.selection.quote.length>=10);assert.ok(saved.selection.rects.length);
    await go('/resources/B01/read?anchorId='+saved.id);
    const mark=page.getByTestId('anchor-highlight').first();
    await expect(mark).toBeVisible();
    const ratio=await mark.evaluate(el=>el.getBoundingClientRect().width/el.parentElement.getBoundingClientRect().width);
    await page.getByRole('button',{name:'放大',exact:true}).click();
    await expect(page.locator('.pdf-zoom')).toHaveText('125%');
    await expect.poll(()=>mark.evaluate(el=>el.getBoundingClientRect().width/el.parentElement.getBoundingClientRect().width)).toBeCloseTo(ratio,3);
    const desktop=page.viewportSize();
    try{
      await page.setViewportSize({width:390,height:844});
      await go('/resources/B04/read?page=2');
      await page.getByRole('button',{name:'框选段落',exact:true}).click();
      const pane=page.locator('.pdf-viewport');
      await pane.scrollIntoViewIfNeeded();
      const box=await pane.boundingBox();
      await page.mouse.click(box.x+0.15*box.width,box.y+0.18*box.height);
      await page.mouse.click(box.x+0.75*box.width,box.y+0.38*box.height);
      await cite.click();await expect(crop).toBeVisible();
      assert.ok(await crop.evaluate(el=>el.width>100 && el.height>20));
      await page.getByLabel('笔记标题',{exact:true}).fill('手册扫描原页框选');
      await page.getByLabel('我的观察与解释',{exact:true}).fill('规格与插图');
      await page.getByRole('button',{name:'保存笔记',exact:true}).click();
      const region=await page.evaluate(()=>{
        const d=JSON.parse(localStorage.getItem('literature-center:v1:data'));
        return d.anchors.find(a=>a.id===d.notes.find(n=>n.title==='手册扫描原页框选').revisions.at(-1).anchorIds[0]);
      });
      assert.equal(region.page,2);assert.equal(region.selection.rects.length,1);
      assert.ok(region.selection.rects[0].width<1 && region.selection.rects[0].height<1);
      await go('/resources/B04/read?anchorId='+region.id);await expect(mark).toBeVisible();
    }finally{await page.setViewportSize(desktop);}
  });
  await check('a failed PDF load can be retried inside the preview',async()=>{
    await go('/');
    const file='**/assets/B04-*.pdf';
    await page.route(file,route=>route.fulfill({status:503,body:'Temporarily unavailable'}));
    try{
      await page.getByTestId('preview-resource-B04').click();
      const dialog=page.getByRole('dialog');
      const retry=dialog.getByRole('button',{name:'重新加载',exact:true});
      await expect(retry).toBeVisible();
      await page.unroute(file);
      await retry.click();
      await expectBookPage(documentReader(dialog),1,bookPageCounts.B04);
    }finally{
      await page.unroute(file);
      await page.keyboard.press('Escape');
    }
  });
  await check('results edit advanced rules inline, save the draft and retain filters/view across apply and history',async()=>{
    await go('/search/results?q=保温瓶&queryId=query-demo-01&mode=standard&view=grid&types=image&sort=title');
    const originalURL=page.url();
    await page.getByRole('button',{name:'高级检索',exact:true}).click();
    assert.equal(page.url(),originalURL);
    await expect(page.locator('main')).toHaveAttribute('data-page-id','P03');
    await expect(page.getByLabel('条件2逻辑',{exact:true})).toHaveValue('NOT');
    await page.getByLabel('条件2逻辑',{exact:true}).selectOption('AND');
    await page.getByRole('button',{name:'保存策略',exact:true}).click();
    await page.getByLabel('策略名称（必填）',{exact:true}).fill('结果页条件草稿');
    await page.getByRole('dialog').getByRole('button',{name:'保存策略',exact:true}).click();
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('literature-center:v1:data')).savedQueries.find(q=>q.name==='结果页条件草稿'));
    assert.equal(saved.rules[1].operator,'AND');
    await page.getByRole('button',{name:'应用条件',exact:true}).click();
    const applied=new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
    for(const [key,value] of [['view','grid'],['types','image'],['sort','title']])assert.equal(applied.get(key),value);
    await expect(page.getByTestId('resource-card-DEMO-IMAGE')).toBeVisible();
    await expect(page.getByTestId('resource-card-I16')).toHaveCount(0);
    await page.reload();await expect(page.getByLabel('条件2逻辑',{exact:true})).toHaveValue('AND');
    await page.goBack();await page.getByRole('button',{name:'高级检索',exact:true}).click();
    await expect(page.getByLabel('条件2逻辑',{exact:true})).toHaveValue('NOT');
    await page.getByRole('button',{name:'＋ 添加条件',exact:true}).click();
    await page.getByRole('button',{name:'应用条件',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('请填写高级条件关键词');
    await page.getByRole('button',{name:'移除条件 3',exact:true}).click();
    await page.getByRole('button',{name:'收起高级检索',exact:true}).click();
    await page.getByRole('button',{name:'高级检索',exact:true}).click();
    await expect(page.getByLabel('条件2关键词',{exact:true})).toHaveValue('合成');
    await page.getByRole('button',{name:'清空高级条件',exact:true}).click();
    await page.getByRole('button',{name:'应用条件',exact:true}).click();
    await expect(page.locator('.rule-row')).toHaveCount(0);
    await expect(page.locator('.active-filters').getByRole('button',{name:'移除图片筛选',exact:true})).toBeVisible();
    for(const label of ['列表','图文','归类']){
      await page.getByRole('button',{name:label,exact:true}).click();
      const sample=page.getByTestId('resource-card-I16');
      await expect(sample.getByRole('heading',{level:3})).toBeVisible();
      await expect(sample.getByRole('button',{name:'预览',exact:true})).toBeVisible();
      await expect(sample.getByRole('link',{name:'进入精读',exact:true})).toBeVisible();
      await expect(sample.getByLabel('文献统计未提供',{exact:true})).toHaveCount(0);
    }
    await page.getByRole('button',{name:'清除筛选',exact:true}).click();
    assert.equal(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).has('types'),false);
  });
  await check('catalogue results show real title and text matches and return from each source to the original search',async()=>{
    await go('/search/results?q=南京路&view=grid&types=video&sort=title');
    const original=page.url(),video=page.getByTestId('resource-card-V02');
    await expect(video.locator('h3 mark')).toContainText('南京路');
    await expect(video).not.toContainText('题名命中');
    await expect.poll(()=>video.locator('img').first().evaluate(el=>el.naturalWidth)).toBeGreaterThan(0);
    await expect(video.getByRole('link',{name:'进入精读',exact:true})).toBeVisible();
    await video.getByRole('link',{name:'进入精读',exact:true}).click();
    await expect.poll(()=>page.locator('.video-reader video').evaluate(el=>el.videoWidth)).toBeGreaterThan(0);
    await page.getByRole('link',{name:'← 返回来源页面',exact:true}).click();
    assert.equal(page.url(),original);
    for(const [id,term,number] of [['A01','Technavio',2],['B01','架样机',4]]){
      await go('/search/results?q='+encodeURIComponent(term));
      const origin=page.url(),card=page.getByTestId('resource-card-'+id);
      await expect(card.locator('mark').first()).toHaveText(term);
      await expect(card).not.toContainText(/(?:题名|正文|摘录).*命中/);
      const source=card.getByTestId('search-hit-source');
      await expect(source).toHaveAccessibleName('查看节选第 '+number+' 页');
      await source.click();
      if(id==='A01'){
        await expect(page.getByTestId('reader-content').locator('[data-text-paragraph]').filter({hasText:term})).toBeInViewport();
      }else await expectBookPage(documentReader(page.locator('main')),number,6);
      await page.getByRole('link',{name:'← 返回来源页面',exact:true}).click();
      assert.equal(page.url(),origin);
    }
  });
  await check('mobile facets retain other media counts, sort by accession and recover from empty queries',async()=>{
    const desktop=page.viewportSize();
    try{
      await page.setViewportSize({width:390,height:844});
      await go('/search/results?types=image&access=file_available');
      const toggle=page.getByRole('button',{name:/^筛选条件/});
      await expect(toggle).toHaveAttribute('aria-expanded','false');
      await toggle.click();
      const panel=page.locator('#catalog-facets');
      for(const [label,count] of [['图书',4],['图片',18],['论文',4],['视频',3]]){
        await expect(panel.getByRole('checkbox',{name:new RegExp(label+'.*'+count+'$')})).toBeEnabled();
      }
      await toggle.click();
      await page.getByLabel('结果排序',{exact:true}).selectOption('new');
      const cards=page.locator('[data-testid^="resource-card-"]');
      await expect(cards.first()).toHaveAttribute('data-testid','resource-card-I05');
      await page.getByRole('button',{name:'移除图片筛选',exact:true}).click();
      await expect(page.getByTestId('results-count')).toContainText('29');
      await go('/search/results?q=南京路&types=paper');
      await expect(page.getByTestId('results-count')).toContainText('0');
      await page.getByRole('button',{name:'移除筛选，保留检索词',exact:true}).click();
      await expect(page.getByTestId('search-input')).toHaveValue('南京路');
      await expect(page.getByTestId('resource-card-V02')).toBeVisible();
      await go('/search/results');
      const total=await page.getByTestId('results-count').innerText();
      await go('/search/results?q=南京路&queryId=query-demo-01&types=book&topicId=missing-topic');
      await page.getByRole('button',{name:'浏览全部公开资料',exact:true}).click();
      const recovered=new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
      for(const key of ['queryId','q','topicId','types'])assert.equal(recovered.has(key),false);
      await expect(page.getByTestId('results-count')).toHaveText(total);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }finally{await page.setViewportSize(desktop);}
  });
  await check('bulk saving writes personal library without downloads; compare requires two readable resources',async()=>{
    await go('/search/results?q=保温瓶&view=list');
    const clear=page.getByRole('button',{name:'清空选择',exact:true});
    if(await clear.isVisible()&&await clear.isEnabled())await clear.click();
    const downloads=[];const onDownload=d=>downloads.push(d.suggestedFilename());page.on('download',onDownload);
    const choose=id=>page.getByTestId('resource-card-'+id).getByRole('checkbox');
    await choose('I16').check();
    await choose('DEMO-RESTRICTED').check();
    await expect(page.getByRole('button',{name:'对照阅读',exact:true})).toBeDisabled();
    await expect(page.getByText('对照阅读需选择两份有可读内容的资料。',{exact:true})).toBeVisible();
    await choose('DEMO-RESTRICTED').uncheck();
    await choose('I17').check();
    await expect(page.getByRole('button',{name:'对照阅读',exact:true})).toBeEnabled();
    await page.getByRole('button',{name:'保存到我的资料',exact:true}).click();
    await page.getByRole('button',{name:'保存到我的资料',exact:true}).click();
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('literature-center:v1:data')).personalSaves);
    for(const id of ['I16','I17'])assert.equal(saved.filter(s=>s.userId==='demo-user'&&s.resourceId===id).length,1);
    assert.deepEqual(downloads,[]);page.off('download',onDownload);
    await fs.mkdir('test-results/results-refinement',{recursive:true});
    await page.screenshot({path:'test-results/results-refinement/bulk-desktop.png',fullPage:true});
    await page.getByRole('button',{name:'对照阅读',exact:true}).click();
    await expect(page.locator('main')).toHaveAttribute('data-page-id','P09');
    for(const [index,id] of ['I16','I17'].entries()){
      const original=page.getByTestId('image-note-canvas').nth(index).locator('image');
      await expect(original).toHaveAttribute('href',new RegExp(id+'[^/]*\\.jpg$'));
    }
    await page.goBack();
    await page.getByRole('button',{name:'清空选择',exact:true}).click();
    for(const id of ['DEMO-TEXT','DEMO-IMAGE'])await page.getByTestId('resource-card-'+id).getByRole('checkbox').check();
    await expect(page.getByRole('button',{name:'对照阅读',exact:true})).toBeEnabled();
    await page.getByRole('button',{name:'对照阅读',exact:true}).click();
    await expect(page.locator('main')).toHaveAttribute('data-page-id','P09');
    for(const [width,height] of [[1440,900],[390,844]]){
      await page.setViewportSize({width,height});
      await go('/search/results?q=保温瓶&queryId=query-demo-01');
      const expand=page.getByRole('button',{name:'高级检索',exact:true});
      if(await expand.count())await expand.click();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:`test-results/results-refinement/advanced-${width}.png`,fullPage:true});
    }
    await page.setViewportSize({width:1440,height:900});
  });
  await check('16 Pages deep links and refresh without server fallback',async()=>{
    assert.equal((await fetch(base+'search')).status,404);
    const routes=JSON.parse(await fs.readFile('contracts/routes.json','utf8'));
    for(const route of routes.pages){await go(route.example);await expect(page.locator('main')).toHaveAttribute('data-page-id',route.id);await page.reload();await expect(page.locator('main')).toHaveAttribute('data-page-id',route.id);await expect(page.getByText('页面未能加载',{exact:true})).toHaveCount(0);}
  });
  await check('90 review cases use hash query, and exit restores default data',async()=>{
    const before=await page.evaluate(()=>localStorage.getItem('literature-center:v1:data'));
    const cases=JSON.parse(await fs.readFile('contracts/review_cases.json','utf8'));
    for(const item of cases.cases){await go(item.baseUrl+(item.baseUrl.includes('?')?'&':'?')+'review='+item.id);await expect(page.locator('main')).toHaveAttribute('data-page-id',item.pageId);await expect(page.locator('.review-banner')).toContainText(item.id);}
    await page.getByRole('link',{name:'退出此场景',exact:true}).click();await expect(page.locator('.review-banner')).toHaveCount(0);
    assert.equal(await page.evaluate(()=>localStorage.getItem('literature-center:v1:data')),before);
    await go('/__review');await page.getByRole('link',{name:'退出评审，返回首页'}).click();await expect(page.locator('main')).toHaveAttribute('data-page-id','P01');
  });
  await check('search query, project target, browser back and forward survive',async()=>{
    await go('/search/results?q=%E4%BF%9D%E6%B8%A9%E7%93%B6&targetProjectId=project-empty');
    await page.getByTestId('resource-card-DEMO-TEXT').getByRole('link').first().click();await expect(page.locator('main')).toHaveAttribute('data-page-id','P07');
    const detail=page.url();assert.ok(detail.includes('projectId=project-empty'));
    await page.goBack();await expect(page.locator('main')).toHaveAttribute('data-page-id','P03');assert.equal(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('q'),'保温瓶');
    await page.goForward();await expect(page.locator('main')).toHaveAttribute('data-page-id','P07');assert.equal(page.url(),detail);
  });
  await check('share and native link targets include deployment prefix',async()=>{
    await go('/');const card=page.getByTestId('resource-card-B01');await card.getByRole('button',{name:'分享',exact:true}).click();
    const url=await page.getByLabel('资料地址',{exact:true}).inputValue();assert.equal(url,base+'#/resources/B01');
    await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
    const href=await card.getByRole('link').first().getAttribute('href');assert.equal(href,prefix+'#/resources/B01');
    const tab=await context.newPage();await tab.goto(url);await expect(tab.locator('main')).toHaveAttribute('data-page-id','P07');await tab.close();
  });
  await check('1440, 1280 and narrow Pages rendering',async()=>{
    await fs.mkdir('screenshots/pages-preparation',{recursive:true});
    for(const [width,height] of [[1440,900],[1280,800],[390,844]]){await page.setViewportSize({width,height});await go('/search/results?q=保温瓶');await expect(page.locator('main')).toHaveAttribute('data-page-id','P03');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`screenshots/pages-preparation/P03-${width}x${height}.png`,fullPage:false});}
  });
  await check('course photos and videos support anchored notes and return to the source',async()=>{
    await page.setViewportSize({width:1280,height:800});
    async function enter(id){
      await go('/resources/'+id);
      await page.getByRole('link',{name:'进入精读',exact:true}).click();
      await expect(page.getByTestId('reader-content')).toBeVisible();
    }
    async function saveAndReopen(body){
      await page.getByLabel('笔记内容',{exact:true}).fill(body);
      await page.getByRole('button',{name:'保存笔记',exact:true}).click();
      await page.getByRole('link',{name:'查看与编辑笔记'}).click();
      const source=page.locator('.source-links a[href*="anchorId="]').first();
      await expect(source).toBeVisible();
      await source.click();
      await expect(page.getByTestId('anchor-highlight')).toBeVisible();
    }
    await enter('I01');
    const picture=page.getByTestId('image-note-canvas');
    await expect(picture.locator('image')).toHaveAttribute('href',/I01[^/]*\.jpg$/);
    await expect(picture).toHaveAttribute('viewBox','0 0 797 1200');
    await page.getByRole('button',{name:'框选记笔记',exact:true}).click();
    await picture.scrollIntoViewIfNeeded();
    const box=await picture.boundingBox();
    await page.mouse.move(box.x+box.width*.30,box.y+box.height*.35);
    await page.mouse.down();
    await page.mouse.move(box.x+box.width*.65,box.y+box.height*.60,{steps:6});
    await page.mouse.up();
    await expect(page.locator('.image-note-selection')).toContainText('已选区域');
    await saveAndReopen('课程相机图片局部观察');
    const highlight=page.getByTestId('anchor-highlight');
    assert.ok(Math.abs(Number(await highlight.getAttribute('x'))/797-.30)<.02);
    assert.ok(Math.abs(Number(await highlight.getAttribute('height'))/1200-.25)<.02);

    for(const [id,start,end] of [['V01',9,9],['V03',12,18]]){
      await enter(id);
      const video=page.locator('.video-reader video');
      await expect(video).toHaveAttribute('src',new RegExp(id+'[^/]*\\.mp4$'));
      await expect.poll(()=>video.evaluate(el=>el.duration)).toBe(45);
      async function seek(t){
        await video.evaluate((el,time)=>{el.pause();el.currentTime=time;},t);
        await expect.poll(()=>video.evaluate(el=>!el.seeking&&Math.floor(el.currentTime))).toBe(t);
      }
      await seek(start);
      if(end===start){
        await page.getByRole('button',{name:'在当前时间记笔记',exact:true}).click();
      }else{
        await page.getByRole('button',{name:'标记片段',exact:true}).click();
        await seek(end);
        await page.getByRole('button',{name:/结束并记笔记/}).click();
      }
      await saveAndReopen('课程视频观察 '+id);
      await expect.poll(()=>video.evaluate(el=>Math.floor(el.currentTime))).toBe(start);
      await expect(page.getByTestId('anchor-highlight')).toContainText(end===start?'00:09':'00:12–00:18');
    }
  });
  await check('topic chat keeps follow-ups on return, retries without duplicates and isolates topics',async()=>{
    const thread=await browser.newPage({viewport:{width:390,height:844}});
    const topics=JSON.parse(await fs.readFile('contracts/topics.json','utf8'));
    const [topic,other]=topics;
    const source={resourceId:'A01',id:'A01-p1-abstract',paragraphId:'A01-p1-abstract',page:1,
      title:JSON.parse(await fs.readFile('contracts/course-articles.json','utf8')).A01.title,label:'第 1 页 · 摘要'};
    const question='这篇论文采用了什么研究方法？',followUp='结合上一条，再说说第一步。';
    const replies=['可以先读论文的摘要。','第一步是核对论文摘要中列出的方法。'];
    const sent=[];
    try {
      await thread.route('**/api/reader',async route=>{
        sent.push(route.request().postDataJSON());
        if(sent.length===2)await route.fulfill({status:502,json:{error:'服务暂时不可用。'}});
        else await route.fulfill({json:{answer:replies[sent.length===1?0:1],sources:[source]}});
      });
      const url=base+'#/topics/'+topic.id+'?chat=1';
      await thread.goto(url);
      const chat=thread.getByTestId('research-chat');
      const input=chat.getByRole('textbox'),log=chat.getByRole('log');
      await input.fill(question);await input.press('Enter');
      await expect(log).toContainText(replies[0]);
      assert.equal(sent[0].topicId,topic.id);
      assert.deepEqual(sent[0].resourceIds.slice().sort(),topic.resourceIds.slice().sort());
      await input.fill(followUp);await chat.getByRole('button',{name:'发送',exact:true}).click();
      await expect(chat.getByRole('alert')).toContainText('服务暂时不可用');
      await expect(input).toHaveValue(followUp);
      await chat.getByRole('button',{name:'重新发送'}).click();
      await expect(log).toContainText(replies[1]);
      assert.deepEqual(sent[1],sent[2]);
      assert.deepEqual(sent[2].history,[{role:'user',content:question},{role:'assistant',content:replies[0],sourceIds:[source.id]}]);
      await expect(log.locator('.chat-user')).toHaveCount(2);
      await log.getByRole('link',{name:new RegExp(source.label)}).last().click();
      await expect(thread.getByTestId('reader-content').locator('[data-text-paragraph="A01-p1-abstract"]')).toBeVisible();
      await thread.getByRole('link',{name:'← 返回来源页面',exact:true}).click();
      await expect(log).toContainText(replies[1]);
      await thread.reload();await expect(log).toContainText(replies[0]);
      await thread.goto(base+'#/topics/'+other.id+'?chat=1');
      await expect(chat).toBeVisible();await expect(log.locator('.chat-user')).toHaveCount(0);
      await thread.goto(url);await chat.getByRole('button',{name:'清空对话'}).click();
      await expect(log.locator('.chat-user')).toHaveCount(0);
      assert.equal(sent.length,3);
    } finally {await thread.close();}
  });
  await check('production assets omit local transfer files and capture hook',async()=>{
    const html=await fs.readFile(path.join(root,'index.html'),'utf8');assert.ok(html.includes('/1030-xmsj/assets/'));assert.ok(!html.includes('figmacapture'));assert.ok(!html.includes('mcp.figma.com'));
    assert.deepEqual((await fs.readdir(root)).sort(),['assets','index.html']);
    assert.deepEqual(errors,[]);
  });
  await check('paper outline → excerpt and observation → board card → exact source and board return',()=>readingBoardJourney(browser,base+'#'));
  await browser.close();
  await check('free text selections, notes and source return on Pages deployment paths',async()=>{
    const code=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['tests/reader-selection.mjs'],{stdio:'inherit',env:{...process.env,APP_BASE_URL:base+'#'}});p.on('error',reject);p.on('exit',resolve);});assert.equal(code,0);
  });
  await check('complete research flow on Pages deployment paths',async()=>{
    const code=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['tests/flow.mjs'],{stdio:'inherit',env:{...process.env,APP_BASE_URL:base+'#',FLOW_REPORT:'tests/pages-flow-results.json'}});p.on('error',reject);p.on('exit',resolve);});assert.equal(code,0);
  });
}finally{
  await browser.close();await new Promise(resolve=>server.close(resolve));
  await fs.writeFile('tests/pages-browser-results.json',JSON.stringify({date:new Date().toISOString(),results,errors},null,2));
}
if(results.some(r=>r.result==='fail'))process.exitCode=1;
