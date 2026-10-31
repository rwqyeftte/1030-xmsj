import {useEffect,useRef,useState} from 'react';
import type {DemoContent,Resource} from '../contracts/domain';
import {useDraft} from './ui';
import {hasDemoVideo,videoTime,videoAnchorLabel,type VideoAnchor} from './video-annotations';
import demoVideo from './assets/video-notes-demo.webm';
import demoPoster from './assets/video-notes-poster.png';
import {resourceTitle} from './presentation';

export default function VideoReader({resource,content,anchor,onSelect,comparison=false}:{
  resource:Resource;content:Extract<DemoContent,{kind:'video_timeline'}>;anchor:VideoAnchor|null;
  onSelect:(range:Pick<VideoAnchor,'startSec'|'endSec'|'point'>)=>void;comparison?:boolean;
}){
  const player=useRef<HTMLVideoElement>(null),clipEnd=useRef<number|null>(null),lastPosition=useRef(-1);
  const [position,setPosition]=useDraft('video-position:'+resource.id,{time:0});
  const [time,setTime]=useState(0),[ready,setReady]=useState(false),[error,setError]=useState('');
  const [rangeStart,setRangeStart]=useState<number|null>(null),[rangeError,setRangeError]=useState('');
  const [playing,setPlaying]=useState(false);
  const available=hasDemoVideo(resource,content);
  function seek(value:number){
    const el=player.current;if(!el||!ready)return;
    clipEnd.current=null;el.pause();el.currentTime=Math.max(0,Math.min(value,el.duration));
    setTime(el.currentTime);setPosition({time:el.currentTime});
  }
  useEffect(()=>{if(anchor&&ready){seek(anchor.startSec);setRangeStart(null);setRangeError('');if(window.matchMedia('(max-width: 760px)').matches)player.current?.scrollIntoView({block:'start'});}},[anchor,ready]);
  function capture(){
    const el=player.current;if(!el||!ready)return;
    el.pause();clipEnd.current=null;const at=Math.min(content.durationSec,Math.floor(el.currentTime));
    setRangeStart(null);setRangeError('');onSelect({startSec:at,endSec:at,point:true});
  }
  function finishRange(){
    const el=player.current;if(!el||rangeStart===null||!ready)return;
    const end=Math.min(content.durationSec,Math.floor(el.currentTime));
    if(end<=rangeStart){setRangeError('请播放或拖动进度条到起点之后，再结束片段。');return;}
    el.pause();clipEnd.current=null;onSelect({startSec:rangeStart,endSec:end});setRangeStart(null);setRangeError('');
  }
  async function playSelection(){
    const el=player.current;if(!el||!anchor||!ready)return;
    el.currentTime=anchor.startSec;clipEnd.current=anchor.point?null:anchor.endSec;
    try{await el.play();}catch{setError('暂时无法播放，请重试。');}
  }
  if(!available)return <div className="video-unavailable"><h3>暂未提供可播放的视频</h3><p>已有笔记仍然保留，可在个人笔记中查看。</p></div>;
  return <div className="video-reader">
    <p className="video-demo-caption">演示短片 · 20 秒 · 无声</p>
    <video ref={player} controls playsInline preload="metadata" poster={demoPoster} src={demoVideo} aria-label={resourceTitle(resource)+'，视频播放器'}
      onLoadedMetadata={e=>{const el=e.currentTarget;setReady(true);setError('');const at=anchor?.startSec??position.time;el.currentTime=Number.isFinite(at)?Math.max(0,Math.min(at,el.duration)):0;setTime(el.currentTime);}}
      onTimeUpdate={e=>{const el=e.currentTarget;if(clipEnd.current!==null&&el.currentTime>=clipEnd.current){const end=clipEnd.current;clipEnd.current=null;el.pause();el.currentTime=end;}setTime(el.currentTime);if(Math.floor(el.currentTime)!==lastPosition.current){lastPosition.current=Math.floor(el.currentTime);setPosition({time:el.currentTime});}}}
      onPlay={()=>{setPlaying(true);setError('');}} onPause={e=>{setPlaying(false);setPosition({time:e.currentTarget.currentTime});}}
      onSeeked={e=>{setTime(e.currentTarget.currentTime);setPosition({time:e.currentTarget.currentTime});}}
      onEnded={()=>setPlaying(false)} onError={()=>{setReady(false);setError('视频未能加载。请重新载入；未保存的笔记仍保留。');}}/>
    {error&&<div className="error" role="alert">{error} <button onClick={()=>{setError('');player.current?.load();}}>重新载入视频</button></div>}
    <div className="video-note-actions">
      {rangeStart===null?<><button className="primary" disabled={!ready} aria-label={comparison?'选为对照来源':'在当前时间记笔记'} onClick={capture}>{comparison?'选用当前时间':'在 '+videoTime(time)+' 记笔记'}</button><button disabled={!ready||Math.floor(time)>=content.durationSec} onClick={()=>{setRangeStart(Math.floor(player.current?.currentTime||0));setRangeError('');}}>标记片段</button></>:<><span className="video-range-status">起点 {videoTime(rangeStart)}</span><button className="primary" disabled={!ready} onClick={finishRange}>{comparison?'结束片段并选用':'在 '+videoTime(time)+' 结束并记笔记'}</button><button onClick={()=>{setRangeStart(null);setRangeError('');}}>取消标记</button></>}
      <label className="video-speed">倍速<select aria-label="播放速度" defaultValue="1" onChange={e=>{if(player.current)player.current.playbackRate=Number(e.target.value);}}>{[.5,.75,1,1.25,1.5,2].map(n=><option key={n} value={n}>{n}×</option>)}</select></label>
    </div>
    {rangeStart!==null?<p className="video-help" role="status">继续播放或拖动进度条，找到片段结尾后点击“结束并记笔记”。</p>:!anchor&&<p className="video-help">看到值得记录的内容时，点击“记笔记”，视频会暂停并自动带上时间。</p>}
    {rangeError&&<p className="error" role="alert">{rangeError}</p>}
    {anchor&&rangeStart===null&&<div className="video-selected-time" data-testid="anchor-highlight"><span>{anchor.point?'笔记时间':'笔记片段'} <strong>{videoAnchorLabel(anchor)}</strong></span><button disabled={!ready} onClick={()=>seek(anchor.startSec)}>返回此处</button><button disabled={!ready||!!anchor.point&&anchor.startSec>=content.durationSec} onClick={playing?()=>player.current?.pause():playSelection}>{playing?'暂停':anchor.point?'从这里播放':'播放此片段'}</button></div>}
    <nav className="video-chapters" aria-label="视频目录">{content.segments.map(s=><button key={s.startSec} disabled={!ready} aria-current={time>=s.startSec&&time<s.endSec?'true':undefined} onClick={()=>seek(s.startSec)}><time>{videoTime(s.startSec)}</time>{s.text.replace(/^合成片段[^：]*：/,'')}</button>)}</nav>
  </div>;
}
