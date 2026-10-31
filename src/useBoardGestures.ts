import {useEffect,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import type {BoardNode} from '../contracts/domain';
import {gestureKind,type Viewport} from './board-geometry';

type Gesture={kind:'pan'|'node';pointerId:number;startX:number;startY:number;view:Viewport;node?:BoardNode;moved:boolean;shift:boolean};
export function useBoardGestures(nodes:BoardNode[],viewport:Viewport,readonly:boolean,saveViewport:(v:Viewport)=>void,moveNode:(id:string,x:number,y:number)=>void,selectNode:(id:string,shift:boolean)=>void){
  const canvasRef=useRef<HTMLDivElement>(null),gesture=useRef<Gesture|null>(null),suppressClick=useRef(false);
  const [hand,setHand]=useState(false),[space,setSpace]=useState(false),[panning,setPanning]=useState(false);
  const [preview,setPreview]=useState<Viewport|null>(null),[moving,setMoving]=useState<{id:string;x:number;y:number}|null>(null);
  function cancel(){gesture.current=null;setPreview(null);setMoving(null);setPanning(false);}
  useEffect(()=>{
    const down=(e:KeyboardEvent)=>{const el=e.target as HTMLElement;if(e.code==='Space'&&!el.closest('input,textarea,select,button,a,[contenteditable=true]')&&(canvasRef.current?.contains(el)||el===document.body)){e.preventDefault();setSpace(true);}};
    const up=(e:KeyboardEvent)=>{if(e.code==='Space')setSpace(false)};
    const blur=()=>{setSpace(false);cancel();};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur)};
  },[]);
  function position(e:ReactPointerEvent<HTMLDivElement>,g:Gesture){
    const dx=e.clientX-g.startX,dy=e.clientY-g.startY;
    if(Math.hypot(dx,dy)>4)g.moved=true;
    return {view:{...g.view,x:g.view.x+dx,y:g.view.y+dy},node:g.node?{id:g.node.id,x:Math.max(0,g.node.x+dx/g.view.zoom),y:Math.max(0,g.node.y+dy/g.view.zoom)}:null};
  }
  return {canvasRef,hand,setHand,moving,displayViewport:preview||viewport,panning,panReady:hand||space,
    canvasProps:{
      onPointerDownCapture:(e:ReactPointerEvent<HTMLDivElement>)=>{
        if(gesture.current)return;suppressClick.current=false;
        const el=e.target as HTMLElement,nodeElement=el.closest<HTMLElement>('[data-node-id]'),node=nodes.find(n=>n.id===nodeElement?.dataset.nodeId);
        const kind=gestureKind(e.button,hand,space,!!node,readonly);
        if(!kind||(kind==='node'&&el.closest('button,a,input,textarea,select')))return;
        e.preventDefault();e.stopPropagation();(kind==='node'&&nodeElement?nodeElement:e.currentTarget).focus({preventScroll:true});
        gesture.current={kind,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,view:viewport,node,moved:false,shift:e.shiftKey};
        setPanning(kind==='pan');if(kind==='pan')e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove:(e:ReactPointerEvent<HTMLDivElement>)=>{const g=gesture.current;if(!g||g.pointerId!==e.pointerId)return;const p=position(e,g);if(g.moved){e.currentTarget.setPointerCapture(e.pointerId);suppressClick.current=true;if(g.kind==='pan')setPreview(p.view);else setMoving(p.node);}},
      onPointerUp:(e:ReactPointerEvent<HTMLDivElement>)=>{const g=gesture.current;if(!g||g.pointerId!==e.pointerId)return;const p=position(e,g);suppressClick.current=true;if(g.moved){if(g.kind==='pan')saveViewport(p.view);else if(p.node)moveNode(p.node.id,p.node.x,p.node.y);}else if(g.kind==='node'&&g.node)selectNode(g.node.id,g.shift);cancel();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);},
      onPointerCancel:cancel,onLostPointerCapture:cancel,
      onClickCapture:(e:React.MouseEvent)=>{if(suppressClick.current){e.preventDefault();e.stopPropagation();}},
      onAuxClick:(e:React.MouseEvent)=>{if(e.button===1)e.preventDefault();},
      onMouseDown:(e:React.MouseEvent)=>{if(e.button===1)e.preventDefault();}
    }
  };
}
