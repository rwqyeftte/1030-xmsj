import test from 'node:test';
import assert from 'node:assert/strict';
import {browserHref,routeLocation} from '../src/routing';

test('Pages route keeps query and context within hash, including encoded Chinese',()=>{
  const route='/search/results?q=%E4%BF%9D%E6%B8%A9%E7%93%B6&targetProjectId=project-empty&ctx=ctx-1';
  const href=browserHref(route,true,'/1030-xmsj/');
  assert.equal(href,'/1030-xmsj/#'+route);
  const parsed=routeLocation(new URL(href,'https://rwqyeftte.github.io'),true);
  assert.equal(parsed.pathname+parsed.search,route);
  assert.equal(new URLSearchParams(parsed.search).get('q'),'保温瓶');
});

test('Pages bare root resolves to homepage; local paths remain unchanged',()=>{
  assert.deepEqual(routeLocation(new URL('https://rwqyeftte.github.io/1030-xmsj/'),true),{pathname:'/',search:''});
  const local=new URL('http://127.0.0.1:5173/resources/DEMO-TEXT/read?anchorId=a1');
  assert.deepEqual(routeLocation(local,false),{pathname:'/resources/DEMO-TEXT/read',search:'?anchorId=a1'});
  assert.equal(browserHref('/search?q=x',false),'/search?q=x');
});

test('URL conversion leaves download and external destinations intact',()=>{
  for(const value of ['blob:https://example.com/id','https://example.com/path','mailto:test@example.com','//example.com'])assert.equal(browserHref(value,true,'/1030-xmsj/'),value);
});
