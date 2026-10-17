/** All progression is explicit game data, not claims about real human development. */
export const YEAR = 360, STEPS_PER_DAY = 4, MAX_POPULATION = 2000;
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
export const COLORS = ['#d6ac76', '#8bbab3', '#c89aa0', '#98b78b', '#aaa3ca', '#c79c67', '#9bb7d1', '#c0b77e'];
export const GIVEN = ['Iris','Rowan','Mara','Tomas','Elowen','Kael','Liora','Finn','Sera','Ash','Nora','Orin','Eira','Bram','Mila','Theo','Ada','Maren','Silas','Rhea','Leif','Tala','Nico','Mae','Arlo','Vera','Pax','Eden','Cora','Jasper','Freya','Oren','Tess','Dara','Lucan','Wren','Hale','Aster','Reed','June'];
export const TOWN_NAMES = ['First Hearth','Willow Reach','Stonewater','Northwatch','Ember Vale','Dawnfield','Greyhaven','Fox Hollow','Oakmere','Windrest','Stillwater','Sunward'];
export const BUILDINGS = {
  fire: { name: 'Common hearth', cost: {wood: 8, stone: 4}, work: 10, tech: null, desc: 'A place to cook, socialize and keep warm.' },
  hut: { name: 'Timber home', cost: {wood: 28, stone: 6}, work: 32, tech: null, desc: 'Shelter for four people. Occupants sleep here.' },
  farm: { name: 'Crop field', cost: {wood: 16, stone: 3}, work: 22, tech: 'agriculture', desc: 'Requires sowing and harvesting. Growth follows seasons and soil.' },
  well: { name: 'Village well', cost: {wood: 15, stone: 25}, work: 36, tech: 'masonry', desc: 'Reduces illness risk and softens drought damage to crops.' },
  store: { name: 'Granary', cost: {wood: 42, stone: 18}, work: 50, tech: 'preservation', desc: 'Reduces spoilage and raises the community food reserve target.' },
  workshop: { name: 'Tool workshop', cost: {wood: 46, stone: 28}, work: 62, tech: 'craft', desc: 'Turns wood and stone into tools that accelerate productive work.' },
  hall: { name: 'Meeting hall', cost: {wood: 76, stone: 48}, work: 94, tech: 'civic', desc: 'Improves research and provides a permanent gathering place.' },
  clinic: { name: 'Herbalist hut', cost: {wood: 35, stone: 20}, work: 48, tech: 'medicine', desc: 'Allows active treatment with gathered herbs.' }
};
Object.assign(BUILDINGS, {
  cottage: {name:'Courtyard cottage',beds:8,size:[2,2],cost:{wood:38,stone:16},work:42,tech:'urbanism',desc:'Eight beds around a shared courtyard; compact village housing.'},
  rowhouse: {name:'Terraced housing',beds:20,size:[2,2],cost:{wood:65,stone:65,iron:4},work:95,tech:'density',desc:'Twenty residents share a compact urban block.'},
  tenement: {name:'City tenement',beds:48,size:[2,2],cost:{wood:85,stone:110,iron:18},work:155,tech:'sanitation',desc:'Forty-eight beds. Dense housing supported by sanitation.'},
  apartment: {name:'Apartment block',beds:96,size:[3,2],cost:{stone:180,steel:40,goods:12},work:240,tech:'electricity',desc:'Ninety-six beds in an electrically serviced metropolitan block.'},
  sawmill: {name:'Sawmill',size:[2,2],cost:{wood:55,stone:20},work:65,tech:'forestry',desc:'Workers recover 50% more usable timber from each forestry job.'},
  mine: {name:'Mining camp',size:[2,2],cost:{wood:50,stone:35,tools:4},work:70,tech:'mining',desc:'Miners gather finite iron ore and coal deposits.'},
  furnace: {name:'Iron foundry',size:[2,2],cost:{wood:65,stone:65},work:95,tech:'metallurgy',desc:'Smelt two ore and one coal into one iron. Requires a worker.'},
  steelworks: {name:'Steelworks',size:[3,2],cost:{stone:100,iron:30},work:140,tech:'steelmaking',desc:'Workers turn two iron and one coal into one steel for the railway.'},
  factory: {name:'Machine works',size:[3,2],cost:{stone:90,iron:22},work:115,tech:'mechanization',desc:'Turns timber and iron into machinery and manufactured goods.'},
  school: {name:'Village school',size:[2,2],cost:{wood:60,stone:40},work:80,tech:'education',desc:'Formal education doubles research productivity.'},
  university: {name:'University',size:[3,2],cost:{stone:160,iron:25},work:180,tech:'science',desc:'Specialist research doubles insight again.'},
  market: {name:'Market square',size:[2,2],cost:{wood:55,stone:35},work:65,tech:'trade',desc:'Coordinates intercity surplus deliveries and scarce building materials.'},
  station: {name:'Railway terminus',size:[3,2],cost:{wood:65,stone:90,steel:24},work:150,tech:'railways',desc:'Both ends of a railway need a terminus for freight and passengers.'}
});
BUILDINGS.hut.beds=4; BUILDINGS.hut.size=[1,1];
BUILDINGS.fire.size=[1,1]; BUILDINGS.well.size=[1,1];
BUILDINGS.farm.size=[3,3]; BUILDINGS.hall.size=[3,2];
const discoveries = [
 ['agriculture','Cultivation',0,'Food',80,[],'Unlock crop fields and seasonal harvests.'],
 ['masonry','Masonry',0,'Cities',150,['agriculture'],'Wells reduce illness and drought damage.'],
 ['preservation','Food preservation',0,'Food',180,['agriculture'],'Granaries reduce spoilage by 76%.'],
 ['craft','Craftsmanship',0,'Industry',220,['masonry'],'Workshops produce tools for faster work.'],
 ['medicine','Herbal medicine',0,'Cities',240,['preservation'],'Herbalists treat illness with gathered herbs.'],
 ['civic','Shared institutions',0,'Knowledge',280,['craft','preservation'],'Meeting halls raise research productivity by 70%.'],
 ['urbanism','Courtyard settlements',1,'Cities',320,['masonry'],'Compact cottages house eight residents each.'],
 ['roads','Graded dirt roads',1,'Transport',280,['craft'],'Unlock graded local lanes and intercity road engineering.'],
 ['carts','Wheel & axle',1,'Transport',350,['roads'],'Road convoys carry 60 cargo and 8 passengers.'],
 ['irrigation','Irrigation',1,'Food',380,['masonry','agriculture'],'Crops grow 30% faster and yield 35% more food.'],
 ['forestry','Managed forestry',1,'Industry',350,['craft'],'Sawmills raise timber recovery; woodland regrowth doubles.'],
 ['mining','Deep mining',1,'Industry',400,['craft'],'Mining camps access iron ore and coal deposits.'],
 ['education','Public learning',1,'Knowledge',420,['civic'],'Schools double insight from studying.'],
 ['trade','Regional markets',1,'Transport',400,['carts','preservation'],'Markets dispatch surplus food and industrial inputs.'],
 ['metallurgy','Ironworking',2,'Industry',500,['mining'],'Foundries smelt ore and coal into iron.'],
 ['paving','Stone highways',2,'Transport',520,['roads','metallurgy'],'Paved highways carry 140 cargo and 16 passengers.'],
 ['density','Terraced districts',2,'Cities',550,['urbanism','metallurgy'],'Twenty-bed rowhouses replace low-density growth.'],
 ['rotation','Crop rotation',2,'Food',550,['irrigation','education'],'Harvest yield rises another 50%.'],
 ['sanitation','Urban sanitation',2,'Cities',650,['density','medicine'],'Unlock 48-bed tenements; halve illness probability.'],
 ['science','Scientific method',2,'Knowledge',700,['education','metallurgy'],'Universities double research productivity.'],
 ['steelmaking','Steelmaking',3,'Industry',800,['metallurgy','science'],'Steelworks convert iron and coal into rail-grade steel.'],
 ['steam','Steam power',3,'Industry',850,['steelmaking'],'Steam engines increase mining output by 50%.'],
 ['mechanization','Machine tools',3,'Industry',850,['steam','forestry'],'Machine works produce goods; construction is 50% faster.'],
 ['railways','Steam railways',3,'Transport',950,['steam','paving'],'Stations and track: 480 cargo, 64 seats, coal-fired trains.'],
 ['agronomy','Mechanized agriculture',3,'Food',950,['rotation','mechanization'],'Double farm harvests and crop carrying capacity.'],
 ['electricity','Electrical engineering',4,'Cities',1200,['science','mechanization'],'96-bed apartment blocks support metropolitan density.'],
 ['electricRail','Electric railways',4,'Transport',1400,['electricity','railways'],'Electric service: 900 cargo, 128 seats; no coal fuel.'],
 ['logistics','Integrated logistics',4,'Transport',1300,['railways','trade'],'Freight protects 10 donor food days instead of 18.'],
 ['publicHealth','Public health',4,'Cities',1200,['sanitation','science'],'Clinics heal twice as much per treatment.'],
 ['networks','Research networks',4,'Knowledge',1500,['electricity','education'],'Research productivity rises another 50%.']
];
export const TECH=discoveries.map(([id,name,era,branch,cost,parents,effect])=>({id,name,era,branch,cost,parents,effect,minPopulation:[0,6,18,60,180][era]}));
export const ERAS=['Hearth & field','Villages & exchange','Stone cities','Steam & steel','Electric age'];
export const TRANSPORT=[
 {name:'Foot trail',short:'Trail',speed:1,cargo:20,seats:2,tech:null,cost:{},work:0,color:'#b89d73'},
 {name:'Graded dirt road',short:'Dirt road',speed:1.6,cargo:60,seats:8,tech:'carts',cost:{wood:40,stone:30},work:50,color:'#d4b583'},
 {name:'Paved highway',short:'Highway',speed:2.8,cargo:140,seats:16,tech:'paving',cost:{stone:120,iron:12},work:100,color:'#a7b4b0'},
 {name:'Steam railway',short:'Steam rail',speed:7,cargo:480,seats:64,tech:'railways',cost:{wood:80,steel:80},work:200,fuel:{coal:2},color:'#d5ba74'},
 {name:'Electric railway',short:'Electric rail',speed:12,cargo:900,seats:128,tech:'electricRail',cost:{steel:140,goods:60},work:300,color:'#94cfc3'}
];
export const RECIPES={
 smelt:{building:'furnace',inputs:{ore:2,coal:1},outputs:{iron:1},tech:'metallurgy'},
 steel:{building:'steelworks',inputs:{iron:2,coal:1},outputs:{steel:1},tech:'steelmaking'},
 manufacture:{building:'factory',inputs:{wood:2,iron:.5},outputs:{goods:1},tech:'mechanization'}
};
export const RESOURCE_NAMES = {food:'Raw food', meals:'Cooked meals', wood:'Timber', stone:'Stone', tools:'Tools', herbs:'Herbs',ore:'Iron ore',coal:'Coal',iron:'Iron',steel:'Steel',goods:'Machinery'};
export const SKILLS = ['foraging','forestry','building','farming','insight','care'];
export const TRAITS = ['Kind','Curious','Industrious','Cautious','Sociable','Restless'];
export const ACTION_NAMES = {eat:'Eating',rest:'Resting',social:'Socializing',forage:'Gathering food',wood:'Felling timber',stone:'Quarrying',build:'Building',farm:'Tending crops',cook:'Cooking',study:'Studying',craft:'Making tools',herbs:'Gathering herbs',care:'Giving care',play:'Playing',learn:'Learning',deliver:'Carrying supplies',travel:'Travelling',idle:'Taking a moment',ore:'Mining ore',coal:'Mining coal',smelt:'Smelting iron',steel:'Making steel',manufacture:'Making machinery',infrastructure:'Laying infrastructure'};

