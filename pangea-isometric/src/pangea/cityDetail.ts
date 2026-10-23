/** Small, stateful city art. Sprites are painted once per visible material,
 * growth stage and gait; rendering never adds people, crops or resources. */
import type { Building, Person } from './model';
import { hash } from './simulation/world.mjs';

const TAU=Math.PI*2;
const cropSprites=new Map<string,HTMLCanvasElement>();
const residentSprites=new Map<string,HTMLCanvasElement>();
const project=(a:number,b:number)=>({x:a-b,y:(a+b)*.6});
function line(c:CanvasRenderingContext2D,x:number,y:number,xx:number,yy:number,color:string,width:number) {
  c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(xx,yy);c.stroke();
}

/** Actual sowing, growth and ready-to-harvest states get distinct silhouettes.
 * A fallow field stays bare, including constructed preview fields not sown. */
export function drawCropField(c:CanvasRenderingContext2D,b:Building,x:number,y:number) {
  const crop=b.crop,sown=crop?.sown??!!crop?.growth;
  const stage=crop?.yield?6:sown?Math.max(1,Math.min(5,Math.floor((crop?.growth||0)/16)+1)):0;
  const key=`${b.type}:${stage}`;
  let sprite=cropSprites.get(key);
  if(!sprite){
    sprite=document.createElement('canvas');sprite.width=420;sprite.height=270;
    const p=sprite.getContext('2d')!;p.scale(2,2);p.translate(105,76);p.lineCap='round';
    const corners=[project(-43,-43),project(43,-43),project(43,43),project(-43,43)];
    p.beginPath();corners.forEach((v,i)=>i?p.lineTo(v.x,v.y):p.moveTo(v.x,v.y));p.closePath();
    p.fillStyle='#4a4a3266';p.save();p.translate(0,2);p.fill();p.restore();
    const soil=p.createLinearGradient(0,-52,0,52);soil.addColorStop(0,'#87734d');soil.addColorStop(1,'#65573b');p.fillStyle=soil;p.fill();
    p.strokeStyle='#b19b6c';p.lineWidth=1.1;p.stroke();
    for(let row=0;row<12;row++){
      const a=-39+row*7.1,from=project(a,-40),to=project(a,40);
      line(p,from.x,from.y,to.x,to.y,'#3f392a7a',2.5);
      line(p,from.x+1,from.y, to.x+1,to.y,'#baa17166',.75);
    }
    // Paint back to front, so plants have depth rather than a flat row texture.
    if(stage)for(let sum=0;sum<30;sum++)for(let row=0;row<12;row++){
      const col=sum-row;if(col<0||col>=18)continue;
      const q=hash(row,col,713),a=-39+row*7.1+(q-.5)*1.8,v=project(a,-39+col*4.5);
      const height=stage===6?7:1.2+stage*1.05+q*1.5;
      if(b.type==='farm'){
        const size=stage===6?3:1+stage*.35;
        line(p,v.x,v.y,v.x,v.y-height*.6,'#4b613a',.7);
        p.fillStyle=stage===6?'#a2aa57':q>.5?'#839556':'#627d47';
        p.beginPath();p.ellipse(v.x-1,v.y-height*.45,size,size*.45,-.4,0,TAU);p.ellipse(v.x+1,v.y-height*.6,size*.8,size*.42,.4,0,TAU);p.fill();
        if(stage===6&&q>.6){p.fillStyle='#d1b674';p.beginPath();p.ellipse(v.x,v.y-1,1.3,.9,0,0,TAU);p.fill();}
      }else{
        const ripe=stage===6,wheat=b.type==='wheatfield';
        line(p,v.x,v.y,v.x+(q-.5)*1.4,v.y-height,ripe?(wheat?'#c8ad63':'#aaa67a'):'#7e965d',.85);
        if(stage>2){
          line(p,v.x,v.y-height*.4,v.x-2,v.y-height*.65,ripe?'#aa9b5d':'#648454',.6);
          p.fillStyle=wheat?(ripe?'#e0c37d':'#a3b575'):stage>3?'#b4b9dd':'#8ea578';
          p.beginPath();p.ellipse(v.x+(q-.5)*1.4,v.y-height,wheat?.95:1.35,wheat?2:.95,wheat?-.2:0,0,TAU);p.fill();
        }
      }
    }
    // Low boundary stakes describe a cultivated plot without adding a fence.
    for(const [a,b]of [[-43,43],[43,43],[43,-43]]){const v=project(a,b);line(p,v.x,v.y,v.x,v.y-5,'#635237',1.8);line(p,v.x-.3,v.y-5,v.x+.7,v.y-5,'#d4bd8e',1.2);}
    cropSprites.set(key,sprite);
  }
  c.drawImage(sprite,x-105,y-76,210,135);
}

