import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ProxyAgent} from 'undici';

const run=promisify(execFile);
let resolvedRoute;

// Node 22 fetch does not automatically use the Windows user's proxy settings.
async function resolveRoute() {
  let proxy=process.env.DEEPSEEK_HTTPS_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxy && process.platform==='win32') {
    const resolveWindowsProxy=[
      "$target=[uri]'https://api.deepseek.com/responses'",
      '$route=[Net.WebRequest]::GetSystemWebProxy().GetProxy($target)',
      'if ($route -and $route -ne $target) { $route.AbsoluteUri }',
    ].join('; ');
    const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',resolveWindowsProxy],{windowsHide:true,timeout:6000});
    proxy=stdout.trim();
  }
  if (!proxy) return {};
  const uri=new URL(proxy);
  if (!['https:','http:'].includes(uri.protocol)) throw Error('需要 HTTP 或 HTTPS 代理。');
  return {dispatcher:new ProxyAgent(uri.href)};
}

export function deepSeekTransport() {
  resolvedRoute ??=resolveRoute().catch(error=>{resolvedRoute=undefined;throw error;});
  return resolvedRoute;
}
