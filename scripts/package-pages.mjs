import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const target=path.join(root,'release','1030-xmsj-'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z'));
const files=['index.html','package.json','package-lock.json','tsconfig.json','vite.config.ts','.github/workflows/deploy-pages.yml','contracts/domain.ts','contracts/fixtures.json','contracts/open-collection.json','contracts/topics.json','contracts/featured-books.json','contracts/course-articles.json','contracts/paper-texts.json','contracts/pdf-passages.json','contracts/featured-images.json','contracts/featured-videos.json','contracts/new-arrivals-images.json','contracts/new-arrivals-videos.json','contracts/routes.json','contracts/review_cases.json','docs/GITHUB_PAGES.md','docs/HOME_REFINEMENT.md','docs/BOARD_REFINEMENT.md','docs/BOARD_SUMMARY.md','scripts/package-pages.mjs','scripts/reader-api.mjs','scripts/serve-reader.mjs','scripts/deepseek-transport.mjs','tests/reader-ai.mjs','scripts/make-video-example.py','tests/pages-browser.mjs','tests/flow.mjs','tests/reader-selection.mjs','tests/text-selection.mjs'];
async function enumerate(dir){for(const entry of await fs.readdir(path.join(root,dir),{withFileTypes:true})){const p=dir+'/'+entry.name;if(entry.isSymbolicLink())throw Error('Symlink excluded: '+p);if(entry.isDirectory())await enumerate(p);else files.push(p);}}
files.push('.gitattributes','tests/reading-board.mjs');
await enumerate('src');
for(const file of await fs.readdir(path.join(root,'tests')))if(file.endsWith('.test.ts'))files.push('tests/'+file);
await fs.mkdir(target,{recursive:true});
const manifest=[];
async function write(name,body){await fs.mkdir(path.dirname(path.join(target,name)),{recursive:true});await fs.writeFile(path.join(target,name),body);manifest.push({path:name,bytes:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex')});}
for(const file of files){let body=await fs.readFile(path.join(root,file));if(file==='index.html')body=Buffer.from(body.toString().replace(/<script>if\(location\.hash\.includes\("figmacapture="\)\)[\s\S]*?<\/script>/,''));if(file==='package.json'){const config=JSON.parse(body.toString());config.scripts['test:browser']='node tests/pages-browser.mjs';body=Buffer.from(JSON.stringify(config,null,2)+'\n');}await write(file,body);}
await write('README.md',await fs.readFile(path.join(root,'README.md')));
await write('.gitignore',await fs.readFile(path.join(root,'.gitignore')));
await fs.writeFile(path.join(target,'PUBLISH_MANIFEST.json'),JSON.stringify({repository:'rwqyeftte/1030-xmsj',createdAt:new Date().toISOString(),status:'LOCAL_PREPARATION_NOT_PUBLISHED',files:manifest},null,2)+'\n');
console.log(target);
console.log(`${manifest.length} files + manifest; no git or network operations performed.`);