export const DEFAULT_PLANET={temperature:14,rainfall:1,stormFrequency:1,droughtFrequency:1,fertility:1,forestCover:1};
export const PLANET_RANGES={temperature:[-15,35],rainfall:[.25,2],stormFrequency:[0,3],droughtFrequency:[0,3],fertility:[.5,1.5],forestCover:[.25,2]};
export function planetSettings(values={}) {
  if(!values||typeof values!=='object'||Array.isArray(values))throw new Error('Invalid planet parameters');
  const result={...DEFAULT_PLANET};
  for(const [key,[min,max]]of Object.entries(PLANET_RANGES))if(values[key]!==undefined){
    const value=values[key];if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(`Invalid planet ${key}`);result[key]=value;
  }
  return result;
}
export const EDIBLE=['bread','meals','food','fish'];
Object.assign(RESOURCE_NAMES,{fish:'Fresh fish',grain:'Grain',flour:'Flour',bread:'Bread',clay:'Clay',bricks:'Bricks',flax:'Flax',cloth:'Cloth'});
Object.assign(ACTION_NAMES,{fish:'Fishing',clay:'Digging clay',mill:'Milling grain',bake:'Baking bread',fireBricks:'Firing bricks',weave:'Weaving cloth',preserveFish:'Preparing fish'});
Object.assign(ACTION_NAMES,{supply:'Collecting workshop inputs',deliverInput:'Supplying a workshop',haulOutput:'Collecting finished goods'});
Object.assign(BUILDINGS,{
 fishery:{name:'River fishery',size:[2,2],cost:{wood:28,stone:12},work:40,tech:'fishing',desc:'A staffed landing on a real riverbank or coast. Fish are carried home from a finite, renewing stock.'},
 wheatfield:{name:'Wheat field',size:[3,3],cost:{wood:18,stone:3},work:25,tech:'milling',desc:'Seasonal grain must be harvested, carried to storage, milled and baked.'},
 mill:{name:'Grain mill',size:[2,2],cost:{wood:36,stone:28},work:50,tech:'milling',desc:'A miller turns four grain into three flour. Milling losses are explicit.'},
 bakery:{name:'Bakery',size:[2,2],cost:{wood:28,stone:22},work:45,tech:'milling',desc:'A baker consumes three flour and half a timber fuel to bake three bread rations.'},
 claypit:{name:'Clay yard',size:[2,2],cost:{wood:22,stone:10},work:30,tech:'ceramics',desc:'Workers extract finite clay seams and deliver it for kiln firing.'},
 kiln:{name:'Brick kiln',size:[2,2],cost:{wood:30,stone:28},work:45,tech:'ceramics',desc:'Three clay and one timber fire into two bricks for dense urban housing.'},
 flaxfield:{name:'Flax field',size:[3,3],cost:{wood:16,stone:3},work:25,tech:'textiles',desc:'Seasonal flax provides fibre to the weaving shed.'},
 weaver:{name:'Weaving shed',size:[2,2],cost:{wood:32,stone:12},work:42,tech:'textiles',desc:'Three flax become one cloth. Cloth is used for machinery and winter warmth.'}
});
for(const [type,bricks]of [['rowhouse',8],['tenement',20],['apartment',40]])BUILDINGS[type].cost.bricks=bricks;
RECIPES.manufacture.inputs.cloth=.25;
Object.assign(RECIPES,{
 mill:{building:'mill',tech:'milling',inputs:{grain:4},outputs:{flour:3}},
 bake:{building:'bakery',tech:'milling',inputs:{flour:3,wood:.5},outputs:{bread:3}},
 fireBricks:{building:'kiln',tech:'ceramics',inputs:{clay:3,wood:1},outputs:{bricks:2}},
 weave:{building:'weaver',tech:'textiles',inputs:{flax:3},outputs:{cloth:1}},
 preserveFish:{building:'fishery',tech:'fishing',inputs:{fish:3,wood:.3},outputs:{meals:3}}
});
TECH.push(
 {id:'fishing',name:'River fisheries',era:0,branch:'Food',cost:110,parents:['agriculture'],minPopulation:0,effect:'Staff riverbank fisheries; catch and prepare renewable fish stocks.'},
 {id:'milling',name:'Grain & ovens',era:0,branch:'Food',cost:160,parents:['agriculture','masonry'],minPopulation:0,effect:'Wheat fields, grain mills and bakeries produce bread through a real supply chain.'},
 {id:'ceramics',name:'Fired clay',era:0,branch:'Industry',cost:170,parents:['masonry'],minPopulation:0,effect:'Clay yards and kilns supply bricks for denser housing.'},
 {id:'textiles',name:'Cultivated fibres',era:1,branch:'Industry',cost:320,parents:['craft','agriculture'],minPopulation:6,effect:'Flax fields and weaving sheds supply cloth for industry and winter warmth.'},
 {id:'aquaculture',name:'Managed fisheries',era:2,branch:'Food',cost:600,parents:['fishing','medicine'],minPopulation:18,effect:'Fish stocks recover twice as fast and catches improve by 40%.'},
 {id:'refrigeration',name:'Cold storage',era:4,branch:'Food',cost:1250,parents:['electricity','preservation'],minPopulation:180,effect:'Fish and bread spoil 80% more slowly.'}
);
export const SPECIES={
 human:{name:'Human',plural:'Humans',skin:'#e0bc94',accent:'#cbb382'},
 elf:{name:'Elf',plural:'Elves',skin:'#c9c8a0',accent:'#a7c9a0'},
 dwarf:{name:'Dwarf',plural:'Dwarves',skin:'#c89d7a',accent:'#c4aa90'},
 orc:{name:'Orc',plural:'Orcs',skin:'#94ae7b',accent:'#a9bc85'}
};
