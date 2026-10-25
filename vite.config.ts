import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { preparePublic } from './scripts/database.mjs';
// Both development and production serve only the compiled database and copied assets.
preparePublic();
function contentFiles(directory:string):string[]{
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?contentFiles(`${directory}/${entry.name}`):[`${directory}/${entry.name}`]).sort();
}
// Apply the same global header policy to the local production preview used for acceptance.
const previewHeaders=Object.fromEntries(readFileSync('public/_headers','utf8').split(/\r?\n\s*\r?\n/)[0].split(/\r?\n/).slice(1).map(line=>{
  const separator=line.indexOf(':');return [line.slice(0,separator).trim(),line.slice(separator+1).trim()];
}));
export default defineConfig({ publicDir:'.generated/public', preview:{headers:previewHeaders}, plugins: [svelte(), {
  name: 'offline-shell',
  configureServer(server) {
    server.watcher.add(['database', 'storage', 'public']);
    server.watcher.on('all', (_event, path) => {
      const relativePath=path.replaceAll('\\','/');
      if (!/(?:^|\/)(database|storage|public)\//.test(relativePath) || relativePath.includes('.generated/')) return;
      try { preparePublic(); server.ws.send({type:'full-reload'}); }
      catch (error) { server.config.logger.error(String(error)); }
    });
  },
  generateBundle(_options, bundle) {
    const assets = ['/', '/index.html', '/manifest.webmanifest', '/images/icons/icon.svg', '/images/icons/icon-192.png', '/images/icons/icon-512.png',
      '/data/categories.json', '/data/questions/tiebreaker/questions.json', '/fonts/IBMPlexSansArabic-Regular.ttf', '/fonts/IBMPlexSansArabic-Bold.ttf',
      ...Object.keys(bundle).filter(name => /\.(js|css|woff2?)$/.test(name)).map(name => `/${name}`)];
    // Content-only releases need a fresh cache even when IDs/counts and bundled code are unchanged.
    const hash=createHash('sha256').update(assets.join('')).update(readFileSync('index.html'));
    // Include manifest, fonts and headers as well as question/media bytes: metadata-only releases update too.
    for(const path of contentFiles('.generated/public'))hash.update(path).update(readFileSync(path));
    const version=hash.digest('hex').slice(0,16);
    const worker = readFileSync('public/sw.js', 'utf8').replace("'trivia-shell-v1'", JSON.stringify(`trivia-shell-${version}`))
      .replace("['./', './index.html', './manifest.webmanifest']", JSON.stringify(assets));
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: worker });
  },
}] });
