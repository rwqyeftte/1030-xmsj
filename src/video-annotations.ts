import type {AppData,DemoContent,Resource,SourceAnchor} from '../contracts/domain';

export type VideoAnchor=Extract<SourceAnchor,{kind:'video'}>;
export function videoTime(seconds:number){
  const t=Math.max(0,Math.floor(Number.isFinite(seconds)?seconds:0));
  return (t>=3600?Math.floor(t/3600)+':':'')+String(Math.floor(t/60)%60).padStart(2,'0')+':'+String(t%60).padStart(2,'0');
}
export function videoAnchorLabel(a:VideoAnchor){return a.point?videoTime(a.startSec):videoTime(a.startSec)+'–'+videoTime(a.endSec);}
export function validVideoAnchor(a:VideoAnchor,duration:number){
  return [a.startSec,a.endSec,duration].every(Number.isFinite)&&duration>0&&a.startSec>=0&&a.endSec<=duration
    &&(a.point===true?a.startSec===a.endSec:a.startSec<a.endSec);
}
// Only the supplied demonstration has an authored, bundled video. Never substitute it for another source.
export function hasDemoVideo(r:Resource|undefined,c:DemoContent|undefined){
  return !!r&&r.id==='DEMO-VIDEO'&&r.isDemo&&r.access==='demo_readable'&&r.contentId==='content-DEMO-VIDEO'
    &&r.versionId==='DEMO-VIDEO-v1'&&c?.id===r.contentId&&c.resourceId===r.id&&c.versionId===r.versionId
    &&c.kind==='video_timeline'&&c.durationSec===20;
}
export function videoNotes(data:AppData,resourceId:string){
  const resource=data.resources.find(r=>r.id===resourceId),content=data.contents.find(c=>c.id===resource?.contentId);
  if(content?.kind!=='video_timeline'||content.resourceId!==resourceId||content.versionId!==resource?.versionId)return [];
  return data.notes.filter(n=>n.ownerId===data.session.userId).flatMap(note=>{
    const revision=note.revisions.find(r=>r.revision===note.currentRevision);
    const anchor=revision?.anchorIds.map(id=>data.anchors.find(a=>a.id===id)).find((a):a is VideoAnchor=>a?.kind==='video'&&a.resourceId===resourceId&&a.resourceVersionId===resource?.versionId&&validVideoAnchor(a,content.durationSec));
    return anchor&&revision?[{note,revision,anchor}]:[];
  }).sort((a,b)=>a.anchor.startSec-b.anchor.startSec||a.revision.createdAt.localeCompare(b.revision.createdAt));
}
