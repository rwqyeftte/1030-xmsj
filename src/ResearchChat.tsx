import {useEffect,useId,useRef,useState} from 'react';
import type {SourceAnchor} from '../contracts/domain';
import {requestAI} from './ai';
import {Link} from './ui';
import {useApp} from './store';

export interface ChatSource {
  id:string;
  resourceId:string;
  title:string;
  label:string;
  page?:number;
  paragraphId?:string;
}
interface Turn {question:string;answer:string;sources:ChatSource[];originAnchor?:SourceAnchor}
interface Conversation {turns:Turn[];draft:string}
interface Props {
  scopeKey:string;
  title:string;
  scopeLabel:string;
  resourceIds:string[];
  topicId?:string;
  page?:number;
  paragraphId?:string;
  passage?:string;
  suggestions?:string[];
  acceptLabel?:string;
  originAnchor?:SourceAnchor;
  onAccept?:(text:string,sources:ChatSource[],originAnchor?:SourceAnchor)=>void;
  onSource?:(source:ChatSource)=>void;
  onClose?:()=>void;
}

function validSource(value:unknown,ids:string[]):value is ChatSource {
  if(!value||typeof value!=='object')return false;
  const s=value as ChatSource;
  return typeof s.resourceId==='string'&&ids.includes(s.resourceId)&&typeof s.id==='string'&&typeof s.title==='string'&&typeof s.label==='string'
    &&(s.page===undefined||(Number.isSafeInteger(s.page)&&s.page>0))&&(s.paragraphId===undefined||typeof s.paragraphId==='string');
}
function restore(key:string,ids:string[]):Conversation {
  try {
    const stored=JSON.parse(sessionStorage.getItem(key)||'null');
    if(typeof stored?.draft==='string'&&Array.isArray(stored.turns)){
      const turns=stored.turns.filter((v:Turn)=>v&&typeof v.question==='string'&&typeof v.answer==='string'&&Array.isArray(v.sources)&&v.sources.every(s=>validSource(s,ids)));
      return {draft:stored.draft,turns};
    }
  } catch { /* Session storage can be unavailable in private browsing. */ }
  return {draft:'',turns:[]};
}
function sourcePath(s:ChatSource){
  const q=new URLSearchParams();
  if(s.page)q.set('page',String(s.page));
  if(s.paragraphId){q.set('view','text');q.set('paragraphId',s.paragraphId);}
  else if(s.page)q.set('view','pdf');
  return '/resources/'+encodeURIComponent(s.resourceId)+'/read'+(q.size?'?'+q:'');
}
function Message({role,children}:{role:'user'|'assistant';children:React.ReactNode}){
  return <div className={'chat-message chat-'+role}><span className="chat-speaker">{role==='user'?'你':'DeepSeek'}</span>{children}</div>;
}
const defaultSuggestions=['可以从哪份资料开始？','这些资料可以回答哪些问题？'];
export default function ResearchChat(props:Props) {
  const {data,review}=useApp();
  const ids=[...new Set(props.resourceIds)].sort();
  const key=JSON.stringify([review,data.session.userId,props.scopeKey,ids]);
  return <ConversationPanel key={key} {...props} resourceIds={ids} storageKey={'literature-center:chat:'+key}/>;
}
function ConversationPanel({storageKey,title,scopeLabel,resourceIds,topicId,page,paragraphId,passage,suggestions=defaultSuggestions,onSource,onClose,originAnchor,onAccept,acceptLabel='加入笔记草稿'}:Props&{storageKey:string}){
  const [chat,setChat]=useState(()=>restore(storageKey,resourceIds));
  const [sending,setSending]=useState('');
  const [error,setError]=useState('');
  const [accepted,setAccepted]=useState<number|null>(null);
  const active=useRef<AbortController|null>(null);
  const log=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null);
  const labelId=useId();
  useEffect(()=>()=>{active.current?.abort();},[]);
  useEffect(()=>{
    try {sessionStorage.setItem(storageKey,JSON.stringify(chat));} catch { /* The active conversation stays available in memory. */ }
  },[chat,storageKey]);
  useEffect(()=>{
    if(log.current)log.current.scrollTop=log.current.scrollHeight;
  },[chat.turns.length,sending,error]);
  function compose(value:string){
    setError('');
    setChat(previous=>({...previous,draft:value}));
  }
  async function send(){
    const question=chat.draft.trim();
    if(!question||!resourceIds.length||active.current)return;
    const controller=new AbortController();
    active.current=controller;
    setSending(question);
    setError('');
    const timeout=window.setTimeout(()=>controller.abort('timeout'),55000);
    try {
      const history=chat.turns.slice(-3).flatMap(turn=>[
        {role:'user',content:turn.question},
        {role:'assistant',content:turn.answer.slice(0,2000),sourceIds:turn.sources.map(s=>s.id)},
      ]);
      const reply=await requestAI({task:'chat',resourceIds,topicId,page,paragraphId,passage,question,history},controller.signal);
      if(typeof reply?.answer!=='string'||!reply.answer.trim()||!Array.isArray(reply.sources)||!reply.sources.every((s:unknown)=>validSource(s,resourceIds)))throw Error('回答或来源未能完整返回，请重试。');
      if(!controller.signal.aborted){
        setChat(previous=>({turns:[...previous.turns,{question,answer:reply.answer.trim(),sources:reply.sources,originAnchor}],draft:''}));
        setAccepted(null);
      }
    } catch(e) {
      if(controller.signal.reason==='timeout')setError('等待回答超时，可以重试这个问题。');
      else if(!controller.signal.aborted)setError(e instanceof Error?e.message:'暂时无法回答，请重试。');
    } finally {
      window.clearTimeout(timeout);
      if(active.current===controller)active.current=null;
      if(!controller.signal.aborted||controller.signal.reason==='timeout')setSending('');
    }
  }
  return <section className="research-chat" aria-labelledby={labelId} data-testid="research-chat">
    <header className="chat-heading"><div><h2 id={labelId}>{title}</h2><p>{scopeLabel}</p></div>
      {onClose&&<button type="button" onClick={onClose} aria-label="关闭问答" className="chat-close">×</button>}
    </header>
    <div className="chat-log" role="log" aria-label="对话记录" aria-relevant="additions" ref={log}>
      {chat.turns.length===0&&!sending&&resourceIds.length>0&&<div className="chat-starters"><p>你想了解什么？</p>{suggestions.map(s=><button type="button" key={s} onClick={()=>{compose(s);input.current?.focus();}}>{s}<span aria-hidden="true">↗</span></button>)}</div>}
      {chat.turns.map((turn,i)=><div className="chat-turn" key={i}>
        <Message role="user"><p>{turn.question}</p></Message>
        <Message role="assistant"><p>{turn.answer}</p>
          {turn.sources.length>0&&<div className="chat-sources"><span>参考资料</span><ul>{turn.sources.map(s=><li key={s.id}><Link to={sourcePath(s)} onClick={e=>{if(onSource&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey){e.preventDefault();onSource(s);}}}>{s.title} · {s.label}</Link></li>)}</ul></div>}
          {onAccept&&turn.sources.length>0&&<button type="button" className="chat-accept" onClick={()=>{onAccept('[DeepSeek 辅助]\n'+turn.answer+'\n'+turn.sources.map(s=>s.resourceId+' · '+s.title+' · '+s.label).join('\n'),turn.sources,turn.originAnchor);if(acceptLabel==='加入笔记草稿')setAccepted(i);}} disabled={accepted===i}>{accepted===i?'已加入草稿':acceptLabel}</button>}
        </Message>
      </div>)}
      {sending&&<div className="chat-turn"><Message role="user"><p>{sending}</p></Message><Message role="assistant"><p>正在查阅资料…</p></Message></div>}
      {!resourceIds.length&&<p className="chat-no-sources">当前范围没有可供问答的公开资料。</p>}
    </div>
    {resourceIds.length>0&&<form className="chat-composer" onSubmit={e=>{e.preventDefault();void send();}}>
      {error&&<p role="alert" className="chat-error">{error}</p>}
      <textarea ref={input} rows={2} aria-label={chat.turns.length?'继续追问':'输入问题'} maxLength={600} value={sending?'':chat.draft} placeholder={sending?'正在等待回答…':chat.turns.length?'继续追问…':'输入你的问题…'} readOnly={!!sending} onChange={e=>compose(e.target.value)} onKeyDown={e=>{
        if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&e.keyCode!==229){e.preventDefault();void send();}
      }}/>
      <div className="chat-controls">
        {chat.turns.length>0&&<button type="button" className="chat-restart" disabled={!!sending} onClick={()=>{setChat({turns:[],draft:''});setAccepted(null);setError('');input.current?.focus();}}>清空对话</button>}
        <button type="submit" className="chat-send" disabled={!!sending||!chat.draft.trim()}>{sending?'回答中…':error?'重新发送':'发送'}</button>
      </div>
    </form>}
  </section>;
}
