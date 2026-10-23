/** Deterministically extract PANGEA architecture from the MIT IsoCity era sheets.
 * Run with `node scripts/prepare-pangea-era-art.mjs` from the application root.
 * Uses the existing sharp development dependency; no runtime image processing.
 */
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'public/pangea/buildings');
const revision='b774dd7913103e9dd9ec51b2151893c22683886e';
// id, source sheet, zero-based row/column, projected width, simulation era.
const selections=[
  ['hut','medeival',3,3,84,0],
  ['well','classics',1,0,76,0],
  ['store','medeival',4,1,109,0],
  ['workshop','medeival',4,3,110,0],
  ['hall','medeival',1,3,130,0],
  ['clinic','enlightenment',3,3,93,0],
  ['cottage','medeival',3,1,107,1],
  ['rowhouse','industrial',0,0,112,2],
  ['tenement','industrial',0,1,122,2],
  ['apartment','modern',0,0,100,4],
  ['sawmill','enlightenment',2,2,119,1],
  ['mine','industrial',4,2,112,1],
  ['furnace','industrial',4,1,117,2],
  ['steelworks','industrial',4,3,136,3],
  ['factory','industrial',0,2,137,3],
  ['school','enlightenment',1,4,123,1],
  ['university','enlightenment',2,0,132,2],
  ['market','medeival',2,0,127,1],
  ['station','industrial',5,0,139,3],
  ['fishery','medeival',5,0,134,0],
  ['mill','medeival',0,2,128,0],
  ['bakery','medeival',4,0,96,0],
  ['claypit','classics',4,2,108,0],
  ['kiln','medeival',4,2,112,0],
  ['weaver','medeival',3,4,101,1],
  ['hall-steam','industrial',5,2,130,3],
  ['clinic-health','modern',0,4,112,4],
  ['school-electric','modern',1,4,123,4],
  ['university-networks','modern',2,0,136,4],
  ['store-cold','modern',4,1,113,4],
];
const variants={
  hall:[{tech:'steam',id:'hall-steam'}],
  clinic:[{tech:'publicHealth',id:'clinic-health'}],
  school:[{tech:'electricity',id:'school-electric'}],
  university:[{tech:'networks',id:'university-networks'}],
  store:[{tech:'refrigeration',id:'store-cold'}],
};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

/** Flood only red matte connected to the cell perimeter. A stricter pass also
 * opens matte enclosed by architecture (e.g. gaps below a mill wheel). Unlike
 * a distance-to-pure-red filter this keeps brown brickwork and warm roofs.
 */
function removeMatte(data,width,height){
  const count=width*height,visited=new Uint8Array(count),queue=new Int32Array(count);
  const matte=(p,strong=false)=>{
    const i=p*4,r=data[i],g=data[i+1],b=data[i+2];
    return r>18&&r>g*(strong?3.4:2.3)&&r>b*(strong?2.6:1.8);
  };
  let tail=0;
  const enqueue=p=>{if(!visited[p]&&matte(p)){visited[p]=1;queue[tail++]=p;}};
  for(let x=0;x<width;x++){enqueue(x);enqueue((height-1)*width+x);}
  for(let y=1;y<height-1;y++){enqueue(y*width);enqueue(y*width+width-1);}
  for(let head=0;head<tail;head++){
    const p=queue[head],x=p%width,y=Math.floor(p/width);
    if(x)enqueue(p-1);if(x<width-1)enqueue(p+1);
    if(y)enqueue(p-width);if(y<height-1)enqueue(p+width);
  }
  for(let p=0;p<count;p++)if(visited[p]||matte(p,true)){
    const i=p*4;data[i]=0;data[i+1]=0;data[i+2]=0;data[i+3]=0;
  }
  // Remove red contamination from the one-pixel antialiased perimeter. Apply
  // only beside removed matte, preserving reddish details inside the sprite.
  for(let p=0;p<count;p++){
    const i=p*4;if(!data[i+3])continue;
    const x=p%width,y=Math.floor(p/width);
    const edge=(x>0&&visited[p-1])||(x<width-1&&visited[p+1])||(y>0&&visited[p-width])||(y<height-1&&visited[p+width]);
    const r=data[i],g=data[i+1],b=data[i+2];
    if(edge&&r>g*1.5&&r>b*1.3){
      data[i]=Math.min(r,Math.round(Math.max(g,b)*1.6));
      data[i+3]=Math.round(data[i+3]*.75);
    }
  }
  return data;
}

/** The upstream sheets are visual grids: some roofs/base diamonds cross the
 * mathematical row boundaries. Extract overlapping windows, then keep the main
 * connected building instead of clipping it or importing the preceding row's
 * detached footprint. Eight-neighbor connectivity preserves narrow diagonals.
 */
