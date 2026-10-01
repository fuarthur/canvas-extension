import {defaultTheme,validTheme,normalizeTheme} from './themes.js';

export const validThemeScope=value=>value==='planner'||value==='canvas';
export const normalizeThemeScope=value=>validThemeScope(value)?value:'planner';
export const appearanceAccountKey=hostname=>`canvas-planner:${hostname}:appearance-account:v1`;
const prefix=(hostname,userId)=>`canvas-planner:${hostname}:${userId}:`;
const fromEntries=(entries,hostname,userId)=>({
 theme:normalizeTheme(entries[`${prefix(hostname,userId)}theme:v1`]),
 scope:normalizeThemeScope(entries[`${prefix(hostname,userId)}theme-scope:v1`])
});
export async function loadAccountAppearance(storageArea,hostname,userId){
 const base=prefix(hostname,userId);
 return fromEntries(await storageArea.get([`${base}theme:v1`,`${base}theme-scope:v1`]),hostname,userId);
}
export async function loadInitialAppearance(storageArea,hostname){
 const hint=await storageArea.get(appearanceAccountKey(hostname));
 const account=hint[appearanceAccountKey(hostname)];
 if(/^\d+$/.test(String(account??'')))return loadAccountAppearance(storageArea,hostname,account);
 // Migration reads only appearance records; tasks are never retained here.
 const entries=await storageArea.get(null),base=`canvas-planner:${hostname}:`;
 const themes=Object.entries(entries).filter(([key,value])=>key.startsWith(base)&&/^\d+:theme:v1$/.test(key.slice(base.length))&&validTheme(value));
 return {theme:themes.length===1?normalizeTheme(themes[0][1]):defaultTheme(),scope:'planner'};
}
export async function saveThemeScope(storageArea,hostname,userId,scope){
 if(!validThemeScope(scope))throw new Error('Choose a valid theme scope.');
 await storageArea.set({[`${prefix(hostname,userId)}theme-scope:v1`]:scope,[appearanceAccountKey(hostname)]:String(userId)});
}

export const appearanceCacheKey='canvas-planner:appearance-bootstrap:v1';
export function readAppearanceCache(cacheStorage){
 try{
  const value=JSON.parse(cacheStorage?.getItem(appearanceCacheKey)??'null');
  return value?.schemaVersion===1&&validTheme(value.theme)&&validThemeScope(value.scope)?{theme:normalizeTheme(value.theme),scope:value.scope}:null;
 }catch{return null;}
}
export function writeAppearanceCache(cacheStorage,appearance){
 if(!validTheme(appearance?.theme)||!validThemeScope(appearance?.scope))return false;
 try{
  const value=JSON.stringify({schemaVersion:1,theme:normalizeTheme(appearance.theme),scope:appearance.scope});
  if(cacheStorage.getItem(appearanceCacheKey)!==value)cacheStorage.setItem(appearanceCacheKey,value);
  return true;
 }catch{return false;}
}
export function isCanvasThemePage(pathname){
 return !/^\/(login|logout|oauth2)(\/|$)/.test(pathname)&&
  !/^\/(?:courses\/\d+\/)?files\/\d+\/preview(?:\/|$)/.test(pathname)&&
  !/^\/media_objects_iframe(?:\/|$)/.test(pathname);
}
