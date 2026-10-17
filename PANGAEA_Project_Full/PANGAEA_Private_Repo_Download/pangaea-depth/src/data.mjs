/** All progression is explicit game data, not claims about real human development. */
export const YEAR = 360, STEPS_PER_DAY = 4, MAX_POPULATION = 250;
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
export const TECH = [
  {id:'agriculture', name:'Cultivation', cost:80, parents:[], effect:'Sow fields instead of relying on wild food.'},
  {id:'masonry', name:'Masonry', cost:150, parents:['agriculture'], effect:'Wells reduce illness and drought losses.'},
  {id:'preservation', name:'Food preservation', cost:240, parents:['agriculture'], effect:'Granaries reduce food spoilage.'},
  {id:'craft', name:'Craftsmanship', cost:360, parents:['masonry'], effect:'Build workshops and craft durable tools.'},
  {id:'medicine', name:'Herbal medicine', cost:420, parents:['preservation'], effect:'Build herbalist huts and treat illness.'},
  {id:'civic', name:'Shared institutions', cost:580, parents:['craft','preservation'], effect:'Meeting halls accelerate shared learning.'}
];
export const RESOURCE_NAMES = {food:'Raw food', meals:'Cooked meals', wood:'Timber', stone:'Stone', tools:'Tools', herbs:'Herbs'};
export const SKILLS = ['foraging','forestry','building','farming','insight','care'];
export const TRAITS = ['Kind','Curious','Industrious','Cautious','Sociable','Restless'];
export const ACTION_NAMES = {eat:'Eating',rest:'Resting',social:'Socializing',forage:'Gathering food',wood:'Felling timber',stone:'Quarrying',build:'Building',farm:'Tending crops',cook:'Cooking',study:'Studying',craft:'Making tools',herbs:'Gathering herbs',care:'Giving care',play:'Playing',learn:'Learning',deliver:'Carrying supplies',travel:'Travelling',idle:'Taking a moment'};
