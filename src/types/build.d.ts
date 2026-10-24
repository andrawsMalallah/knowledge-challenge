/** The build needs only this Node API; avoid a runtime dependency for its types. */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readFileSync(path:string):Uint8Array;
  export function readdirSync(path:string,options:{withFileTypes:true}):{name:string;isDirectory():boolean}[];
}
declare module 'node:crypto' {
  interface Hash {update(value:string|Uint8Array):Hash;digest(encoding:'hex'):string;}
  export function createHash(algorithm:string):Hash;
}
