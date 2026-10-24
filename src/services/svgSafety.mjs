/** Deliberately small static SVG subset: no scripts, links, styles, entities or embedded media. */
export function safeSvg(bytes) {
  let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).trim();}catch{return false;}
  const stack=[];
  let position=0;let roots=0;
  for(const token of text.matchAll(/<\/?([A-Za-z][\w:-]*)([^<>]*?)\/?\s*>/g)){
    if(text.slice(position,token.index).trim())return false;
    position=token.index+token[0].length;
    const tag=token[1];
    if(!['svg','g','rect','circle','ellipse','path','polygon','polyline','line'].includes(tag))return false;
    if(token[0].startsWith('</')){if(token[2].trim() || stack.pop()!==tag)return false;continue;}
    if(!stack.length){if(tag!=='svg'||roots++)return false;}else if(tag==='svg')return false;
    let attributes=token[2].trim();const seen=new Set();
    while(attributes){
      const match=/^([A-Za-z][\w:-]*)\s*=\s*(["'])(.*?)\2\s*/.exec(attributes);
      if(!match || seen.has(match[1]))return false;
      seen.add(match[1]);attributes=attributes.slice(match[0].length);
      const [,name,,value]=match;
      if(name==='xmlns'){if(tag!=='svg'||value!=='http://www.w3.org/2000/svg')return false;}
      else if(name==='fill'||name==='stroke'){if(!/^(?:#[a-fA-F0-9]{3,8}|[a-zA-Z]+)$/.test(value))return false;}
      else if(name==='d'){if(!/^[MmZzLlHhVvCcSsQqTtAaEe0-9+.,\s-]+$/.test(value))return false;}
      else if(['x','y','width','height','cx','cy','r','rx','ry','x1','y1','x2','y2','viewBox','points','stroke-width','opacity','fill-opacity'].includes(name)){
        if(!/^[0-9eE+.,\s-]+$/.test(value))return false;
      }else return false;
    }
    if(tag==='svg'){
      if(!seen.has('xmlns'))return false;
      const width=/\bwidth=["']([\d.]+)["']/.exec(token[0]);const height=/\bheight=["']([\d.]+)["']/.exec(token[0]);
      if(!width||!height||Number(width[1])<=0||Number(height[1])<=0||Number(width[1])*Number(height[1])>24_000_000)return false;
    }
    if(!/\/\s*>$/.test(token[0]))stack.push(tag);
  }
  return roots===1 && !stack.length && !text.slice(position).trim();
}
