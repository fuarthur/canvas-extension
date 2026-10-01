import {readAppearanceCache,writeAppearanceCache,loadInitialAppearance,loadAccountAppearance,appearanceAccountKey,appearanceCacheKey,isCanvasThemePage} from './appearance.js';
import {createGlobalTheme} from './global-theme.js';

export function mountAppearance({document,storageArea,cacheStorage,subscribeStorage,loadProfile}){
 const view=document.defaultView,hostname=document.location.hostname;
 if(!isCanvasThemePage(document.location.pathname)||view.top!==view)return {destroy(){}};
 const globalTheme=createGlobalTheme({document}),media=view.matchMedia?.('(prefers-color-scheme: dark)');
 let current=readAppearanceCache(cacheStorage),stopped=false,pending=!current,gateStyle=null,rootObserver=null,timer=null;
 let verifiedId=null,readVersion=0,profileVersion=0,unsubscribe=null;
 function release(){
  pending=false;if(timer!==null)view.clearTimeout(timer);timer=null;
  document.documentElement?.removeAttribute('data-canvas-planning-appearance-pending');gateStyle?.remove();gateStyle=null;
 }
 function render(){
  if(stopped||!document.documentElement)return;
  if(current)globalTheme.apply(current,media?.matches);
  if(pending){
   document.documentElement.setAttribute('data-canvas-planning-appearance-pending','');
   if(!gateStyle){gateStyle=document.createElement('style');gateStyle.id='canvas-planning-appearance-gate';gateStyle.textContent='html[data-canvas-planning-appearance-pending] body{opacity:0!important;pointer-events:none!important;}';(document.head||document.documentElement).append(gateStyle);}
  }
 }
 if(pending)timer=view.setTimeout(release,250);
 if(!document.documentElement){
  rootObserver=new view.MutationObserver(()=>{if(document.documentElement){render();rootObserver.disconnect();rootObserver=null;}});
  rootObserver.observe(document,{childList:true});
 }else render();
 async function readLocal({publishCache=true}={}){
  const version=++readVersion,account=verifiedId;
  try{
   const value=account===null?await loadInitialAppearance(storageArea,hostname):await loadAccountAppearance(storageArea,hostname,account);
   if(stopped||version!==readVersion||account!==verifiedId)return;
   current=value;render();if(publishCache)writeAppearanceCache(cacheStorage,current);release();
  }catch{if(!stopped&&version===readVersion)release();}
 }
 async function verifyIdentity(){
  if(stopped||!loadProfile)return;
  const version=++profileVersion;
  try{
   const profile=await loadProfile();
   if(stopped||version!==profileVersion||!/^\d+$/.test(String(profile?.id??'')))return;
   verifiedId=String(profile.id);await readLocal();
   if(stopped||version!==profileVersion)return;
   const key=appearanceAccountKey(hostname),hint=await storageArea.get(key);
   if(stopped||version!==profileVersion)return;
   if(hint[key]!==verifiedId)await storageArea.set({[key]:verifiedId});
  }catch{ /* Identity access cannot block Canvas or discard a saved visual preference. */ }
 }
 const onStorage=(changes,area)=>{
  if(stopped||area!=='local')return;
  const prefix=`canvas-planner:${hostname}:`;
  const relevant=verifiedId===null?Object.keys(changes).some(key=>key===appearanceAccountKey(hostname)||(key.startsWith(prefix)&&/^\d+:theme(?:-scope)?:v1$/.test(key.slice(prefix.length)))):
   Object.keys(changes).some(key=>key===`${prefix}${verifiedId}:theme:v1`||key===`${prefix}${verifiedId}:theme-scope:v1`);
  if(relevant)readLocal();
 };
 // A valid cache notification is a hint to reconcile, never an invitation to republish another account.
 const onCache=event=>{if(!stopped&&(event.key===appearanceCacheKey||event.key===null))readLocal({publishCache:readAppearanceCache(cacheStorage)===null});};
 const onSystem=()=>{if(!stopped&&current?.theme.preset==='system')render();};
 const onVisible=()=>{if(document.visibilityState!=='hidden')verifyIdentity();};
 const onPageShow=()=>{if(!stopped){readLocal();verifyIdentity();}};
 const onPageHide=event=>{if(!event.persisted)destroy();};
 function destroy(){
  if(stopped)return;stopped=true;readVersion++;profileVersion++;release();rootObserver?.disconnect();globalTheme.destroy();unsubscribe?.();
  media?.removeEventListener('change',onSystem);view.removeEventListener('storage',onCache);view.removeEventListener('focus',onVisible);
  view.removeEventListener('pageshow',onPageShow);view.removeEventListener('pagehide',onPageHide);document.removeEventListener('visibilitychange',onVisible);
 }
 unsubscribe=subscribeStorage?.(onStorage);
 media?.addEventListener('change',onSystem);view.addEventListener('storage',onCache);view.addEventListener('focus',onVisible);
 view.addEventListener('pageshow',onPageShow);view.addEventListener('pagehide',onPageHide);document.addEventListener('visibilitychange',onVisible);
 readLocal();verifyIdentity();
 return {destroy};
}
