/** Normalize the generated atlas into independently anchored runtime sprites.
 * Crops follow inspected object bounds, because generated rows are not equal. */
import sharp from 'sharp';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source='docs/art/environment-source.png',output='public/pangea/environment';
const cells=[
 {name:'oak',left:0,top:0,width:480,height:540},
 {name:'fir-grove',left:480,top:0,width:420,height:540},
 {name:'linden',left:900,top:0,width:430,height:540},
 {name:'slate-outcrop',left:1330,top:0,width:444,height:540},
 {name:'alpine-ridge',left:0,top:545,width:565,height:342},
 {name:'rocky-hill',left:565,top:545,width:410,height:342},
 {name:'meadow-shrubs',left:975,top:545,width:375,height:342},
 {name:'wetland-reeds',left:1350,top:545,width:424,height:342},
];
mkdirSync(output,{recursive:true});
const sprites=[];
for(let i=0;i<cells.length;i++){
 const {name,...crop}=cells[i];
 const cropped=await sharp(source).extract(crop).toBuffer();
 const buffer=await sharp(cropped).trim({threshold:12}).resize({width:384,withoutEnlargement:true}).webp({quality:88,alphaQuality:100}).toBuffer();
 const metadata=await sharp(buffer).metadata();writeFileSync(`${output}/${i}.webp`,buffer);
 sprites.push({id:i,name,file:`/pangea/environment/${i}.webp`,crop,width:metadata.width,height:metadata.height,sha256:createHash('sha256').update(buffer).digest('hex')});
}
writeFileSync(`${output}/manifest.json`,JSON.stringify({source,sourceSha256:createHash('sha256').update(readFileSync(source)).digest('hex'),provenance:'Generated for PANGEA with OpenAI ImageGen, 2026-10-23. Original retained; runtime crops/trim/WebP normalization only.',sprites},null,2)+'\n');
console.log('Prepared eight environment sprites.');
