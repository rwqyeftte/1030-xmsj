import {useEffect,useState} from 'react';
import {readLocalBlob} from './imports';
import {useApp} from './store';
export function useImageSource(resourceId:string){
  const {data}=useApp();
  const resource=data.resources.find(r=>r.id===resourceId);
  const key=data.importJobs.find(j=>j.resourceId===resourceId)?.blobKey;
  const required=resource?.catalogOrigin==='user_upload';
  const [source,setSource]=useState({url:'',loading:!!key,missing:false});
  useEffect(()=>{
    let live=true,url='';setSource({url:'',loading:!!key,missing:!!required&&!key});
    if(key)readLocalBlob(key).then(blob=>{if(!live)return;if(blob){url=URL.createObjectURL(blob);setSource({url,loading:false,missing:false});}else setSource({url:'',loading:false,missing:true});}).catch(()=>{if(live)setSource({url:'',loading:false,missing:true});});
    return()=>{live=false;if(url)URL.revokeObjectURL(url);};
  },[resourceId,key,required]);
  return source;
}
