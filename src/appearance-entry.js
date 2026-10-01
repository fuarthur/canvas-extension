import {isCanvasThemePage} from './appearance.js';
import {mountAppearance} from './appearance-controller.js';

if(window.top===window&&isCanvasThemePage(location.pathname)){
 let cacheStorage=null;
 try{cacheStorage=window.localStorage;}catch{ /* Disabled page storage still permits Chrome preferences. */ }
 mountAppearance({
  document,cacheStorage,storageArea:chrome.storage.local,
  subscribeStorage:listener=>{
   chrome.storage.onChanged.addListener(listener);
   return()=>chrome.storage.onChanged.removeListener(listener);
  },
  loadProfile:async()=>{
   const response=await fetch('/api/v1/users/self/profile',{credentials:'include',headers:{Accept:'application/json'}});
   if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error('Canvas profile unavailable.');
   return response.json();
  }
 });
}
