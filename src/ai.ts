/// <reference types="vite/client" />
const loopback=typeof window!=='undefined'&&['localhost','127.0.0.1'].includes(window.location.hostname);
export const aiEndpoint=loopback ? '/api/reader' : import.meta.env?.VITE_READER_API_URL;

export async function requestAI(payload:object,signal:AbortSignal){
  if(!aiEndpoint)throw Error('当前站点尚未配置 DeepSeek 服务。');
  const res=await fetch(aiEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify(payload)});
  if(!res.headers.get('content-type')?.includes('application/json'))throw Error('DeepSeek 服务未启动，请检查服务地址。');
  const result=await res.json();
  if(!res.ok)throw Error(result.error || '请求失败，请重试。');
  return result;
}
