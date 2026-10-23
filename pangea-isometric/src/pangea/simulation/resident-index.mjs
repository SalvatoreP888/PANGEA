import {GRID_W,GRID_H} from './world.mjs';
import {YEAR} from './data.mjs';

const RESIDENT_CELL=8,RESIDENT_COLS=Math.ceil(GRID_W/RESIDENT_CELL),RESIDENT_ROWS=Math.ceil(GRID_H/RESIDENT_CELL),SOCIAL_QUERY_LIMIT=32;
const bitCount=value=>{value-=(value>>>1)&0x55555555;value=(value&0x33333333)+((value>>>2)&0x33333333);return (((value+(value>>>4))&0x0f0f0f0f)*0x01010101)>>>24;};
/** Tick-local spatial lookup. Results retain the original resident-array order,
 * including membership for this tick, so random social choices stay identical. */
export class ResidentIndex {
  constructor(people){
    this.people=people;this.ranks=new Map();this.cells=new Int16Array(people.length);
    // Tiny villages are cheaper to scan; larger towns allocate only used cells.
    this.buckets=people.length>=64?new Array(RESIDENT_COLS*RESIDENT_ROWS):null;
    this.matches=new Uint32Array(Math.ceil(people.length/32));
    this.ageMatches=new Uint32Array(this.matches.length);this.patients=new Uint8Array(people.length);this.firstPatient=people.length;
    this.positions=new Int16Array(people.length);this.adultBits=new Uint32Array(this.matches.length);this.socialQueries=new Map();
    for(let i=0;i<people.length;i++){const p=people[i],cell=this.cell(p);this.ranks.set(p.id,i);this.cells[i]=cell;this.positions[i]=p.y*GRID_W+p.x;if(p.ageDays>=18*YEAR)this.adultBits[i>>>5]|=1<<(i&31);if(this.buckets)(this.buckets[cell]??=new Set()).add(i);this.updatePatient(p);}
  }
  cell(p){return Math.floor(p.y/RESIDENT_CELL)*RESIDENT_COLS+Math.floor(p.x/RESIDENT_CELL);}
  move(p){
    if(!this.buckets)return;
    const rank=this.ranks.get(p.id);if(rank===undefined)return;
    const position=p.y*GRID_W+p.x;if(this.positions[rank]===position)return;this.positions[rank]=position;
    const next=this.cell(p),prior=this.cells[rank];
    if(next!==prior){this.buckets[prior].delete(rank);(this.buckets[next]??=new Set()).add(rank);this.cells[rank]=next;}
    // A meeting tile can serve many social turns. Maintain its ordered membership
    // as actors move, including moves within a spatial bucket. Tick membership and
    // age groups remain the original resident snapshot, including same-tick deaths.
    const word=rank>>>5,mask=1<<(rank&31),adult=!!(this.adultBits[word]&mask);
    for(const query of this.socialQueries.values()){
      const dx=p.x-query.x,dy=p.y-query.y,inside=dx*dx+dy*dy<400;
      if(inside===!!(query.bits[word]&mask))continue;
      const delta=inside?1:-1;query.bits[word]^=mask;query.count+=delta;if(adult)query.adults+=delta;
    }
  }
  updatePatient(p){
    const rank=this.ranks.get(p.id);if(rank===undefined)return;
    const needsCare=p.health<75||p.sick>0;this.patients[rank]=needsCare?1:0;
    if(needsCare&&rank<this.firstPatient)this.firstPatient=rank;
    else if(!needsCare&&rank===this.firstPatient)while(this.firstPatient<this.people.length&&!this.patients[this.firstPatient])this.firstPatient++;
  }
  patient(){return this.people[this.firstPatient];}
  /** Choose the same ordered, age-compatible social contact as nearby(...,20,true)
   * without allocating a large pool just to pick one element. random(size) is
   * called exactly once for a nonempty pool, and never for an empty one. */
  socialContact(p,random){
    if(!this.buckets){const pool=this.nearby(p,20,true);return pool.length?pool[random(pool.length)]:undefined;}
    const key=p.y*GRID_W+p.x;let query=this.socialQueries.get(key);
    if(query){this.socialQueries.delete(key);this.socialQueries.set(key,query);}
    else {
      query={x:p.x,y:p.y,bits:new Uint32Array(this.matches.length),count:0,adults:0};
      const x0=Math.max(0,Math.floor((p.x-20)/RESIDENT_CELL)),x1=Math.min(RESIDENT_COLS-1,Math.floor((p.x+20)/RESIDENT_CELL));
      const y0=Math.max(0,Math.floor((p.y-20)/RESIDENT_CELL)),y1=Math.min(RESIDENT_ROWS-1,Math.floor((p.y+20)/RESIDENT_CELL));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
        const bucket=this.buckets[y*RESIDENT_COLS+x];if(!bucket)continue;
        for(const rank of bucket){const q=this.people[rank],dx=q.x-p.x,dy=q.y-p.y;if(dx*dx+dy*dy>=400)continue;
          const word=rank>>>5,mask=1<<(rank&31);query.bits[word]|=mask;query.count++;if(this.adultBits[word]&mask)query.adults++;
        }
      }
      this.socialQueries.set(key,query);if(this.socialQueries.size>SOCIAL_QUERY_LIMIT)this.socialQueries.delete(this.socialQueries.keys().next().value);
    }
    const rank=this.ranks.get(p.id),word=rank===undefined?-1:rank>>>5,mask=rank===undefined?0:1<<(rank&31);
    const self=word>=0&&!!(query.bits[word]&mask),adult=p.ageDays>=18*YEAR;
    const compatible=(adult?query.adults:query.count-query.adults)-(self?1:0),preferAge=compatible>0;
    const count=preferAge?compatible:query.count-(self?1:0);if(!count)return;
    let chosen=random(count);
    for(let i=0;i<query.bits.length;i++){
      let bits=query.bits[i];if(preferAge)bits&=adult?this.adultBits[i]:~this.adultBits[i];if(i===word)bits&=~mask;
      const size=bitCount(bits);if(chosen>=size){chosen-=size;continue;}
      while(chosen-->0)bits&=bits-1;
      return this.people[i*32+31-Math.clz32(bits&-bits)];
    }
  }
  nearby(p,radius=20,preferAgeGroup=false){
    if(!this.buckets){const all=this.people.filter(q=>q.id!==p.id&&Math.hypot(q.x-p.x,q.y-p.y)<radius);if(!preferAgeGroup)return all;const same=all.filter(q=>(q.ageDays>=18*YEAR)===(p.ageDays>=18*YEAR));return same.length?same:all;}
    let bits=this.matches;bits.fill(0);this.ageMatches.fill(0);let compatible=false;
    const adult=p.ageDays>=18*YEAR,radiusSquared=radius*radius;
    const x0=Math.max(0,Math.floor((p.x-radius)/RESIDENT_CELL)),x1=Math.min(RESIDENT_COLS-1,Math.floor((p.x+radius)/RESIDENT_CELL));
    const y0=Math.max(0,Math.floor((p.y-radius)/RESIDENT_CELL)),y1=Math.min(RESIDENT_ROWS-1,Math.floor((p.y+radius)/RESIDENT_CELL));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const bucket=this.buckets[y*RESIDENT_COLS+x];if(!bucket)continue;
      for(const rank of bucket){
        const q=this.people[rank],dx=q.x-p.x,dy=q.y-p.y;
        if(q.id!==p.id&&dx*dx+dy*dy<radiusSquared){
          bits[rank>>>5]|=1<<(rank&31);
          if(preferAgeGroup&&(q.ageDays>=18*YEAR)===adult){this.ageMatches[rank>>>5]|=1<<(rank&31);compatible=true;}
        }
      }
    }
    if(compatible)bits=this.ageMatches;
    const result=[];
    // Ordered bit iteration avoids sorting moved buckets or scanning every person.
    for(let i=0;i<bits.length;i++){let word=bits[i];while(word){const bit=31-Math.clz32(word&-word);result.push(this.people[i*32+bit]);word=(word&(word-1))>>>0;}}
    return result;
  }
}
