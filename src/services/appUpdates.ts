export interface AppUpdate { worker:ServiceWorker;version:string; }
const KEY='arabic-trivia:update-dismissed:v1';
const VERSION=/^trivia-shell-[a-f0-9-]{1,32}$/;
export function deferredUpdateVersion():string {
  try {const value=localStorage.getItem(KEY);return value && VERSION.test(value)?value:'';}catch{return '';}
}
export function deferUpdate(version:string):void {
  if(!VERSION.test(version))return;
  try{localStorage.setItem(KEY,version);}catch{/* The current page still remembers dismissal when storage is unavailable. */}
}
/** Ask the waiting worker itself; the script URL stays the same between builds. */
export function identifyUpdate(worker:ServiceWorker):Promise<AppUpdate> {
  return new Promise((resolve,reject)=>{
    const channel=new MessageChannel();
    const close=()=>{clearTimeout(timeout);channel.port1.close();channel.port2.close();};
    const timeout=setTimeout(()=>{close();reject(new Error('Update version unavailable'));},3000);
    channel.port1.onmessage=event=>{
      const version=event.data?.version;
      close();
      if(typeof version==='string' && VERSION.test(version))resolve({worker,version});
      else reject(new Error('Invalid update version'));
    };
    try{worker.postMessage({type:'GET_VERSION'},[channel.port2]);}catch(error){close();reject(error);}
  });
}