/** A bounded atlas shared by all residents: actual clothing color, age scale,
 * stable hair/skin variation, movement direction and task-driven walking. */
export function drawResident(c:CanvasRenderingContext2D,person:Person,x:number,y:number,time:number,reducedMotion:boolean) {
  const task=person.task,target=task?.path?.[task.index||0];
  const dx=target?target.x-person.x:0,dy=target?target.y-person.y:0;
  const facing=dx-dy<0?-1:1,back=dx+dy<0;
  const walking=task?.stage==='walk'&&!reducedMotion;
  const gait=walking?Math.floor(time*7+person.id*.71)%4:0;
  const variant=person.id%4,key=`${person.color}:${variant}:${facing}:${back?1:0}:${gait}`;
  let sprite=residentSprites.get(key);
  if(!sprite){
    sprite=document.createElement('canvas');sprite.width=36;sprite.height=40;
    const p=sprite.getContext('2d')!;p.scale(2,2);p.translate(9,17);p.scale(facing,1);p.lineCap='round';
    const stride=[0,1.3,0,-1.3][gait];
    line(p,-1.2,-2,-1.4+stride,.8,'#303b38',1.4);line(p,1,-2,1.2-stride,.8,'#303b38',1.4);
    line(p,-1.5+stride,.9,-.3+stride,.9,'#655342',1);line(p,.7-stride,.9,1.9-stride,.9,'#655342',1);
    const coat=p.createLinearGradient(-3,-7,3,-3);coat.addColorStop(0,person.color);coat.addColorStop(1,'#5e6b60');
    p.fillStyle=coat;p.beginPath();p.moveTo(-1.8,-8);p.quadraticCurveTo(-3,-5,-2.8,-2.2);p.quadraticCurveTo(0,-1.2,2.6,-2.2);p.lineTo(1.9,-8);p.closePath();p.fill();
    line(p,-2,-7,-2.8-stride*.5,-4.3,'#b9a081',1.1);line(p,2,-7,2.8+stride*.5,-4.3,'#b9a081',1.1);
    line(p,-2.1,-3,2,-3,'#675640',.65);
    p.fillStyle=['#d4b48c','#b68c69','#ceaa81','#a68265'][variant];p.beginPath();p.ellipse(0,-9.4,1.8,2.1,0,0,TAU);p.fill();
    p.fillStyle=['#514738','#766047','#494b41','#947755'][variant];p.beginPath();p.ellipse(-.3,-10.5,1.9,1.2,-.1,0,TAU);p.fill();
    if(back){p.fillRect(-1.7,-10.4,3.3,2.2);}else{p.fillStyle='#e5c79e';p.fillRect(1,-9.6,1.1,1.2);}
    if(variant===1){p.fillStyle='#b6a47d';p.beginPath();p.ellipse(0,-10.9,2.8,.65,0,0,TAU);p.fill();}
    // Imported worlds can carry arbitrary colors. Keep the atlas bounded.
    if(residentSprites.size>=512)residentSprites.delete(residentSprites.keys().next().value!);
    residentSprites.set(key,sprite);
  }
  const scale=person.ageDays<14*360?.78:1;
  c.fillStyle='#27372b55';c.beginPath();c.ellipse(x+2,y+1,4*scale,1.5*scale,.15,0,TAU);c.fill();
  c.drawImage(sprite,x-9*scale,y-17*scale,18*scale,20*scale);
}
