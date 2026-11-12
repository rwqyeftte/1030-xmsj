import type {BoardRect} from './board-geometry';

interface Props {
  from:BoardRect;
  to:BoardRect;
  label:string;
  actionLabel:string;
  dotted:boolean;
  selected:boolean;
  disabled:boolean;
  onOpen:()=>void;
  onMenu:(x:number,y:number)=>void;
}

export default function BoardConnection({from,to,label,actionLabel,dotted,selected,disabled,onOpen,onMenu}:Props) {
  const dx=to.x+to.width/2-(from.x+from.width/2);
  const dy=to.y+to.height/2-(from.y+from.height/2);
  // Connect the facing edges of the two cards, including when they are stacked vertically.
  const horizontal=Math.abs(dx)-(from.width+to.width)/2>=Math.abs(dy)-(from.height+to.height)/2;
  const sx=from.x+(horizontal?(dx>=0?from.width:0):from.width/2);
  const sy=from.y+(horizontal?from.height/2:(dy>=0?from.height:0));
  const tx=to.x+(horizontal?(dx>=0?0:to.width):to.width/2);
  const ty=to.y+(horizontal?to.height/2:(dy>=0?0:to.height));
  const mx=(sx+tx)/2,my=(sy+ty)/2;
  const curve=horizontal?`M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`
    :`M ${sx} ${sy} C ${sx} ${my}, ${tx} ${my}, ${tx} ${ty}`;
  const gap=Math.abs(tx-sx);
  const close=horizontal&&gap<label.length*12+32;
  const visibleLabel=close&&label==='待验证联系'?'待验证':label;
  const width=visibleLabel.length*12+12;
  const drawLabel=(!horizontal||gap>width+2)&&Math.hypot(tx-sx,ty-sy)>24;
  const lift=horizontal&&Math.abs(ty-sy)<24?-14:0;
  return <g className="edge-action board-connection" data-selected={selected||undefined}
    role="button" tabIndex={disabled?-1:0} aria-label={actionLabel} aria-disabled={disabled}
    onClick={()=>{if(!disabled)onOpen();}}
    onContextMenu={e=>{e.preventDefault();onMenu(e.clientX,e.clientY);}}
    onKeyDown={e=>{if(!disabled&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onOpen();}}}>
    <title>{actionLabel}</title>
    <path className="edge-hit-area" d={curve}/>
    <path className="edge-curve" d={curve} strokeDasharray={dotted?'5 4':undefined}/>
    {drawLabel&&<g transform={`translate(${mx} ${my+lift})`}>
      <rect x={-width/2} y="-10" width={width} height="20" rx="5"/>
      <text y="1" textAnchor="middle" dominantBaseline="middle">{visibleLabel}</text>
    </g>}
  </g>;
}
