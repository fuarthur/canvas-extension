import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlannerStore} from '../src/storage.js';
import {loadInitialAppearance,loadAccountAppearance,normalizeThemeScope} from '../src/appearance.js';
import {readAppearanceCache,writeAppearanceCache,isCanvasThemePage} from '../src/appearance.js';
import {defaultTheme} from '../src/themes.js';
import {memoryStorage,settings} from './helpers/planning.js';
const host='canvas.illinois.edu';
const dark={...defaultTheme(),preset:'dark'};

test('scope writes preserve account theme and settings',async()=>{
 const area=memoryStorage(),store=createPlannerStore(area,host,77);
 assert.equal((await store.loadPlanningState()).themeScope,'planner');
 await store.setTheme(dark);await store.setSettings(settings({defaultMinutes:90}));
 const before=await store.loadPlanningState();await store.setThemeScope('canvas');
 const after=await createPlannerStore(area,host,77).loadPlanningState();
 assert.equal(after.themeScope,'canvas');assert.deepEqual(after.theme,before.theme);assert.deepEqual(after.settings,before.settings);
 assert.equal((await createPlannerStore(area,host,88).loadPlanningState()).themeScope,'planner');
 assert.equal((await createPlannerStore(area,'other.canvas.edu',77).loadPlanningState()).themeScope,'planner');
 await store.setTheme({...dark,preset:'warm'});assert.equal((await store.loadPlanningState()).themeScope,'canvas');
 await assert.rejects(store.setThemeScope('all'));assert.equal((await store.loadPlanningState()).themeScope,'canvas');
});
test('initial appearance takes theme and scope from the same hinted account',async()=>{
 const area=memoryStorage();await createPlannerStore(area,host,77).setTheme(dark);
 await createPlannerStore(area,host,77).setThemeScope('canvas');
 await createPlannerStore(area,host,88).setTheme({...dark,preset:'forest'});
 assert.deepEqual(await loadInitialAppearance(area,host),{theme:{...dark,preset:'forest'},scope:'planner'});
 assert.deepEqual(await loadAccountAppearance(area,host,77),{theme:dark,scope:'canvas'});
 assert.deepEqual(await loadInitialAppearance(area,'other.canvas.edu'),{theme:defaultTheme(),scope:'planner'});
});
test('old single-account theme migration never enables a global scope without a hint',async()=>{
 const area=memoryStorage();area.entries[`canvas-planner:${host}:77:theme:v1`]=dark;
 area.entries[`canvas-planner:${host}:77:theme-scope:v1`]='canvas';
 assert.deepEqual(await loadInitialAppearance(area,host),{theme:dark,scope:'planner'});
 area.entries[`canvas-planner:${host}:88:theme:v1`]=dark;
 assert.deepEqual(await loadInitialAppearance(area,host),{theme:defaultTheme(),scope:'planner'});
});
test('invalid stored scope falls back without rewriting the record',async()=>{
 const area=memoryStorage(),key=`canvas-planner:${host}:77:theme-scope:v1`;area.entries[key]='oops';
 const state=await createPlannerStore(area,host,77).loadPlanningState();
 assert.equal(state.themeScope,'planner');assert.ok(state.warnings.some(x=>/scope/i.test(x)));assert.equal(area.entries[key],'oops');
 for(const value of [null,{},'all',true])assert.equal(normalizeThemeScope(value),'planner');
});
test('bootstrap cache accepts only validated appearance and drops unrelated information',()=>{
 const values=new Map(),cache={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 assert.equal(readAppearanceCache(cache),null);assert.equal(writeAppearanceCache(cache,{theme:dark,scope:'canvas',userId:77,css:'bad'}),true);
 const raw=JSON.parse([...values.values()][0]);assert.deepEqual(Object.keys(raw).sort(),['schemaVersion','scope','theme']);
 assert.deepEqual(readAppearanceCache(cache),{theme:dark,scope:'canvas'});
 const key=[...values.keys()][0];for(const value of ['bad','null',JSON.stringify({...raw,schemaVersion:2}),JSON.stringify({...raw,scope:'all'}),JSON.stringify({...raw,theme:{...dark,custom:{...dark.custom,accent:'red;display:none'}}})]){values.set(key,value);assert.equal(readAppearanceCache(cache),null);}
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 assert.equal(readAppearanceCache(blocked),null);assert.equal(writeAppearanceCache(blocked,{theme:dark,scope:'canvas'}),false);
});
test('global theme eligibility excludes auth, standalone previews and respects path boundaries',()=>{
 for(const path of ['/','/calendar','/courses/123/modules','/courses/123/files','/profile/settings','/conversations'])assert.equal(isCanvasThemePage(path),true,path);
 for(const path of ['/login','/login/canvas','/logout','/oauth2/auth','/files/123/preview','/courses/123/files/456/preview','/media_objects_iframe/abc'])assert.equal(isCanvasThemePage(path),false,path);
 assert.equal(isCanvasThemePage('/courses/123/pages/login-guide'),true);
});
