export type Viewport = {x:number;y:number;zoom:number};
export type BoardRect = {x:number;y:number;width:number;height:number};
export function boardBounds(rects:BoardRect[],padding=0):BoardRect|null {
  if(!rects.length)return null;
  const x=Math.min(...rects.map(r=>r.x))-padding,y=Math.min(...rects.map(r=>r.y))-padding;
  return {x,y,width:Math.max(...rects.map(r=>r.x+r.width))+padding-x,height:Math.max(...rects.map(r=>r.y+r.height))+padding-y};
}
export function fitBoard(rects:BoardRect[],width:number,height:number):Viewport {
  const b=boardBounds(rects,48);if(!b)return {x:0,y:0,zoom:1};
  const zoom=Math.min(1,Math.max(.1,Math.min(Math.max(1,width)/b.width,Math.max(1,height)/b.height)));
  return {x:(width-b.width*zoom)/2-b.x*zoom,y:(height-b.height*zoom)/2-b.y*zoom,zoom};
}
export function centerNode(node:BoardRect,width:number,height:number,zoom:number):Viewport {
  return {x:width/2-(node.x+node.width/2)*zoom,y:height/2-(node.y+node.height/2)*zoom,zoom};
}
export function zoomBoard(view:Viewport,zoom:number,width:number,height:number):Viewport {
  const z=Math.max(.1,Math.min(1.6,zoom));
  return {x:width/2-(width/2-view.x)*z/view.zoom,y:height/2-(height/2-view.y)*z/view.zoom,zoom:z};
}
export function gestureKind(button:number,hand:boolean,space:boolean,node:boolean,readonly:boolean){
  if(button===1||(button===0&&(hand||space)))return 'pan';
  return button===0&&node&&!readonly?'node':null;
}
export function freeCardPosition(nodes:BoardRect[],width=260,height=180){
  // Keep existing placements and find an unoccupied spot for the new card.
  for(let row=0;row<=nodes.length;row++)for(let col=0;col<3;col++){
    const x=60+col*330,y=60+row*240;
    if(nodes.every(n=>x+width+20<=n.x||x>=n.x+n.width+20||y+height+20<=n.y||y>=n.y+n.height+20))return {x,y};
  }
  return {x:60,y:Math.max(0,...nodes.map(n=>n.y+n.height))+60};
}
