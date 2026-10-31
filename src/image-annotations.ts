import type {AppData,SourceAnchor} from '../contracts/domain';
export type ImageAnchor=Extract<SourceAnchor,{kind:'image'}>;
export type ImageBox=Pick<ImageAnchor,'x'|'y'|'width'|'height'>;
export type Point={x:number;y:number};
export const clamp=(n:number,min=0,max=1)=>Math.max(min,Math.min(max,n));
export function validImageBox(b:ImageBox){return [b.x,b.y,b.width,b.height].every(Number.isFinite)&&b.x>=0&&b.y>=0&&b.width>0&&b.height>0&&b.x+b.width<=1.000001&&b.y+b.height<=1.000001;}
export function boxBetween(a:Point,b:Point):ImageBox{return {x:Math.min(clamp(a.x),clamp(b.x)),y:Math.min(clamp(a.y),clamp(b.y)),width:Math.abs(clamp(a.x)-clamp(b.x)),height:Math.abs(clamp(a.y)-clamp(b.y))};}
export function moveBox(b:ImageBox,dx:number,dy:number):ImageBox{return {...b,x:clamp(b.x+dx,0,1-b.width),y:clamp(b.y+dy,0,1-b.height)};}
export function resizeBox(b:ImageBox,corner:string,p:Point):ImageBox{
  const minW=Math.min(.01,b.width),minH=Math.min(.01,b.height);
  const x=corner.includes('w')?clamp(p.x,0,b.x+b.width-minW):b.x;
  const y=corner.includes('n')?clamp(p.y,0,b.y+b.height-minH):b.y;
  return {x,y,width:corner.includes('w')?b.x+b.width-x:clamp(p.x,b.x+minW,1)-b.x,height:corner.includes('n')?b.y+b.height-y:clamp(p.y,b.y+minH,1)-b.y};
}
export function imageNotes(data:AppData,resourceId:string){
  const resource=data.resources.find(r=>r.id===resourceId);
  return data.notes.filter(n=>n.ownerId===data.session.userId).flatMap(note=>{
    const revision=note.revisions.find(r=>r.revision===note.currentRevision);
    const anchor=revision?.anchorIds.map(id=>data.anchors.find(a=>a.id===id)).find((a):a is ImageAnchor=>a?.kind==='image'&&a.resourceId===resourceId&&a.resourceVersionId===resource?.versionId&&validImageBox(a));
    return anchor&&revision?[{note,revision,anchor}]:[];
  });
}
