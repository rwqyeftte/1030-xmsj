import type {Resource,Topic} from '../contracts/domain';
import ResearchChat from './ResearchChat';
import {featuredMaterial} from './featured';
import {mediaLabels,resourceTitle} from './presentation';
import {Link} from './ui';

export default function TopicChat({topic,resources,onClose}:{topic:Topic;resources:Resource[];onClose:()=>void}){
  const materials=resources.filter(r=>r.visibility==='public'&&!r.isDemo&&featuredMaterial(r));
  return <div className="topic-chat-layout">
    <ResearchChat scopeKey={'topic:'+topic.id} topicId={topic.id} title="与 DeepSeek 对话"
      scopeLabel={'回答依据本专题的 '+materials.length+' 份资料'} resourceIds={materials.map(r=>r.id)} onClose={onClose}
      suggestions={['这个专题适合从哪份资料读起？',topic.question||'哪些资料适合对照阅读？']}/>
    <details className="topic-chat-library" open={window.matchMedia('(min-width: 860px)').matches}>
      <summary>本次问答的资料</summary><ul>{materials.map(r=><li key={r.id}>
        <span>{mediaLabels[r.mediaType]} · {r.id}</span><Link to={'/resources/'+encodeURIComponent(r.id)+'/read'}>{resourceTitle(r)}</Link>
      </li>)}</ul>
    </details>
  </div>;
}
