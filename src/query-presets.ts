import type {AppData} from '../contracts/domain';
import seed from '../contracts/fixtures.json';

// Upgrade only the unchanged original example. Other saved strategies and user data stay intact.
export function upgradeDemoSearchExample(data:AppData):AppData {
  const version=data.demoSearchExampleVersion||0;
  if(version>=2)return data;
  const next=structuredClone(data);
  next.demoSearchExampleVersion=2;
  const query=next.savedQueries.find(q=>q.id==='query-demo-01');
  if(version<1&&query&&query.ownerId==='demo-user'&&query.scope==='public'&&query.q==='保温瓶'
    &&query.mode==='standard'&&query.targetProjectId==='project-demo-01'&&query.rules.length===0&&!('name' in query)) {
    query.rules=structuredClone(seed.savedQueries[0].rules) as typeof query.rules;
  }
  if(query&&query.ownerId==='demo-user'&&query.targetProjectId==='project-demo-01') {
    query.targetProjectId=null;
  }
  return next;
}
