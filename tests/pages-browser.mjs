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
  await check('complete research flow on Pages deployment paths',async()=>{
    const code=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['tests/flow.mjs'],{stdio:'inherit',env:{...process.env,APP_BASE_URL:base+'#',FLOW_REPORT:'tests/pages-flow-results.json'}});p.on('error',reject);p.on('exit',resolve);});assert.equal(code,0);
  });
}finally{
  await browser.close();await new Promise(resolve=>server.close(resolve));
  await fs.writeFile('tests/pages-browser-results.json',JSON.stringify({date:new Date().toISOString(),results,errors},null,2));
}
if(results.some(r=>r.result==='fail'))process.exitCode=1;
