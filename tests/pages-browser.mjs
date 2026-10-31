import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium,expect} from '@playwright/test';

// Serve exact files only: no SPA fallback, matching Pages hash-route requirements.
const root=path.resolve('dist-pages'),prefix='/1030-xmsj/';
const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');
  if(!url.pathname.startsWith(prefix)){res.writeHead(404);res.end();return;}
  const file=path.resolve(root,decodeURIComponent(url.pathname.slice(prefix.length))||'index.html');
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const body=await fs.readFile(file);
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(body);
}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(4174,'127.0.0.1',resolve));
const base='http://127.0.0.1:4174'+prefix;
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
const page=await context.newPage();page.setDefaultTimeout(8000);
const results=[],errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.accept());
const go=async(route)=>{await page.goto(base+'#'+route);await page.waitForSelector('main');};
const check=async(name,fn)=>{try{await fn();results.push({name,result:'pass'});console.log('PASS',name);}catch(e){results.push({name,result:'fail',error:String(e)});console.error('FAIL',name,String(e));}};
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
    const search=page.locator('.home-search');
    await search.getByRole('button',{name:'AI 辅助检索',exact:true}).click();
    await expect(search.locator('.notice')).toHaveCount(0);
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
    while(await page.getByRole('button',{name:'加载更多资源',exact:true}).count())await page.getByRole('button',{name:'加载更多资源',exact:true}).click();
    const cards=page.locator('.resource-card');const count=await cards.count();assert.ok(count>4);
    await expect(cards.getByRole('button',{name:'下载资料',exact:true})).toHaveCount(0);
    const before=await page.evaluate(()=>localStorage.getItem('literature-center:v1:data'));
    const downloads=[];const onDownload=d=>downloads.push(d.suggestedFilename());page.on('download',onDownload);
    for(let i=0;i<count;i++){
      const card=cards.nth(i),id=await card.getAttribute('data-resource-id'),title=await card.locator('h3').innerText();
      const button=card.getByRole('button',{name:'预览',exact:true});await button.click();
      const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('heading',{level:2})).toHaveText('资料预览 · '+title);
      if(id==='DEMO-TEXT')await expect(dialog.getByRole('heading',{name:'文本片段'})).toBeVisible();
      else if(id==='DEMO-IMAGE')await expect(dialog.getByRole('img')).toBeVisible();
      else if(id==='DEMO-VIDEO')await expect(dialog.getByRole('heading',{name:'时间轴片段'})).toBeVisible();
      else await expect(dialog.getByRole('heading',{name:'目录预览'})).toBeVisible();
      await page.keyboard.press('Shift+Tab');
      assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)));
      await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(button).toBeFocused();
    }
    assert.equal(await cards.count(),count);
    assert.equal(await page.evaluate(()=>localStorage.getItem('literature-center:v1:data')),before);
    assert.deepEqual(downloads,[]);page.off('download',onDownload);
    await page.getByTestId('preview-resource-B01').click();await page.getByRole('dialog').getByRole('link',{name:'查看详情',exact:true}).click();
    await expect(page.locator('main')).toHaveAttribute('data-page-id','P07');
    await page.getByRole('button',{name:'← 返回来源页面',exact:true}).click();await expect(page.locator('main')).toHaveAttribute('data-page-id','P01');
  });
  await check('home and preview fit desktop and narrow screens; new-arrival cards share preview',async()=>{
    await fs.mkdir('test-results/homepage',{recursive:true});
    for(const [width,height] of [[1440,900],[1280,800],[390,844]]){
      await page.setViewportSize({width,height});await go('/');
      await page.getByRole('button',{name:'AI 辅助检索',exact:true}).click();
      await page.screenshot({path:`test-results/homepage/home-${width}.png`,fullPage:true});
      await page.getByTestId('preview-resource-B01').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      assert.ok(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
      await page.screenshot({path:`test-results/homepage/preview-${width}.png`});
      await page.getByRole('button',{name:'关闭对话框',exact:true}).click();
    }
    await page.setViewportSize({width:1440,height:900});await go('/');
    await page.getByRole('button',{name:'新入库',exact:true}).click();
    const card=page.locator('.resource-card').first();await card.getByRole('button',{name:'预览',exact:true}).click();
    await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
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
    await expect(page.locator('.active-filters')).not.toContainText('类型');
    for(const label of ['列表','图文','归类']){
      await page.getByRole('button',{name:label,exact:true}).click();
      await expect(page.locator('.resource-card .resource-footer')).toHaveCount(0);
      await expect(page.locator('.resource-card .availability')).toHaveCount(0);
    }
    await page.getByRole('button',{name:'清除筛选',exact:true}).click();
    assert.equal(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).has('types'),false);
  });
  await check('bulk saving writes personal library without downloads; compare requires two readable resources',async()=>{
    await go('/search/results?q=保温瓶&view=list');
    if(await page.getByRole('button',{name:'清空选择',exact:true}).isEnabled())await page.getByRole('button',{name:'清空选择',exact:true}).click();
    const downloads=[];const onDownload=d=>downloads.push(d.suggestedFilename());page.on('download',onDownload);
    for(const id of ['I16','I17'])await page.getByTestId('resource-card-'+id).getByRole('checkbox').check();
    await expect(page.getByRole('button',{name:'对照阅读',exact:true})).toBeDisabled();
    await expect(page.getByText('对照阅读需选择两份有可读内容的资料。',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'保存到我的资料',exact:true}).click();
    await page.getByRole('button',{name:'保存到我的资料',exact:true}).click();
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('literature-center:v1:data')).personalSaves);
    for(const id of ['I16','I17'])assert.equal(saved.filter(s=>s.userId==='demo-user'&&s.resourceId===id).length,1);
    assert.deepEqual(downloads,[]);page.off('download',onDownload);
    await fs.mkdir('test-results/results-refinement',{recursive:true});
    await page.screenshot({path:'test-results/results-refinement/bulk-desktop.png',fullPage:true});
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
  await check('production assets omit local transfer files and capture hook',async()=>{
    const html=await fs.readFile(path.join(root,'index.html'),'utf8');assert.ok(html.includes('/1030-xmsj/assets/'));assert.ok(!html.includes('figmacapture'));assert.ok(!html.includes('mcp.figma.com'));
    assert.deepEqual((await fs.readdir(root)).sort(),['assets','index.html']);
    assert.deepEqual(errors,[]);
  });
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
