/** Optional legacy IsoCity art packs for the compact source download. */
import { mkdirSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
const baseline='b774dd7913103e9dd9ec51b2151893c22683886e';
mkdirSync('work',{recursive:true});const dir=mkdtempSync(resolve('work/isocity-assets-'));
const git=(args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','inherit']});
try {
  git(['clone','--depth','1','--filter=blob:none','--no-checkout','https://github.com/amilich/isometric-city.git',dir]);
  git(['-C',dir,'fetch','--depth','1','origin',baseline]);
  const paths=git(['-C',dir,'ls-tree','-r','--name-only',baseline,'public/assets']).trim().split('\n').filter(p=>p.endsWith('.webp'));
  git(['-C',dir,'checkout',baseline,'--',...paths]);
  for(const path of paths){mkdirSync(dirname(resolve(path)),{recursive:true});copyFileSync(resolve(dir,path),resolve(path));}
  console.log(`Restored ${paths.length} upstream WebP asset sheets from the documented baseline.`);
}finally {rmSync(dir,{recursive:true,force:true});}
