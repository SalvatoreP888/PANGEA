import {GRID_W,GRID_H} from './world.mjs';
import {YEAR} from './data.mjs';

const RESIDENT_CELL=8,RESIDENT_COLS=Math.ceil(GRID_W/RESIDENT_CELL),RESIDENT_ROWS=Math.ceil(GRID_H/RESIDENT_CELL);
/** Tick-local spatial lookup. Results retain the original resident-array order,
 * including membership for this tick, so random social choices stay identical. */
export class ResidentIndex {
  constructor(people){
    this.people=people;this.ranks=new Map();this.cells=new Int16Array(people.length);
    // Tiny villages are cheaper to scan; larger towns allocate only used cells.
    this.buckets=people.length>=64?new Array(RESIDENT_COLS*RESIDENT_ROWS):null;
    this.matches=new Uint32Array(Math.ceil(people.length/32));
    this.ageMatches=new Uint32Array(this.matches.length);this.patients=new Uint8Array(people.length);this.firstPatient=people.length;
    for(let i=0;i<people.length;i++){const p=people[i],cell=this.cell(p);this.ranks.set(p.id,i);this.cells[i]=cell;if(this.buckets)(this.buckets[cell]??=new Set()).add(i);this.updatePatient(p);}
  }
  cell(p){return Math.floor(p.y/RESIDENT_CELL)*RESIDENT_COLS+Math.floor(p.x/RESIDENT_CELL);}
  move(p){
    if(!this.buckets)return;
    const rank=this.ranks.get(p.id);if(rank===undefined)return;
    const next=this.cell(p),prior=this.cells[rank];if(next===prior)return;
    this.buckets[prior].delete(rank);(this.buckets[next]??=new Set()).add(rank);this.cells[rank]=next;
  }
  updatePatient(p){
    const rank=this.ranks.get(p.id);if(rank===undefined)return;
    const needsCare=p.health<75||p.sick>0;this.patients[rank]=needsCare?1:0;
    if(needsCare&&rank<this.firstPatient)this.firstPatient=rank;
    else if(!needsCare&&rank===this.firstPatient)while(this.firstPatient<this.people.length&&!this.patients[this.firstPatient])this.firstPatient++;
  }
  patient(){return this.people[this.firstPatient];}
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
