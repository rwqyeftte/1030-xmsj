import test from 'node:test';
import assert from 'node:assert/strict';
import storedCatalogue from '../contracts/fixtures.json';
import type {AppData, Resource} from '../contracts/domain';
import {withCourseFiles} from '../src/featured';
import {recommendationCatalog} from '../src/recommendations';
import {searchCatalog} from '../src/search';

const library=()=>withCourseFiles(structuredClone(storedCatalogue) as AppData);
const ids=(records:Resource[])=>records.map(r=>r.id);

test('最新馆藏与检索的可读课程资料一致，精选是其中独立的一组',()=>{
  const data=library();
  const arrivals=recommendationCatalog(data,{tab:'new'});
  const search=searchCatalog(data,new URLSearchParams('source=center_preview&access=file_available&sort=new'));
  assert.deepEqual(ids(arrivals.results),ids(search.results));
  assert.equal(arrivals.total,29);
  assert.deepEqual(arrivals.typeCounts,{image:18,book:4,paper:4,video:3});
  const papers=recommendationCatalog(data,{tab:'featured',type:'paper'});
  assert.equal(papers.total,14);
  assert.deepEqual(papers.typeCounts,{book:4,paper:4,image:4,video:2});
  assert.deepEqual(ids(papers.results),['A01','A02','A03','A04']);
});

test('兴趣只读取勾选的主题和明确指定的本人项目标题及问题',()=>{
  const data=library();
  const preferences={subjects:['包装设计'],hiddenTypes:[],projectId:''};
  const run=()=>recommendationCatalog(data,{tab:'interest',preferences});
  assert.deepEqual(ids(run().results),['A01','A02']);
  const project=data.projects.find(p=>p.id==='project-empty')!;
  project.question='摄影器材如何呈现包装设计？';
  preferences.projectId=project.id;
  assert.deepEqual(ids(run().results),['B01','I01','I02','I03','A01','A02']);
  project.ownerId='another-user';
  assert.equal(run().project,undefined);
  assert.deepEqual(ids(run().results),['A01','A02']);
  preferences.subjects=[];
  assert.equal(run().total,0);
});

test('默认推荐不包含私有资料、失效图片或仅目录记录，隔离评审与旧偏好继续生效',()=>{
  const data=library();
  data.resources.find(r=>r.id==='I05')!.visibility='private';
  data.resources.find(r=>r.id==='I06')!.versionId='new-unavailable-edition';
  data.resources.find(r=>r.id==='I07')!.access='metadata_only';
  const live=recommendationCatalog(data,{tab:'new'});
  assert.equal(live.total,26);
  assert.ok(live.results.every(r=>!r.isDemo&&!['I05','I06','I07'].includes(r.id)));
  const review=recommendationCatalog(structuredClone(storedCatalogue) as AppData,{
    tab:'featured',review:'P04__default',preferences:{subjects:[],hiddenTypes:['video'],projectId:''}
  });
  assert.ok(review.results.some(r=>r.id==='DEMO-TEXT'));
  assert.ok(review.results.every(r=>r.visibility==='public'&&r.mediaType!=='video'));
});

test('仍可用已有的保温瓶兴趣找到普通检索中的同一批馆藏',()=>{
  const data=library();
  const preferences={subjects:['保温瓶'],hiddenTypes:[],projectId:''};
  const byInterest=recommendationCatalog(data,{tab:'interest',preferences});
  const bySearch=searchCatalog(data,new URLSearchParams({q:'保温瓶',source:'center_preview',access:'file_available'}));
  assert.deepEqual(ids(byInterest.results).sort(),ids(bySearch.results).sort());
  assert.ok(byInterest.results.some(r=>r.id==='I05'));
});
