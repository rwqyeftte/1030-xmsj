import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {selectText} from './text-selection.mjs';

const browser=await chromium.launch({channel:'chrome',headless:true});
const base=process.env.APP_BASE_URL||'http://127.0.0.1:5174/1030-xmsj/#';
const fixture=JSON.parse(await fs.readFile('contracts/fixtures.json','utf8'));
const paragraphs=fixture.contents.find(c=>c.resourceId==='DEMO-TEXT').paragraphs;
const results=[],errors=[];
await fs.mkdir('test-results/reader-refinement',{recursive:true});
async function check(name,run){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(String(e)));
  try{await page.goto(base+'/resources/DEMO-TEXT/read');await expect(page.getByTestId('reader-content')).toBeVisible();await run(page);results.push({name,result:'pass'});console.log('PASS',name);}
  catch(e){results.push({name,result:'fail',error:String(e)});console.error('FAIL',name,String(e));await page.screenshot({path:'test-results/reader-refinement/failure-'+results.length+'.png',fullPage:true});}
  finally{await context.close();}
}
async function openNotes(page){const toggle=page.getByRole('button',{name:'打开笔记栏',exact:true});if(await toggle.isVisible())await toggle.click();}
const data=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('literature-center:v1:data')));
async function save(page,title){
  if(await page.getByRole('button',{name:'打开笔记栏',exact:true}).isVisible())await page.getByRole('button',{name:'打开笔记栏',exact:true}).click();
  await page.getByLabel('笔记标题',{exact:true}).fill(title);
  await page.getByLabel('我的观察与解释',{exact:true}).fill('这是一条与自由选文关联的观察。');
  await page.getByRole('button',{name:'保存笔记',exact:true}).click();
  await expect(page.getByRole('link',{name:'打开笔记与来源 →',exact:true})).toBeVisible();
  const d=await data(page),note=d.notes.find(n=>n.title===title);
  return d.anchors.find(a=>a.id===note.revisions[0].anchorIds[0]);
}
try{
  await check('tall reading layout shows more body text without a separate reading mode',async page=>{
    const viewer=page.getByTestId('reader-content'),panel=page.getByTestId('context-panel');
    await expect(panel).toBeVisible();await expect(page.getByRole('button',{name:/沉浸阅读/})).toHaveCount(0);
    await expect(page.locator('.global-header')).toBeVisible();
    assert.equal(await page.locator('.reader-page').evaluate(el=>getComputedStyle(el).position),'static');
    for(const [width,height] of [[1440,900],[1280,800]]){
      await page.setViewportSize({width,height});
      const first=await page.locator('[data-text-paragraph]').first().boundingBox();
      assert.ok(first.y<330,'first paragraph should start near the top of the reading area');
      assert.ok((await viewer.boundingBox()).height>=height-195,'reading panel should use the available height');
      await expect(page.locator('[data-text-paragraph]').nth(3)).toBeInViewport();
      await expect(page.locator('[data-text-paragraph]').last()).not.toBeInViewport();
      assert.ok(await viewer.evaluate(el=>el.scrollHeight>el.clientHeight*2),'the demo should span multiple reading screens');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:`test-results/reader-refinement/vertical-reading-${width}.png`});
    }
  });
  await check('directory aligns visible and distant paragraphs, stays accessible and restores location',async page=>{
    const viewer=page.getByTestId('reader-content'),index=page.getByRole('complementary',{name:'阅读目录'});
    await expect(index.getByRole('button')).toHaveCount(paragraphs.length);
    const second=page.locator('[data-text-paragraph="para-2"]'),before=await second.boundingBox();
    const outerScroll=await page.evaluate(()=>scrollY);
    await index.getByRole('button',{name:'第 2 段',exact:true}).click();
    const after=await second.boundingBox(),toolbar=await page.getByLabel('文字摘录操作').boundingBox();
    assert.ok(after.y<before.y-20,'clicking an already visible paragraph should still align it');
    assert.ok(after.y>=toolbar.y+toolbar.height&&after.y<=toolbar.y+toolbar.height+16);
    assert.equal(await page.evaluate(()=>scrollY),outerScroll);
    await expect(index.getByRole('button',{name:'第 2 段',exact:true})).toHaveAttribute('aria-current','location');
    await index.getByRole('button',{name:'第 10 段',exact:true}).click();
    await expect(page.locator('[data-text-paragraph="para-10"]')).toBeInViewport();
    assert.ok(await viewer.evaluate(el=>el.scrollTop>1000));
    await expect(index).toBeInViewport();
    await page.reload();
    await expect(page.locator('[data-text-paragraph="para-10"]')).toBeInViewport();
    await expect(index.getByRole('button',{name:'第 10 段',exact:true})).toHaveAttribute('aria-current','location');
    await page.screenshot({path:'test-results/reader-refinement/directory-long-text.png'});
    const first=index.getByRole('button',{name:'第 1 段',exact:true});await first.focus();await page.keyboard.press('Enter');
    await expect(page.locator('[data-text-paragraph="para-1"]')).toBeInViewport();
    await selectText(viewer,0,6,0,22);await page.getByRole('button',{name:'记笔记',exact:true}).click();
    await page.getByLabel('我的观察与解释',{exact:true}).fill('切换段落仍保留观察');
    await index.getByRole('button',{name:'第 8 段',exact:true}).click();
    await expect(page.locator('.selected-source-quote')).toHaveText(paragraphs[0].text.slice(6,22));
    await expect(page.getByLabel('我的观察与解释',{exact:true})).toHaveValue('切换段落仍保留观察');
  });
  await check('existing browser data receives longer demo without replacing notes or other records',async page=>{
    const legacy=structuredClone(fixture),content=legacy.contents.find(c=>c.resourceId==='DEMO-TEXT');
    content.paragraphs=content.paragraphs.slice(0,3);legacy.savedQueries[0].q='用户自己的条件';
    await page.evaluate(d=>localStorage.setItem('literature-center:v1:data',JSON.stringify(d)),legacy);
    await page.reload();await expect(page.locator('[data-text-paragraph]')).toHaveCount(12);
    const expected=structuredClone(legacy);expected.contents.find(c=>c.resourceId==='DEMO-TEXT').paragraphs=paragraphs;
    assert.deepEqual(await data(page),expected);
    await page.reload();assert.deepEqual(await data(page),expected);
  });
  await check('draft backup is secondary, downloads current quote and does not create a saved note',async page=>{
    await selectText(page.getByTestId('reader-content'),0,28,1,8);await page.getByRole('button',{name:'记笔记',exact:true}).click();
    await page.getByLabel('笔记标题',{exact:true}).fill('临时留存');await page.getByLabel('我的观察与解释',{exact:true}).fill('还在整理中的观察。');
    const backup=page.getByRole('button',{name:'下载草稿备份（JSON）',exact:true});await expect(backup).toBeHidden();
    await page.getByText('更多笔记操作',{exact:true}).click();await expect(backup).toBeVisible();
    const before=await data(page),download=page.waitForEvent('download');await backup.click();const file=await download;
    assert.equal(file.suggestedFilename(),'笔记草稿备份.json');const parsed=JSON.parse(await fs.readFile(await file.path(),'utf8'));
    assert.equal(parsed.title,'临时留存');assert.equal(parsed.body,'还在整理中的观察。');assert.equal(parsed.anchor.quote,paragraphs[0].text.slice(28)+'\n\n'+paragraphs[1].text.slice(0,8));assert.deepEqual(await data(page),before);
  });
  await check('comparison requires an explicit second source and preserves reader draft and project context',async page=>{
    await page.goto(base+'/resources/DEMO-TEXT/read?projectId=project-empty');
    await page.getByLabel('笔记标题',{exact:true}).fill('对照前的观察');await page.getByLabel('我的观察与解释',{exact:true}).fill('稍后继续写。');
    const origin=page.url();await page.getByRole('button',{name:'文献对照',exact:true}).click();
    const dialog=page.getByRole('dialog');await expect(dialog).toHaveAccessibleName('选择对照资料');assert.equal(page.url(),origin);
    await expect(dialog.getByRole('button',{name:'开始对照',exact:true})).toBeDisabled();await expect(dialog.locator('input:checked')).toHaveCount(0);
    await expect(dialog.locator('input[value="DEMO-TEXT"]')).toHaveCount(0);await expect(dialog.locator('input[value="B01"]')).toHaveCount(0);
    await dialog.getByRole('button',{name:'取消',exact:true}).click();assert.equal(page.url(),origin);await expect(page.getByLabel('笔记标题',{exact:true})).toHaveValue('对照前的观察');
    await page.getByRole('button',{name:'文献对照',exact:true}).click();
    await dialog.getByLabel('查找对照资料',{exact:true}).fill('完全没有的题名');await expect(dialog.getByRole('radio')).toHaveCount(0);await expect(dialog.getByRole('button',{name:'开始对照',exact:true})).toBeDisabled();
    await dialog.getByLabel('查找对照资料',{exact:true}).fill('DEMO-VIDEO');await dialog.locator('input[type="radio"][value="DEMO-VIDEO"]').check();
    await page.screenshot({path:'test-results/reader-refinement/comparison-picker.png'});
    await dialog.getByRole('button',{name:'开始对照',exact:true}).click();
    await expect(page.locator('main')).toHaveAttribute('data-page-id','P09');const query=new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
    assert.equal(query.get('left'),'DEMO-TEXT');assert.equal(query.get('right'),'DEMO-VIDEO');assert.equal(query.get('projectId'),'project-empty');assert.ok(query.get('ctx'));
    await expect(page.getByLabel('右侧资料',{exact:true})).toHaveValue('DEMO-VIDEO');await expect(page.getByTestId('reader-content').nth(1)).toHaveAttribute('data-content-kind','video_timeline');
    await page.getByRole('link',{name:'← 返回原位置',exact:true}).click();await expect(page.locator('main')).toHaveAttribute('data-page-id','P08');await expect(page.getByLabel('笔记标题',{exact:true})).toHaveValue('对照前的观察');await expect(page.getByLabel('我的观察与解释',{exact:true})).toHaveValue('稍后继续写。');
  });
  await check('comparison excludes inaccessible and stale sources; a missing URL side stays unselected',async page=>{
    const sample=structuredClone(fixture);sample.session.userId=null;sample.resources.find(r=>r.id==='DEMO-VIDEO').versionId='unavailable-version';
    await page.evaluate(d=>localStorage.setItem('literature-center:v1:data',JSON.stringify(d)),sample);await page.reload();
    await page.getByRole('button',{name:'文献对照',exact:true}).click();const dialog=page.getByRole('dialog');
    await expect(dialog.locator('input[value="PRIVATE-DEMO"]')).toHaveCount(0);await expect(dialog.locator('input[type="radio"][value="DEMO-VIDEO"]')).toHaveCount(0);await expect(dialog.locator('input[value="DEMO-RESTRICTED"]')).toHaveCount(0);
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'文献对照',exact:true})).toBeFocused();
    await page.goto(base+'/compare?left=DEMO-TEXT');await expect(page.getByLabel('右侧资料',{exact:true})).toHaveValue('');await expect(page.getByTestId('reader-content')).toHaveCount(1);await expect(page.getByRole('heading',{name:'请选择右侧资料',exact:true})).toBeVisible();
    await page.goto(base+'/compare');await expect(page.getByLabel('左侧资料',{exact:true})).toHaveValue('');await expect(page.getByLabel('右侧资料',{exact:true})).toHaveValue('');await expect(page.getByTestId('reader-content')).toHaveCount(0);
    sample.resources.filter(r=>r.id!=='DEMO-TEXT').forEach(r=>r.access='metadata_only');await page.evaluate(d=>localStorage.setItem('literature-center:v1:data',JSON.stringify(d)),sample);
    await page.goto(base+'/resources/DEMO-TEXT/read');await page.reload();await page.getByRole('button',{name:'文献对照',exact:true}).click();await expect(dialog.getByRole('status')).toHaveText('暂无其他可读资料可供对照。');await expect(dialog.getByRole('button',{name:'开始对照',exact:true})).toBeDisabled();
  });
  await check('native mouse selection, no whole-paragraph fallback, save and exact return',async page=>{
    await expect(page.getByRole('button',{name:/选用第/})).toHaveCount(0);
    const p=page.locator('[data-text-paragraph]').first();await p.click();
    await expect(page.getByRole('button',{name:'记笔记',exact:true})).toHaveCount(0);
    await p.scrollIntoViewIfNeeded();
    const points=await p.evaluate(el=>{
      const node=el.firstChild;
      function point(offset){const r=document.createRange();r.setStart(node,offset);r.setEnd(node,offset+1);const box=r.getBoundingClientRect();return {x:box.x+1,y:box.y+box.height/2};}
      return {start:point(3),end:point(14)};
    });
    await page.mouse.move(points.start.x,points.start.y);await page.mouse.down();await page.mouse.move(points.end.x,points.end.y,{steps:12});await page.mouse.up();
    const selected=await page.evaluate(()=>getSelection().toString().trim());assert.ok(selected.length>4&&selected.length<paragraphs[0].text.length);
    await page.getByRole('button',{name:'记笔记',exact:true}).click();
    await expect(page.locator('.selected-source-quote')).toHaveText(selected);
    const a=await save(page,'鼠标选句验证');assert.equal(a.quote,selected);assert.ok(a.startOffset>0);
    await page.getByRole('link',{name:'打开笔记与来源 →',exact:true}).click();
    await page.locator('a[href*="anchorId="]').first().click();
    await expect(page.getByTestId('anchor-highlight')).toHaveText(selected);
    await page.reload();await expect(page.getByTestId('anchor-highlight')).toHaveText(selected);
  });
  await check('reverse selection across paragraphs preserves draft and precise source after reload',async page=>{
    const expected=paragraphs[0].text.slice(28)+'\n\n'+paragraphs[1].text.slice(0,22);
    await openNotes(page);await page.getByLabel('我的观察与解释',{exact:true}).fill('已写下的想法保留');
    await page.getByRole('button',{name:'来源',exact:true}).click();
    await selectText(page.getByTestId('reader-content'),0,28,1,22,true);
    await page.screenshot({path:'test-results/reader-refinement/selection-1440.png'});
    await page.getByRole('button',{name:'记笔记',exact:true}).click();
    await expect(page.locator('.selected-source-quote')).toHaveText(expected);
    await expect(page.getByLabel('我的观察与解释',{exact:true})).toHaveValue('已写下的想法保留');
    await page.reload();await expect(page.locator('.selected-source-quote')).toHaveText(expected);
    const a=await save(page,'跨段笔记验证');assert.equal(a.quote,expected);assert.equal(a.endParagraphId,'para-2');
    await page.goto(base+'/resources/DEMO-TEXT/read?anchorId='+a.id);
    await expect(page.getByTestId('anchor-highlight')).toHaveCount(2);
    assert.deepEqual(await page.getByTestId('anchor-highlight').allTextContents(),[paragraphs[0].text.slice(28),paragraphs[1].text.slice(0,22)]);
    await selectText(page.getByTestId('reader-content'),0,30,0,36);
    await page.getByRole('button',{name:'记笔记',exact:true}).click();
    await expect(page.locator('.selected-source-quote')).toHaveText(paragraphs[0].text.slice(30,36));
    await page.screenshot({path:'test-results/reader-refinement/note-1440.png'});
  });
  await check('duplicate phrases retain occurrence offsets; stale quote never highlights another place',async page=>{
    const sample=structuredClone(fixture),content=sample.contents.find(c=>c.resourceId==='DEMO-TEXT');
    content.paragraphs[0].text='第一句。相同内容。第二句。相同内容。结束。';
    await page.evaluate(d=>localStorage.setItem('literature-center:v1:data',JSON.stringify(d)),sample);await page.reload();
    const start=content.paragraphs[0].text.lastIndexOf('相同内容。');
    await selectText(page.getByTestId('reader-content'),0,start,0,start+5);
    await page.getByRole('button',{name:'记笔记',exact:true}).click();
    const a=await save(page,'重复文字位置');assert.equal(a.startOffset,start);
    await page.goto(base+'/resources/DEMO-TEXT/read?anchorId='+a.id);
    await expect(page.getByTestId('anchor-highlight')).toHaveText('相同内容。');
    assert.equal(await page.getByTestId('anchor-highlight').evaluate(el=>el.previousSibling.textContent),content.paragraphs[0].text.slice(0,start));
    await page.evaluate(()=>{const key='literature-center:v1:data',d=JSON.parse(localStorage.getItem(key));d.contents.find(c=>c.resourceId==='DEMO-TEXT').paragraphs[0].text='新增'+d.contents.find(c=>c.resourceId==='DEMO-TEXT').paragraphs[0].text;localStorage.setItem(key,JSON.stringify(d));});
    await page.reload();await expect(page.getByTestId('anchor-highlight')).toHaveCount(0);await expect(page.getByRole('alert')).toContainText('未定位');
  });
  await check('cancel and selection outside article never replace the note source',async page=>{
    await selectText(page.getByTestId('reader-content'),0,0,0,10);
    await page.getByRole('button',{name:'取消选择',exact:true}).click();
    await expect(page.locator('.selected-source-quote')).toHaveCount(0);
    await page.locator('.reader-heading h1').evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(r);});
    await expect(page.getByRole('button',{name:'记笔记',exact:true})).toHaveCount(0);
    await openNotes(page);await page.getByLabel('笔记标题',{exact:true}).fill('独立想法验证');await page.getByLabel('我的观察与解释',{exact:true}).fill('未选原文也能记录。');await page.getByRole('button',{name:'保存笔记',exact:true}).click();
    await expect(page.getByRole('link',{name:'打开笔记与来源 →',exact:true})).toBeVisible();
    const n=(await data(page)).notes.find(n=>n.title==='独立想法验证');assert.deepEqual(n.revisions[0].anchorIds,[]);
  });
  await check('keyboard extends native selection and note action can be activated by keyboard',async page=>{
    await selectText(page.getByTestId('reader-content'),0,5,0,10);
    await page.keyboard.press('Shift+ArrowRight');
    const selected=await page.evaluate(()=>getSelection().toString().trim());assert.equal(selected,paragraphs[0].text.slice(5,11));
    const action=page.getByRole('button',{name:'记笔记',exact:true});await action.focus();await page.keyboard.press('Enter');
    await expect(page.locator('.selected-source-quote')).toHaveText(selected);
  });
  await check('storage failure preserves selected quote and unsaved body',async page=>{
    await page.goto(base+'/resources/DEMO-TEXT/read?review=P08__save-error');
    await selectText(page.getByTestId('reader-content'),0,6,1,8);await page.getByRole('button',{name:'记笔记',exact:true}).click();
    await page.getByLabel('笔记标题',{exact:true}).fill('保存失败草稿');await page.getByLabel('我的观察与解释',{exact:true}).fill('不能丢失这些观察。');await page.getByRole('button',{name:'保存笔记',exact:true}).click();
    await expect(page.getByRole('link',{name:'打开笔记与来源 →',exact:true})).toHaveCount(0);
    await expect(page.getByLabel('我的观察与解释',{exact:true})).toHaveValue('不能丢失这些观察。');
    await expect(page.locator('.selected-source-quote')).toHaveText(paragraphs[0].text.slice(6)+'\n\n'+paragraphs[1].text.slice(0,8));
    await expect(page.getByTestId('note-editor').locator('.error')).toBeVisible();
  });
  await check('long-text scrolling, narrow layout and selection remain usable',async page=>{
    const sample=structuredClone(fixture),content=sample.contents.find(c=>c.resourceId==='DEMO-TEXT');
    content.paragraphs=Array.from({length:40},(_,i)=>({id:'long-'+i,text:`第${i+1}部分。`+paragraphs[0].text.repeat(4)}));
    await page.evaluate(d=>localStorage.setItem('literature-center:v1:data',JSON.stringify(d)),sample);await page.reload();
    await page.locator('[data-text-paragraph="long-25"]').scrollIntoViewIfNeeded();
    await selectText(page.getByTestId('reader-content'),25,7,25,34);await expect(page.getByRole('button',{name:'记笔记',exact:true})).toBeInViewport();
    await page.getByRole('button',{name:'记笔记',exact:true}).click();await expect(page.locator('.selected-source-quote')).toHaveText(content.paragraphs[25].text.slice(7,34));
    await page.screenshot({path:'test-results/reader-refinement/long-text.png'});
    await page.setViewportSize({width:390,height:844});await page.goto(base+'/resources/DEMO-TEXT/read');
    await page.locator('[data-text-paragraph="long-0"]').scrollIntoViewIfNeeded();
    await selectText(page.getByTestId('reader-content'),0,6,0,22);await page.getByRole('button',{name:'记笔记',exact:true}).click();
    await expect(page.locator('.selected-source-quote')).toHaveText(content.paragraphs[0].text.slice(6,22));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.getByLabel('笔记标题',{exact:true}).scrollIntoViewIfNeeded();await expect(page.getByLabel('笔记标题',{exact:true})).toBeInViewport();await page.screenshot({path:'test-results/reader-refinement/note-390.png'});
  });
  assert.deepEqual(errors,[]);
}finally{
  await browser.close();await fs.writeFile('test-results/reader-refinement/results.json',JSON.stringify({results,errors},null,2));
}
if(results.some(r=>r.result==='fail'))process.exitCode=1;
