import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
export type MenuItem = { label:string; url:string|null; children:MenuItem[] };
export type Song = { sid:number; name:string; key:string; pdf?:string|null; xml?:string|null; actions?:Record<string,string>; attachments?:boolean; editable?:boolean; drawer?:boolean; schedule?:boolean; last_planned?:string };
export type EventItem = { eid:number; title:string; songs:Song[]; links:{plan:string|null;pdf:string|null;xml:string|null} };
export type TeamEvent = { eid:number; title:string; date:string; scheduler:string; plan:string|null; toggle:boolean; cancel:boolean };
export type ExportFile = {base64:string;filename:string;mime:string;text:string};
export type Session = {url:string;token:string;username:string};
export class ApiError extends Error { constructor(message:string,public status:number){super(message);} }
export function validateUrl(url:string):string {
  const u=new URL(url.trim());
  if(u.protocol!=='https:' || u.username || u.password || u.search || u.hash) throw new Error('Zadejte HTTPS adresu api.php bez parametrů.');
  return u.toString();
}
export async function request<T>(session:Session,action:string,params:Record<string,unknown>={}):Promise<T> {
  const control=new AbortController();const timer=setTimeout(()=>control.abort(),180000);
  try {
    const r=await fetch(validateUrl(session.url),{method:'POST',signal:control.signal,credentials:'omit',headers:{'Content-Type':'application/json',...(session.token?{Authorization:`Bearer ${session.token}`}:{})},body:JSON.stringify({...params,action})});
    let data:any;
    try { data=await r.json(); } catch {throw new Error('Server nevrátil JSON. Zkontrolujte adresu API a nasazení PHP.');}
    if(!r.ok || !data.ok)throw new ApiError(data.error || `Chyba HTTP ${r.status}`,r.status);
    return data as T;
  } catch(e) {
    if(e instanceof Error && e.name==='AbortError') throw new Error('Vypršel časový limit. U zápisu nejprve obnovte seznam a ověřte výsledek; požadavek mohl být proveden.');
    throw e;
  } finally {clearTimeout(timer);}
}
const key='4sunday.session.v1';
export async function loadSession():Promise<Session|null>{
  if(Platform.OS==='web')return null;
  const raw=await SecureStore.getItemAsync(key);
  if(!raw)return null;
  try {const s=JSON.parse(raw);validateUrl(s.url);return s.token && s.username ? s:null;}catch{return null;}
}
export async function saveSession(s:Session|null){
  if(Platform.OS==='web')return; // Web tokens stay in memory, not localStorage.
  if(s)await SecureStore.setItemAsync(key,JSON.stringify(s));else await SecureStore.deleteItemAsync(key);
}
export const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('cs').trim();
