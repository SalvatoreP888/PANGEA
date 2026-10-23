import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {build} from 'esbuild';
import {BUILDINGS} from '../../src/pangea/simulation/data.mjs';

const app=new URL('../../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('src/pangea/art-manifest.json',app),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceKey=id=>{
  const art=manifest.sprites[id];
  return `${art.source.sheet}:${art.source.row}:${art.source.column}`;
};

test('Every simulation building has explicit artwork or a stateful procedural renderer',()=>{
  const actual=Object.keys(manifest.sprites).filter(id=>id in BUILDINGS);
  assert.deepEqual([...actual,...manifest.procedural].sort(),Object.keys(BUILDINGS).sort());
  for(const type of ['hut','cottage','rowhouse','tenement','apartment'])assert.ok(manifest.sprites[type]);
  assert.equal(new Set(['hut','cottage','rowhouse','tenement','apartment'].map(sourceKey)).size,5);
  assert.equal(new Set(['workshop','sawmill','mine','furnace','steelworks','factory','kiln'].map(sourceKey)).size,7);
  assert.ok(manifest.sprites.apartment.era>manifest.sprites.hut.era);
  for(const [type,variants] of Object.entries(manifest.variants)){
    assert.ok(manifest.sprites[type]);
    for(const variant of variants){assert.ok(variant.tech);assert.ok(manifest.sprites[variant.id]);}
  }
  assert.ok(!['hut','cottage','rowhouse','tenement','apartment'].some(type=>manifest.variants[type]),'research cannot invent installed dense housing');
});

test('Public art API follows discoveries, preserves actual housing, and aligns floor contacts',async()=>{
  const result=await build({entryPoints:[new URL('src/pangea/art.ts',app).pathname],bundle:true,platform:'node',format:'esm',write:false});
  const api=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  assert.equal(api.buildingArt('clinic').id,'clinic');
  assert.equal(api.buildingArt('clinic',['publicHealth']).id,'clinic-health');
  assert.equal(api.buildingArt('hall',['steam']).id,'hall-steam');
  assert.equal(api.buildingArt('store',['refrigeration']).id,'store-cold');
  for(const type of ['hut','cottage','rowhouse','tenement','apartment']){
    assert.equal(api.buildingArt(type,['electricity','networks','publicHealth','steam']).id,type);
  }
  assert.equal(api.buildingArt('future-save-building'),undefined);
  assert.equal(api.buildingArt('wheatfield'),undefined);
  const art=api.buildingArt('apartment'),rect=api.buildingArtRect(art,200,300);
  assert.ok(Math.abs(rect.x+rect.width*art.anchor.x-200)<1e-8);
  assert.ok(Math.abs(rect.y+rect.height*art.anchor.y-300)<1e-8);
  assert.ok(rect.height>api.buildingArtRect(api.buildingArt('hut'),200,300).height);
  const images=await api.loadBuildingArt(async src=>{
    if(src.endsWith('/hut.webp'))throw new Error('optional sprite unavailable');
    return {src};
  });
  assert.equal(images.size,api.BUILDING_ART_SOURCES.length-1);
  assert.equal(images.has('/pangea/buildings/hut.webp'),false);
  assert.equal(images.get('/pangea/buildings/apartment.webp').src,'/pangea/buildings/apartment.webp');
});

test('Prepared sprites retain source provenance, contact anchors and transparent borders',async()=>{
  const sources=new Map();
  for(const art of Object.values(manifest.sprites)){
    const source=art.source;
    if(!sources.has(source.sheet))sources.set(source.sheet,hash(await readFile(new URL(`public${source.sheet}`,app))));
    assert.equal(source.sha256,sources.get(source.sheet),`source changed: ${art.id}`);
    assert.ok(source.row>=0&&source.row<6&&source.column>=0&&source.column<5);
    const bytes=await readFile(new URL(`public${art.src}`,app));
    assert.equal(hash(bytes),art.sha256,`prepared asset changed: ${art.id}`);
    const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.deepEqual({width:info.width,height:info.height},art.size);
    assert.ok(art.anchor.x>.15&&art.anchor.x<.85,`base contact outside footprint: ${art.id}`);
    assert.ok(art.anchor.y>.9&&art.anchor.y<1);
    assert.ok(art.width>=70&&art.width<=150);
    let visible=0,redMatte=0;
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
      const i=(y*info.width+x)*4,a=data[i+3];
      if(x===0||y===0||x===info.width-1||y===info.height-1)assert.equal(a,0,`clipped border: ${art.id}`);
      if(a>16){visible++;if(data[i]>data[i+1]*3.4&&data[i]>data[i+2]*2.6&&data[i]>18)redMatte++;}
    }
    assert.ok(visible>info.width*info.height*.1,`empty sprite: ${art.id}`);
    assert.ok(redMatte/visible<.003,`red matte leaked: ${art.id}`);
  }
  assert.equal(manifest.attribution.license,'MIT');
  assert.match(manifest.attribution.revision,/^[a-f0-9]{40}$/);
  const notice=await readFile(new URL('public/pangea/buildings/IsoCity-MIT.txt',app),'utf8');
  assert.match(notice,/Copyright \(c\) 2025 amilich/);
});
