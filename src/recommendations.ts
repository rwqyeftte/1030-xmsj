import type {AppData, MediaType} from '../contracts/domain';
import {accessionDate, featuredMaterial, hasStudySource, isEditorPick} from './featured';
import {projectTitle} from './presentation';
import {publicResults} from './search';

export interface RecommendationPreferences {
  subjects: string[];
  hiddenTypes: string[];
  projectId: string;
}

export function recommendationPreferenceKey(review:string) {
  return 'literature-center:discovery-preferences:'+(review||'default');
}

function defaultPreferences(review:string):RecommendationPreferences {
  return {subjects:review.endsWith('no-match')?['无匹配主题']:[],hiddenTypes:[],projectId:''};
}

function stringList(value:unknown):string[] {
  return Array.isArray(value) ? [...new Set(value.filter((v):v is string=>typeof v==='string').map(v=>v.trim()).filter(Boolean))] : [];
}

export function readRecommendationPreferences(review:string):RecommendationPreferences {
  try {
    const value=JSON.parse(localStorage.getItem(recommendationPreferenceKey(review))||'null');
    if (!value || typeof value!=='object' || Array.isArray(value)) return defaultPreferences(review);
    return {
      subjects:stringList(value.subjects),
      hiddenTypes:stringList(value.hiddenTypes),
      projectId:typeof value.projectId==='string'?value.projectId:'',
    };
  } catch {
    return defaultPreferences(review);
  }
}

interface RecommendationOptions {
  tab:string;
  type?:string|null;
  review?:string;
  preferences?:RecommendationPreferences;
}

export function recommendationCatalog(data:AppData, options:RecommendationOptions) {
  const {tab,type,review=''}=options;
  const preferences=options.preferences??defaultPreferences(review);
  const available=data.resources.filter(resource=>{
    if(resource.visibility!=='public') return false;
    if(review) return true;
    return resource.catalogOrigin==='center_preview' && !resource.isDemo
      && featuredMaterial(resource)?.mediaType===resource.mediaType && hasStudySource(data,resource);
  });
  const subjects=[...new Set(available.flatMap(r=>r.subjects))];
  const project=data.projects.find(p=>p.id===preferences.projectId&&p.ownerId===data.session.userId);
  const projectWords=project ? projectTitle(project)+' '+project.question : '';
  const interests=new Set(preferences.subjects);
  // Older saved topics can outlive the catalogue tag (e.g. 保温瓶).
  const legacyMatches=new Set<string>();
  if(tab==='interest'&&!review){
    for(const subject of interests){
      if(!subject.trim()||subjects.includes(subject)) continue;
      const params=new URLSearchParams({q:subject,source:'center_preview',access:'file_available'});
      for(const resource of publicResults(data,params)) legacyMatches.add(resource.id);
    }
  }
  if(tab==='interest' && project){
    // A project about 广告 should also find the catalogue subject 广告与品牌.
    for(const subject of subjects){
      const terms=review?[subject]:subject.split('与');
      if(terms.some(t=>t.length>1&&projectWords.includes(t))) interests.add(subject);
    }
  }
  const hidden=new Set(preferences.hiddenTypes);
  const matches=available.filter(r=>{
    if(hidden.has(r.mediaType)) return false;
    if(tab==='interest') return legacyMatches.has(r.id)||r.subjects.some(s=>interests.has(s));
    return tab==='new'||!!review||isEditorPick(r);
  });
  if(tab==='new') matches.sort((a,b)=>Date.parse(accessionDate(b))-Date.parse(accessionDate(a)));

  const typeCounts:Partial<Record<MediaType,number>>={};
  for(const resource of matches) typeCounts[resource.mediaType]=(typeCounts[resource.mediaType]??0)+1;
  const results=type&&!review ? matches.filter(r=>r.mediaType===type) : matches;
  return {results,total:matches.length,typeCounts,subjects,project};
}
