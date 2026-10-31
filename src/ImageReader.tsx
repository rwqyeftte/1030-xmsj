import {useEffect,useId,useRef,useState} from 'react';
import type {PointerEvent,KeyboardEvent} from 'react';
import type {DemoContent} from '../contracts/domain';
import {boxBetween,clamp,moveBox,resizeBox,validImageBox} from './image-annotations';
import type {ImageAnchor,ImageBox,Point} from './image-annotations';
export type ImageContent=Extract<DemoContent,{kind:'image'}>;

// Render the existing source itself, also reused by cropped previews; never paint notes into it.
export function ImageArtwork({content,blobUrl}:{content:ImageContent;blobUrl?:string}){
  return <g aria-hidden="true"><rect width={content.width} height={content.height} fill="#fff"/>{blobUrl?<image href={blobUrl} width={content.width} height={content.height}/>:<><text x="80" y="65" fontSize="24">{content.label}</text>{content.shapes.map((s,i)=><g key={i}><rect {...s} fill="#ededed" stroke="#888" strokeWidth="2"/><text x={s.x+15} y={s.y+40} fontSize="23">{s.label}</text></g>)}</>}</g>;
}
export function ImageCrop({content,blobUrl,box}:{content:ImageContent;blobUrl?:string;box:ImageBox}){
  const clip=useId(),x=box.x*content.width,y=box.y*content.height,width=box.width*content.width,height=box.height*content.height;
  return <svg className="image-note-crop" role="img" aria-label="笔记对应的图片区域" viewBox={`${x} ${y} ${width} ${height}`}><defs><clipPath id={clip}><rect x={x} y={y} width={width} height={height}/></clipPath></defs><g clipPath={`url(#${clip})`}><ImageArtwork content={content} blobUrl={blobUrl}/></g></svg>;
}
type Gesture={start:Point;box:ImageBox|null;kind:'draw'|'move'|string;pointerId:number};
export default function ImageReader({content,blobUrl,anchor,annotations,onSelect,onLocate,comparison=false}:{content:ImageContent;blobUrl?:string;anchor:ImageAnchor|null;annotations:{anchor:ImageAnchor;title:string}[];onSelect:(b:ImageBox)=>void;onLocate:(a:ImageAnchor)=>void;comparison?:boolean}){
  const viewport=useRef<HTMLDivElement>(null),canvas=useRef<SVGSVGElement>(null),gesture=useRef<Gesture|null>(null);
  const [size,setSize]=useState({width:500,height:500}),[zoom,setZoom]=useState<number|'fit'>('fit');
  const [drawing,setDrawing]=useState(false),[pending,setPending]=useState<ImageBox|null>(null),[corner,setCorner]=useState<Point|null>(null),[message,setMessage]=useState('');
  const saved=!!anchor&&annotations.some(a=>a.anchor.id===anchor.id);
  const shown=pending||anchor;
  useEffect(()=>{const el=viewport.current;if(!el)return;const observer=new ResizeObserver(()=>setSize({width:el.clientWidth,height:el.clientHeight}));observer.observe(el);return()=>observer.disconnect();},[]);
  useEffect(()=>{setPending(null);setCorner(null);setDrawing(false);setMessage(anchor?(comparison?'已选为对照来源':saved?'已定位笔记区域':'已选中区域，可以填写笔记'):'');},[anchor?.id,saved]);
  const fit=Math.min((size.width-32)/content.width,(size.height-32)/content.height);
  const scale=zoom==='fit'?Math.max(.05,fit):zoom/100;
  function reveal(b:ImageBox){
    const view=viewport.current,image=canvas.current;if(!view||!image)return;
    const v=view.getBoundingClientRect(),r=image.getBoundingClientRect();
    view.scrollTo({left:view.scrollLeft+r.left-v.left+(b.x+b.width/2)*r.width-view.clientWidth/2,top:view.scrollTop+r.top-v.top+(b.y+b.height/2)*r.height-view.clientHeight/2});
  }
  function locate(a:ImageAnchor){onLocate(a);reveal(a);}
  useEffect(()=>{if(saved&&anchor)reveal(anchor);},[anchor,saved]);
  const point=(e:PointerEvent<SVGSVGElement>)=>{const rect=e.currentTarget.getBoundingClientRect();return {x:clamp((e.clientX-rect.left)/rect.width),y:clamp((e.clientY-rect.top)/rect.height)};};
  const cancel=()=>{gesture.current=null;setPending(null);setCorner(null);setDrawing(false);setMessage('已取消框选');};
  function choose(b:ImageBox){if(!validImageBox(b))return;setPending(null);setCorner(null);setDrawing(false);setMessage(comparison?'已选为对照来源':'已选中区域，可以填写笔记');onSelect({x:b.x,y:b.y,width:b.width,height:b.height});}
  function down(e:PointerEvent<SVGSVGElement>){
    if(e.button!==0||!e.isPrimary)return;
    const kind=drawing?'draw':(e.target as Element).getAttribute('data-handle');
    if(!kind||(!drawing&&saved))return;
    e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current={start:point(e),box:anchor,kind,pointerId:e.pointerId};
  }
  function update(e:PointerEvent<SVGSVGElement>){
    const g=gesture.current;if(!g||g.pointerId!==e.pointerId)return;
    const p=point(e);setPending(g.kind==='draw'?boxBetween(corner||g.start,p):g.kind==='move'&&g.box?moveBox(g.box,p.x-g.start.x,p.y-g.start.y):g.box?resizeBox(g.box,g.kind,p):null);
  }
  function up(e:PointerEvent<SVGSVGElement>){
    const g=gesture.current;if(!g||g.pointerId!==e.pointerId)return;
    const p=point(e);gesture.current=null;e.currentTarget.releasePointerCapture(e.pointerId);
    if(g.kind==='draw'){
      const b=boxBetween(corner||g.start,p);
      if(!corner&&Math.hypot((p.x-g.start.x)*content.width*scale,(p.y-g.start.y)*content.height*scale)<6){setCorner(g.start);setPending(null);setMessage('再点击另一个角，或拖动重新框选');return;}
      if(b.width*content.width*scale<6||b.height*content.height*scale<6){setPending(null);setMessage('选区太小，请重新框选');return;}
      choose(b);
    }else if(g.box)choose(g.kind==='move'?moveBox(g.box,p.x-g.start.x,p.y-g.start.y):resizeBox(g.box,g.kind,p));
  }
  function keyboard(e:KeyboardEvent<SVGRectElement>){
    if(e.key==='Escape'){cancel();return;}
    if(!anchor||saved||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
    e.preventDefault();const dx=e.key==='ArrowLeft'?-.01:e.key==='ArrowRight'?.01:0,dy=e.key==='ArrowUp'?-.01:e.key==='ArrowDown'?.01:0;
    choose(e.shiftKey?{...anchor,width:clamp(anchor.width+dx,Math.min(.01,anchor.width),1-anchor.x),height:clamp(anchor.height+dy,Math.min(.01,anchor.height),1-anchor.y)}:moveBox(anchor,dx,dy));
  }
  return <div className="image-annotation-reader" onKeyDown={e=>{if(e.key==='Escape')cancel();}}>
    <div className="image-note-toolbar" aria-label="图片批注工具">
      <div className="row"><button className={drawing?'active':'primary'} aria-pressed={drawing} onClick={()=>{setDrawing(true);setCorner(null);setPending(null);setMessage('拖动框选，或依次点击区域的两个角');}}>{comparison?'框选对照区域':'框选记笔记'}</button><button onClick={()=>choose({x:0,y:0,width:1,height:1})}>{comparison?'选择整图':'整图记笔记'}</button>{drawing&&<button onClick={cancel}>取消框选</button>}</div>
      <div className="row image-zoom"><button aria-label="缩小图片" disabled={zoom!== 'fit'&&zoom<=25} onClick={()=>setZoom(Math.max(25,Math.round((zoom==='fit'?fit*100:zoom)-25)))}>−</button><span aria-live="polite">{zoom==='fit'?'适合窗口':zoom+'%'}</span><button aria-label="放大图片" disabled={zoom!=='fit'&&zoom>=300} onClick={()=>setZoom(Math.min(300,Math.round((zoom==='fit'?fit*100:zoom)+25)))}>＋</button><button onClick={()=>setZoom('fit')}>适合窗口</button></div>
    </div>
    <div className="image-reading-hint"><span role="status">{message||(comparison?'框选区域，或选择整张图片作为对照来源。':'框选局部，或为整张图片添加笔记。')}</span><details><summary>操作帮助</summary><p>选择“{comparison?'框选对照区域':'框选记笔记'}”后拖动鼠标，或依次点击区域的两个角。选框可拖动移动，四角可调整大小；Esc 取消本次框选。</p><button data-keyboard-selection onClick={()=>{choose({x:.25,y:.25,width:.5,height:.5});requestAnimationFrame(()=>canvas.current?.querySelector<SVGElement>('[data-handle="move"]')?.focus());}}>键盘添加选框</button><p>选框获得焦点后，用方向键移动，Shift＋方向键调整大小。</p></details></div>
    <div className="image-canvas-viewport" ref={viewport}>
      <div className="image-canvas-space"><svg ref={canvas} className={drawing?'image-note-canvas drawing':'image-note-canvas'} data-testid="image-note-canvas" role="group" aria-label="图片批注画布" viewBox={`0 0 ${content.width} ${content.height}`} style={{width:content.width*scale,height:content.height*scale,touchAction:drawing?'none':'auto'}} onPointerDown={down} onPointerMove={update} onPointerUp={up} onPointerCancel={cancel}>
        <ImageArtwork content={content} blobUrl={blobUrl}/>
        {annotations.map((item,i)=>{
          if(annotations.findIndex(other=>other.anchor.id===item.anchor.id)!==i)return null;
          const numbers=annotations.flatMap((other,j)=>other.anchor.id===item.anchor.id?[j+1]:[]).join(',');
          const badgeWidth=Math.max(24,numbers.length*8+12);
          return <g key={item.anchor.id} role="button" tabIndex={0} aria-label={comparison?`选择已有区域 ${numbers} 作为对照来源`:`查看图片笔记 ${numbers}：${item.title}`} onClick={()=>{if(!drawing)locate(item.anchor);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();locate(item.anchor);}}} className="saved-image-annotation"><rect x={item.anchor.x*content.width} y={item.anchor.y*content.height} width={item.anchor.width*content.width} height={item.anchor.height*content.height} fill="transparent" stroke="#888" strokeWidth={1.5/scale}/><rect x={item.anchor.x*content.width} y={item.anchor.y*content.height} width={badgeWidth/scale} height={24/scale} fill="#333"/><text x={item.anchor.x*content.width+badgeWidth/2/scale} y={item.anchor.y*content.height+17/scale} fontSize={13/scale} textAnchor="middle" fill="#fff">{numbers}</text></g>;
        })}
        {shown&&validImageBox(shown)&&<g className="current-image-annotation"><rect data-testid="anchor-highlight" data-handle="move" role={saved?"presentation":"button"} tabIndex={saved?-1:0} pointerEvents={saved?"none":undefined} aria-label={saved?undefined:'已选图片区域，方向键移动，Shift 加方向键调整大小'} onKeyDown={keyboard} onClick={()=>{if(saved&&anchor)onLocate(anchor);}} x={shown.x*content.width} y={shown.y*content.height} width={shown.width*content.width} height={shown.height*content.height} fill="#444" fillOpacity=".08" stroke="#222" strokeWidth={2/scale} style={{cursor:drawing?'crosshair':saved?'pointer':'move',touchAction:'none'}}/>{!saved&&!drawing&&(['nw','ne','sw','se'] as const).map(k=><rect key={k} data-handle={k} x={(shown.x+(k.includes('e')?shown.width:0))*content.width-5/scale} y={(shown.y+(k.includes('s')?shown.height:0))*content.height-5/scale} width={10/scale} height={10/scale} fill="#fff" stroke="#222" strokeWidth={1/scale} style={{cursor:k+'-resize',touchAction:'none'}}/>)}</g>}
        {corner&&<circle cx={corner.x*content.width} cy={corner.y*content.height} r={4/scale} fill="#222" pointerEvents="none"/>}
      </svg></div>
    </div>
  </div>;
}
