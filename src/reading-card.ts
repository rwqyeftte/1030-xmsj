import type {AppData, Note, ObjectRef, Resource, SourceAnchor} from '../contracts/domain';
import {anchorLabel, canRead, uid} from './store';
import {resourceTitle} from './presentation';

export interface ReadingDraft {title:string; body:string; type:string; ai:boolean}

function location(anchor:SourceAnchor) {
  switch (anchor.kind) {
    case 'text': return [anchor.paragraphId,anchor.endParagraphId??anchor.paragraphId,anchor.startOffset,anchor.endOffset,anchor.quote];
    case 'pdf': return [anchor.page,anchor.selection?.quote,anchor.selection?.rects.map(r=>[r.x,r.y,r.width,r.height])];
    case 'image': return [anchor.pageIndex??0,anchor.x,anchor.y,anchor.width,anchor.height];
    case 'video': return [!!anchor.point,anchor.startSec,anchor.endSec];
    case 'record': return [anchor.label];
  }
}

function readingTitle(resource:Resource,anchor:SourceAnchor,draft:ReadingDraft) {
  const excerpt=anchor.kind==='text'?anchor.quote:anchor.kind==='pdf'?anchor.selection?.quote:'';
  return draft.title.trim() || Array.from((draft.body.trim() || excerpt || '').replace(/\s+/g,' ')).slice(0,32).join('') ||
    resourceTitle(resource)+' · '+anchorLabel(anchor);
}

export function readingCardRef(data:AppData,projectId:string,resource:Resource,anchor:SourceAnchor,draft?:ReadingDraft,noteId?:string):ObjectRef {
  const userId=data.session.userId;
  const source=data.resources.find(r=>r.id===anchor.resourceId);
  if (!userId || !source || source.id!==resource.id || source.versionId!==anchor.resourceVersionId || !canRead(data,{kind:'resource',id:source.id}))
    throw Error('来源已变更或无法访问，请重新选择。');
  if (noteId) {
    const note=data.notes.find(n=>n.id===noteId && n.ownerId===userId);
    if (!note) throw Error('这条笔记已无法访问。');
    return {kind:'note',id:note.id,revision:note.currentRevision};
  }
  if (!draft) throw Error('请选择一处来源。');
  const position=JSON.stringify(location(anchor));
  const matches=data.anchors.filter(a=>a.kind===anchor.kind && a.resourceId===source.id && a.resourceVersionId===source.versionId &&
    JSON.stringify(location(a))===position);
  const anchorIds=new Set(matches.map(a=>a.id));
  const title=readingTitle(resource,anchor,draft);
  const body=draft.body.trim();
  const type:Note['type']=draft.type==='interpretation'?'interpretation':draft.type==='observation'?'observation':draft.type==='independent'?'independent':'excerpt';
  const existing=data.notes.find(n=>n.ownerId===userId && n.title===title && n.type===type && n.revisions.some(rev=>
    rev.revision===n.currentRevision && rev.body.trim()===body && rev.aiAssisted===draft.ai && rev.anchorIds.length===1 && anchorIds.has(rev.anchorIds[0])));
  if (existing) return {kind:'note',id:existing.id,revision:existing.currentRevision};
  const origin=matches[0]??anchor;
  if (!matches.length) data.anchors.push(anchor);
  const id=uid('note');
  data.notes.push({id,title,type,ownerId:userId,originProjectId:projectId,currentRevision:1,relatedNoteIds:[],
    revisions:[{revision:1,body,anchorIds:[origin.id],aiAssisted:draft.ai,createdAt:new Date().toISOString()}]});
  return {kind:'note',id,revision:1};
}
