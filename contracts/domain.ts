/** D: Suggested normalized domain contract for a local interactive wireframe.
 *  No runtime implementation or production security is claimed by this file.
 */
export type ID = string;
export type MediaType = 'book' | 'article' | 'image' | 'video';
export type ObjectRef = {kind:'resource'|'note'|'idea'; id:ID; revision?:number};
export interface Provenance { kind:'course_catalog'|'synthetic'|'user_input'; sourceLabel:string; sourcePage?:number; note?:string }
export interface Resource {
  id:ID; versionId:ID; title:string; mediaType:MediaType;
  catalogOrigin:'center_preview'|'synthetic'|'user_upload'; isDemo:boolean;
  visibility:'public'|'private'; ownerId:ID|null;
  access:'metadata_only'|'restricted'|'demo_readable';
  authors:string[]|null; sourceDate:string|null; sourceDateType:'publication'|'object'|'recording'|null;
  dateNote:string; description:string; subjects:string[]; provenance:Provenance;
  availabilityNote:string; rightsStatus:'unverified'|'synthetic_demo';
  contentId:ID|null; createdAt:string;
}
export type DemoContent = {
  id:ID; resourceId:ID; kind:'text'; versionId:ID;
  paragraphs:{id:ID; text:string}[]; warning:string;
} | {
  id:ID; resourceId:ID; kind:'image'; versionId:ID;
  width:number; height:number; label:string;
  shapes:{x:number;y:number;width:number;height:number;label:string}[]; warning:string;
} | {
  id:ID; resourceId:ID; kind:'video_timeline'; versionId:ID;
  durationSec:number; segments:{startSec:number;endSec:number;text:string}[];
  warning:string;
};
export type SourceAnchor = {
 id:ID; resourceId:ID; resourceVersionId:ID; isDemo:boolean;
} & (
 {kind:'text'; paragraphId:ID; endParagraphId?:ID; startOffset?:number; endOffset?:number; quote:string; prefix?:string;suffix?:string} |
 {kind:'image'; pageIndex?:number; x:number;y:number;width:number;height:number} |
 {kind:'video';startSec:number;endSec:number;point?:boolean} |
 {kind:'record';label:string}
);
export interface PersonalSave {userId:ID;resourceId:ID;savedAt:string}
export interface Collection {id:ID;ownerId:ID;title:string;description:string;members:ObjectRef[];revision:number}
export interface NoteRevision {revision:number;body:string;anchorIds:ID[];createdAt:string;aiAssisted:boolean}
export interface Note {id:ID;ownerId:ID;originProjectId:ID|null;title:string;type:'excerpt'|'observation'|'interpretation'|'comparison'|'independent'; currentRevision:number;revisions:NoteRevision[];relatedNoteIds:ID[]}
export interface Project {id:ID;ownerId:ID;title:string;status:'active'|'archived';question:string;updatedAt:string;isDemo:boolean}
export interface ProjectMember {id:ID;projectId:ID;ref:ObjectRef;selection:'candidate'|'included'|'excluded';reading:'unread'|'reading'|'read';reason:string}
export interface SummarySource {ref:ObjectRef;title:string;resourceVersionId?:ID;basis:'text'|'note'|'idea'|'description'|'metadata';excerpt:string;anchorIds:ID[]}
export interface Idea {id:ID;projectId:ID;type:'question'|'tentative_claim'|'memo'|'summary';title:string;body:string;isDemo:boolean;summary?:{method:'local_extract';focus:string;sources:SummarySource[];createdAt:string}}
export interface BoardNode {id:ID;projectId:ID;ref:ObjectRef;x:number;y:number;width:number;height:number;groupId:ID|null}
export interface ProjectGroup {id:ID;projectId:ID;title:string;memberRefs:ObjectRef[];sourceCollectionId:ID|null;sourceCollectionRevision:number|null}
export interface Relation {id:ID;projectId:ID;from:ObjectRef;to:ObjectRef;type:'same_source'|'compare'|'supports'|'contradicts'|'background'|'hypothesis'|'summary_source';rationale:string;anchorIds:ID[];state:'proposed'|'confirmed'|'inactive';aiAssisted:boolean;needsReview:boolean}
export interface EdgeBinding {id:ID;relationId:ID;sourceNodeId:ID;targetNodeId:ID}
export interface BoardView {projectId:ID;x:number;y:number;zoom:number;selectedNodeIds:ID[];mode:'overview'|'preview'|'deep';view:'board'|'files'|'analysis'}
export interface PlanSection {body:string;refs:ObjectRef[];needsReview:boolean}
export interface ResearchPlan {projectId:ID;revision:number;sections:Record<'topic'|'question'|'method'|'feasibility'|'integration',PlanSection>;updatedAt:string}
export interface Topic {id:ID;title:string;question:string;intro:string;resourceIds:ID[];isDemoCuration:boolean;status:'published'|'planned'}
export interface QueryRecord {id:ID;ownerId:ID|null;scope:'public';q:string;mode:'standard'|'ai';rules:{field:string;operator:'AND'|'OR'|'NOT';value:string}[];targetProjectId:ID|null}
export interface ImportJob {id:ID;targetProjectId:ID|null;state:'selected'|'storing'|'review'|'confirming'|'done'|'failed'|'cancelled';fileName:string;blobKey:ID|null;resourceId:ID|null;error:string|null;recognitionIsMock:boolean}
export interface AICandidate {id:ID;scopeLabel:string;allowedResourceIds:ID[];body:string;anchorIds:ID[];state:'proposed'|'accepted'|'dismissed';isMock:true}
export interface ReturnContext {id:ID;pathname:string;search:string;scrollY:number;targetProjectId?:ID;focusNodeId?:ID;readerAnchorId?:ID;boardViewport?:{x:number;y:number;zoom:number};focusReturnKey?:string}
export type SaveState = 'idle'|'dirty'|'saving'|'saved'|'error';
export interface AppData {
 demoSearchExampleVersion?:number;
 schemaVersion:1;session:{userId:ID|null;isDemo:true};
 resources:Resource[];contents:DemoContent[];anchors:SourceAnchor[];
 personalSaves:PersonalSave[];collections:Collection[];notes:Note[];
 projects:Project[];projectMembers:ProjectMember[];ideas:Idea[];boardNodes:BoardNode[];
 groups:ProjectGroup[];relations:Relation[];edgeBindings:EdgeBinding[];boardViews:BoardView[];
 researchPlans:ResearchPlan[];topics:Topic[];savedQueries:QueryRecord[];
 importJobs:ImportJob[];aiCandidates:AICandidate[];
}
