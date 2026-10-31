import test from 'node:test';
import assert from 'node:assert/strict';
import {boardBounds,fitBoard,centerNode,zoomBoard,gestureKind,freeCardPosition} from '../src/board-geometry';
test('适应画布包含所有分散卡片，兼容负坐标与空画布',()=>{
  const cards=[{x:-200,y:40,width:260,height:220},{x:2400,y:1800,width:320,height:260}];
  const view=fitBoard(cards,900,520);
  for(const n of cards){assert.ok(n.x*view.zoom+view.x>=0);assert.ok(n.y*view.zoom+view.y>=0);assert.ok((n.x+n.width)*view.zoom+view.x<=900);assert.ok((n.y+n.height)*view.zoom+view.y<=520);}
  assert.deepEqual(fitBoard([],900,520),{x:0,y:0,zoom:1});
  assert.deepEqual(boardBounds([],20),null);
});
test('定位让卡片居中，缩放保留当前画布中心位置',()=>{
  const n={x:1400,y:800,width:260,height:180},v=centerNode(n,800,600,.8);
  assert.equal((n.x+n.width/2)*v.zoom+v.x,400);assert.equal((n.y+n.height/2)*v.zoom+v.y,300);
  const z=zoomBoard(v,1.2,800,600);
  assert.ok(Math.abs((400-v.x)/v.zoom-(400-z.x)/z.zoom)<1e-9);
  assert.ok(Math.abs((300-v.y)/v.zoom-(300-z.y)/z.zoom)<1e-9);
});
test('中键优先平移，归档允许浏览且不能拖动卡片，右键不操作',()=>{
  for(const readonly of [false,true]){assert.equal(gestureKind(1,false,false,true,readonly),'pan');assert.equal(gestureKind(0,true,false,true,readonly),'pan');assert.equal(gestureKind(0,false,true,false,readonly),'pan');assert.equal(gestureKind(2,true,true,true,readonly),null);}
  assert.equal(gestureKind(0,false,false,true,false),'node');assert.equal(gestureKind(0,false,false,true,true),null);assert.equal(gestureKind(0,false,false,false,false),null);
});
test('新增卡片不会覆盖已有材料或研究问题',()=>{
  const nodes=[{x:60,y:60,width:260,height:180},{x:390,y:60,width:260,height:180},{x:60,y:300,width:260,height:190},{x:390,y:300,width:260,height:160}];
  const before=structuredClone(nodes);
  for(let i=0;i<12;i++){const p=freeCardPosition(nodes);assert.ok(nodes.every(n=>p.x+280<=n.x||p.x>=n.x+n.width+20||p.y+200<=n.y||p.y>=n.y+n.height+20));nodes.push({...p,width:260,height:180});}
  assert.deepEqual(nodes.slice(0,4),before);
});
