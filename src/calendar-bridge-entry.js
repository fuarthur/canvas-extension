import {mountNativeCalendarBridge} from './native-calendar-bridge.js';
const destroy = mountNativeCalendarBridge({document});
window.addEventListener('pagehide',event=>{if(!event.persisted)destroy();});
