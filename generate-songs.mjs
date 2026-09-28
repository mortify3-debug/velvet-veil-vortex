import { readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const musicDir='./music';
await mkdir(musicDir,{recursive:true});
const files=(await readdir(musicDir,{withFileTypes:true})).filter(x=>x.isFile() && /\.(mp3|m4a|ogg|wav)$/i.test(x.name)).map(x=>x.name).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'}));
const tracks=files.map(name=>({title:name.replace(/\.[^.]+$/,'').replace(/^\s*\d+\s*[-_.]\s*/,'').trim(),src:`./music/${encodeURIComponent(name).replace(/%2F/g,'/')}`,cover:'./assets/cover.png'}));
await writeFile('./songs.json',JSON.stringify(tracks,null,2)+'\n');
console.log(`Generated songs.json with ${tracks.length} track(s)`);