function isolateBuilding(data,width,height){
  const count=width*height,labels=new Int32Array(count),queue=new Int32Array(count);
  let label=0,bestLabel=0,bestArea=0;
  for(let start=0;start<count;start++){
    if(labels[start]||data[start*4+3]<=16)continue;
    label++;let tail=1;queue[0]=start;labels[start]=label;
    for(let head=0;head<tail;head++){
      const p=queue[head],x=p%width,y=Math.floor(p/width);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy)continue;
        const nx=x+dx,ny=y+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;
        const next=ny*width+nx;
        if(!labels[next]&&data[next*4+3]>16){labels[next]=label;queue[tail++]=next;}
      }
    }
    if(tail>bestArea){bestArea=tail;bestLabel=label;}
  }
  for(let p=0;p<count;p++)if(labels[p]!==bestLabel){
    const i=p*4;data[i]=0;data[i+1]=0;data[i+2]=0;data[i+3]=0;
  }
  return data;
}

await mkdir(output,{recursive:true});
const sheets=new Map();
for(const name of new Set(selections.map(s=>s[1]))){
  const bytes=await readFile(resolve(root,`public/assets/ages/${name}.webp`));
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  sheets.set(name,{data,width:info.width,height:info.height,sha256:sha256(bytes)});
}
const sprites={};
for(const [id,sheet,row,column,width,era] of selections){
  const source=sheets.get(sheet),left=Math.max(0,Math.round(column*source.width/5)-24),top=Math.max(0,Math.round(row*source.height/6)-60);
  const crop={left,top,width:Math.min(source.width,Math.round((column+1)*source.width/5)+24)-left,height:Math.min(source.height,Math.round((row+1)*source.height/6)+65)-top};
  const {data}=await sharp(source.data,{raw:{width:source.width,height:source.height,channels:4}}).extract(crop).raw().toBuffer({resolveWithObject:true});
  removeMatte(data,crop.width,crop.height);isolateBuilding(data,crop.width,crop.height);
  let minX=crop.width,minY=crop.height,maxX=0,maxY=0;
  for(let y=0;y<crop.height;y++)for(let x=0;x<crop.width;x++)if(data[(y*crop.width+x)*4+3]>16){
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
  }
  if(minX>maxX||minY>maxY)throw new Error(`Empty sprite: ${id}`);
  const trim={left:minX,top:minY,width:maxX-minX+1,height:maxY-minY+1};
  const pad=3;
  // Median of the opaque front edge anchors the base contact instead of
  // centering on the roof/tower, which drifts when architecture gets taller.
  const contact=[];
  for(let y=Math.max(minY,maxY-4);y<=maxY;y++)for(let x=minX;x<=maxX;x++)if(data[(y*crop.width+x)*4+3]>128)contact.push(x);
  contact.sort((a,b)=>a-b);
  const contactX=contact.length?contact[Math.floor(contact.length/2)]:(minX+maxX)/2;
  const size={width:trim.width+pad*2,height:trim.height+pad*2};
  const bytes=await sharp(data,{raw:{width:crop.width,height:crop.height,channels:4}}).extract(trim)
    .extend({top:pad,bottom:pad,left:pad,right:pad,background:{r:0,g:0,b:0,alpha:0}})
    .webp({quality:86,alphaQuality:100,effort:6}).toBuffer();
  await writeFile(resolve(output,`${id}.webp`),bytes);
  sprites[id]={id,src:`/pangea/buildings/${id}.webp`,width,era,size,
    anchor:{x:Number(((contactX-minX+pad)/size.width).toFixed(6)),y:Number(((trim.height-1+pad)/size.height).toFixed(6))},
    accent:{x:.5,y:.12},
    source:{sheet:`/assets/ages/${sheet}.webp`,row,column,sha256:source.sha256,crop,trim},
    sha256:sha256(bytes)};
}
const manifest={version:1,preparation:'scripts/prepare-pangea-era-art.mjs',
  attribution:{author:'amilich',project:'IsoCity',url:'https://github.com/amilich/isometric-city',revision,license:'MIT',
    changes:'Selected source cells with overlapping extraction windows; red matte and detached neighboring fragments removed; transparent bounds trimmed; floor-contact anchors normalized; compressed to WebP.'},
  procedural:['fire','farm','wheatfield','flaxfield'],variants,sprites};
const json=JSON.stringify(manifest,null,2)+'\n';
await writeFile(resolve(output,'manifest.json'),json);
await writeFile(resolve(root,'src/pangea/art-manifest.json'),json);
await copyFile(resolve(root,'LICENSE'),resolve(output,'IsoCity-MIT.txt'));
console.log(`Prepared ${selections.length} grounded building sprites from ${sheets.size} IsoCity era sheets.`);
