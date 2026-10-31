import type {AppData} from '../contracts/domain';
import seed from '../contracts/fixtures.json';

// Append to the unchanged three-paragraph demo, preserving every existing quote,
// paragraph ID and offset. User content, notes and source versions are untouched.
export function upgradeDemoReadingExample(data:AppData):AppData {
  const example=seed.contents.find(c=>c.resourceId==='DEMO-TEXT')!;
  const resource=data.resources.find(r=>r.id===example.resourceId);
  const content=data.contents.find(c=>c.id===example.id);
  if(!resource?.isDemo||resource.versionId!==example.versionId||resource.contentId!==example.id
    ||resource.access!=='demo_readable'||content?.kind!=='text'||content.resourceId!==resource.id
    ||content.versionId!==example.versionId||content.paragraphs.length!==3
    ||!content.paragraphs.every((p,i)=>p.id===example.paragraphs![i].id&&p.text===example.paragraphs![i].text))return data;
  const next=structuredClone(data);
  const nextContent=next.contents.find(c=>c.id===content.id)!;
  if(nextContent.kind==='text')nextContent.paragraphs.push(...structuredClone(example.paragraphs!.slice(3)));
  return next;
}
