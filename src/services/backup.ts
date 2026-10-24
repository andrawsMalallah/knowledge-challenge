import type { Session } from '../types/game';
import { readMedia } from './storage';
import { validateSession } from './sessionValidation';
import { hasImageSignature, validateImageBlob, IMAGE_MIMES, MAX_GAME_IMAGE_BYTES, imageExtension } from './imageValidation';

/** Portable backup v1: uncompressed ZIP, no external dependencies or executable payloads. */
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const MAX_ARCHIVE = 48 * 1024 * 1024;
const MAX_IMAGE = MAX_GAME_IMAGE_BYTES;
const MAX_JSON = 2 * 1024 * 1024;
const MAX_ENTRIES = 160;
const ACCEPTED_TYPES = new Set<string>(IMAGE_MIMES);
interface Entry { name: string; data: Uint8Array }
interface Manifest { format: 'arabic-trivia-backup'; version: 1; images: { source: string; file: string; mime: string }[] }

const crcTable = Array.from({length:256}, (_,n) => {
  for (let k=0;k<8;k++) n = n & 1 ? 0xedb88320 ^ (n>>>1) : n>>>1;
  return n >>> 0;
});
function crc32(bytes: Uint8Array):number {
  let n=0xffffffff;
  for (const byte of bytes) n=crcTable[(n ^ byte)&255] ^ (n>>>8);
  return (n ^ 0xffffffff)>>>0;
}
function u16(v:DataView,off:number,n:number){v.setUint16(off,n,true);}
function u32(v:DataView,off:number,n:number){v.setUint32(off,n,true);}
function imagePaths(game: Session): string[] {
  return [...new Set([
    ...game.categories.map(c=>c.image),
    ...game.tiles.map(t=>t.question.image),
    ...(game.tie?.questions ?? []).map(t=>t.image),
  ].filter((s):s is string=>!!s))].sort();
}
function validPath(path:string):boolean {return path.startsWith('/') && !path.startsWith('//') && !path.includes('..') && !/[\\\x00-\x1f?#]/.test(path);}
function imageMime(source:string, blob:Blob):string {
  if (!validPath(source) || !ACCEPTED_TYPES.has(blob.type) || blob.size===0 || blob.size>MAX_IMAGE) throw new Error('صورة غير صالحة في النسخة الاحتياطية');
  return blob.type;
}
function zip(entries:Entry[]):Blob {
  const chunks:Uint8Array[]=[]; const directory:Uint8Array[]=[]; let offset=0;
  for (const {name,data} of entries) {
    const filename=encoder.encode(name); const crc=crc32(data);
    const local=new Uint8Array(30+filename.length); const v=new DataView(local.buffer);
    u32(v,0,0x04034b50);u16(v,4,20);u16(v,6,0x800);u16(v,8,0);
    u32(v,14,crc);u32(v,18,data.length);u32(v,22,data.length);u16(v,26,filename.length);
    local.set(filename,30);chunks.push(local,data);
    const central=new Uint8Array(46+filename.length);const c=new DataView(central.buffer);
    u32(c,0,0x02014b50);u16(c,4,20);u16(c,6,20);u16(c,8,0x800);
    u32(c,16,crc);u32(c,20,data.length);u32(c,24,data.length);u16(c,28,filename.length);u32(c,42,offset);
    central.set(filename,46); directory.push(central);
    offset+=local.length+data.length;
  }
  const directoryLength=directory.reduce((sum,d)=>sum+d.length,0);
  const end=new Uint8Array(22);const e=new DataView(end.buffer);
  u32(e,0,0x06054b50);u16(e,8,entries.length);u16(e,10,entries.length);u32(e,12,directoryLength);u32(e,16,offset);
  const result = new Blob([...chunks,...directory,end].map(bytes => new Uint8Array(bytes).buffer),{type:'application/zip'});
  if (result.size>MAX_ARCHIVE) throw new Error('النسخة الاحتياطية كبيرة جدًا');
  return result;
}
export async function exportBackup(session:Session):Promise<Blob> {
  const paths=imagePaths(session);
  if(paths.length>MAX_ENTRIES-2) throw new Error('عدد الصور يتجاوز الحد المسموح');
  const manifest:Manifest={format:'arabic-trivia-backup',version:1,images:[]};
  const entries:Entry[]=[];
  for(const [index,path] of paths.entries()) {
    const blob=await readMedia(path);
    if(!blob) throw new Error(`صورة مفقودة: ${path}`);
    const mime=imageMime(path,blob);
    await validateImageBlob(blob, path);
    const bytes=new Uint8Array(await blob.arrayBuffer());
    const extension=imageExtension(mime);
    const file=`media/${index.toString().padStart(3,'0')}.${extension}`;
    manifest.images.push({source:path,file,mime});
    entries.push({name:file,data:bytes});
  }
  const sessionBytes=encoder.encode(JSON.stringify(session));
  if(sessionBytes.length>MAX_JSON) throw new Error('بيانات اللعبة كبيرة جدًا');
  entries.unshift({name:'session.json',data:sessionBytes});
  entries.unshift({name:'manifest.json',data:encoder.encode(JSON.stringify(manifest))});
  return zip(entries);
}
function unzipStored(buffer:ArrayBuffer):Map<string,Uint8Array> {
  if(buffer.byteLength<22 || buffer.byteLength>MAX_ARCHIVE) throw new Error('حجم النسخة الاحتياطية غير صالح');
  const data=new Uint8Array(buffer);const dv=new DataView(buffer);let end=-1;
  for(let p=data.length-22;p>=Math.max(0,data.length-65557);p--){if(dv.getUint32(p,true)===0x06054b50){end=p;break;}}
  if(end<0 || end+22+dv.getUint16(end+20,true)!==data.length) throw new Error('بنية ZIP غير صالحة');
  const count=dv.getUint16(end+10,true),total=dv.getUint16(end+8,true);
  const dirSize=dv.getUint32(end+12,true),dirOffset=dv.getUint32(end+16,true);
  if(count!==total || count<2 || count>MAX_ENTRIES || dirOffset+dirSize!==end) throw new Error('فهرس ZIP غير صالح');
  const result=new Map<string,Uint8Array>();let p=dirOffset;
  for(let i=0;i<count;i++) {
    if(p+46>end || dv.getUint32(p,true)!==0x02014b50) throw new Error('ZIP غير صالح');
    const flags=dv.getUint16(p+8,true),method=dv.getUint16(p+10,true);
    const crc=dv.getUint32(p+16,true),packed=dv.getUint32(p+20,true),size=dv.getUint32(p+24,true);
    const length=dv.getUint16(p+28,true),extra=dv.getUint16(p+30,true),comment=dv.getUint16(p+32,true),local=dv.getUint32(p+42,true);
    if(method!==0 || (flags&1) || !(flags&0x800) || packed!==size || size>MAX_IMAGE || length===0 || p+46+length+extra+comment>end) throw new Error('صيغة ZIP غير مدعومة');
    const name=decoder.decode(data.subarray(p+46,p+46+length));
    if(!/^(manifest\.json|session\.json|media\/[0-9]{3}\.(png|jpg|webp|avif|gif|svg))$/.test(name) || result.has(name)) throw new Error('ملفات ZIP غير متوقعة');
    if(local+30>dirOffset || dv.getUint32(local,true)!==0x04034b50 || dv.getUint16(local+8,true)!==0) throw new Error('ترويسة ZIP غير متطابقة');
    const localNameLength=dv.getUint16(local+26,true),localExtra=dv.getUint16(local+28,true);
    if(local+30+localNameLength+localExtra+size>dirOffset || decoder.decode(data.subarray(local+30,local+30+localNameLength))!==name) throw new Error('ملف ZIP تالف');
    const bytes=data.slice(local+30+localNameLength+localExtra,local+30+localNameLength+localExtra+size);
    if(crc32(bytes)!==crc) throw new Error('فشل التحقق من سلامة ZIP');
    result.set(name,bytes);p+=46+length+extra+comment;
  }
  if(p!==end) throw new Error('فهرس ZIP تالف');
  return result;
}
export interface ImportedBackup { session:Session; media:{source:string; blob:Blob}[] }
export function parseBackup(buffer:ArrayBuffer):ImportedBackup {
  const files=unzipStored(buffer);
  const manifestBytes=files.get('manifest.json'),sessionBytes=files.get('session.json');
  if(!manifestBytes || !sessionBytes || manifestBytes.length>65536 || sessionBytes.length>MAX_JSON) throw new Error('ملفات النسخة الاحتياطية ناقصة');
  const manifest:Manifest=JSON.parse(decoder.decode(manifestBytes));
  const session:unknown=JSON.parse(decoder.decode(sessionBytes));
  if(manifest?.format!=='arabic-trivia-backup'||manifest.version!==1||!Array.isArray(manifest.images)) throw new Error('نسخة احتياطية غير مدعومة');
  validateSession(session);
  const paths=imagePaths(session);
  if(manifest.images.length!==paths.length || files.size!==manifest.images.length+2) throw new Error('صور اللعبة غير مكتملة');
  const media:{source:string;blob:Blob}[]=[]; const seen=new Set<string>();
  for(const item of manifest.images){
    if(!item || typeof item.source!=='string'||!paths.includes(item.source)||seen.has(item.source)||typeof item.file!=='string'||!ACCEPTED_TYPES.has(item.mime)) throw new Error('مرجع صورة غير صالح');
    const bytes=files.get(item.file);
    if(!bytes||!bytes.length||bytes.length>MAX_IMAGE||!hasImageSignature(bytes,item.mime)||!item.file.endsWith('.'+imageExtension(item.mime))) throw new Error('صورة مفقودة أو غير صالحة');
    seen.add(item.source);media.push({source:item.source,blob:new Blob([new Uint8Array(bytes).buffer],{type:item.mime})});
  }
  return {session,media};
}
