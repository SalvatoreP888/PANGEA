/** Package the real PANGEA React application as one self-contained offline file. */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const output=resolve(process.argv[2]||'dist/PANGEA.html');
const data=(file,type)=>`data:${type};base64,${readFileSync(resolve('public/pangea',file)).toString('base64')}`;
const assets={
  '/pangea/atlas.png':data('atlas.webp','image/webp'),
  '/pangea/ground.png':data('ground.webp','image/webp'),
  '/pangea/manrope.ttf':data('manrope.ttf','font/ttf'),
  '/pangea/manrope-semibold.ttf':data('manrope-semibold.ttf','font/ttf'),
};
for(const file of readdirSync('public/pangea/buildings').filter(f=>f.endsWith('.webp'))){assets[`/pangea/buildings/${file}`]=data(`buildings/${file}`,'image/webp');}
for(const file of readdirSync('public/pangea/environment').filter(f=>f.endsWith('.webp'))){assets[`/pangea/environment/${file}`]=data(`environment/${file}`,'image/webp');}
const result=await build({
  stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Pangea from './src/pangea/components/Pangea';createRoot(document.getElementById('root')).render(<Pangea/>);",resolveDir:process.cwd(),loader:'tsx'},
  external:['/pangea/*'],bundle:true,write:false,outdir:'standalone',format:'iife',minify:true,jsx:'automatic',target:['es2020'],
  define:{'process.env.NODE_ENV':'"production"'},
  plugins:[{name:'offline',setup(b){
    b.onResolve({filter:/^next\/link$/},()=>({path:'next-link',namespace:'offline-link'}));
    b.onLoad({filter:/.*/,namespace:'offline-link'},()=>({contents:"import React from 'react';export default function Link({href,children,...props}){return React.createElement('a',{...props,href:href==='/'?'#':href},children)}",loader:'js',resolveDir:process.cwd()}));
    b.onLoad({filter:/renderer\.ts$/},args=>{let contents=readFileSync(args.path,'utf8');for(const [url,value] of Object.entries(assets))contents=contents.replaceAll(url,value);return {contents,loader:'ts'};});
  }}],
});
let css=result.outputFiles.find(f=>f.path.endsWith('.css')).text;
for(const [url,value]of Object.entries(assets))css=css.replaceAll(url,value);
let js=result.outputFiles.find(f=>f.path.endsWith('.js')).text.replaceAll('href:"/isocity"','href:"https://iso-city.com"').replaceAll('</script','<\\/script');
for(const [url,value]of Object.entries(assets))js=js.replaceAll(url,value);
mkdirSync(resolve(output,'..'),{recursive:true});
writeFileSync(output,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#171e20"><title>PANGEA — A living world</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}button,input{font:inherit}${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`);
console.log(`Built self-contained PANGEA: ${output} (${(readFileSync(output).length/1024/1024).toFixed(1)} MB)`);
