/** Keep complete license text inside the online app and offline export. */
import {readFileSync,writeFileSync} from 'node:fs';
const records=[
 ['IsoCity','https://github.com/amilich/isometric-city','b774dd7913103e9dd9ec51b2151893c22683886e','MIT','Foundation, projection, tile drawing, image cache, lighting utilities and adapted era artwork.','LICENSE'],
 ['simplex-noise.js','https://github.com/jwagner/simplex-noise.js','6bfff874f5f0efed6375a9bf27fbd39b3cec6b4e','MIT','Pinned 2D coherent noise, adapted to ESM with isolated deterministic random input.','src/pangea/simulation/vendor/simplex-noise.LICENSE'],
 ['Mapgen4 / Red Blob Games','https://github.com/redblobgames/mapgen4','c1d8cb018a11a8b9e17d59233c36c176429d37eb','Apache-2.0','Ocean-rooted drainage and tributary flow adapted onto the PANGEA grid. Modified code in terrain.mjs retains its Apache-2.0 license.','src/pangea/simulation/vendor/mapgen4.LICENSE'],
 ['d3-interpolate / Mike Bostock','https://github.com/d3/d3-interpolate','2eeffc0d02f2947552cf0a0b73bdf26fe90e1c28','ISC','Zoom mathematics adapted for registered world and settlement cameras.','LICENSES/d3-interpolate-ISC.txt'],
 ['idb / Jake Archibald','https://github.com/jakearchibald/idb','654c746bef13f9fe7f5871e03ac58015cebace5a (8.0.4)','ISC','Small IndexedDB promise wrapper for device checkpoints.','src/pangea/persistence/vendor/idb.LICENSE'],
 ['FlatQueue / Vladimir Agafonkin','https://github.com/mourner/flatqueue','3.0.0','ISC','Priority queue used by pathfinding and terrain drainage.','src/pangea/simulation/vendor/flatqueue.LICENSE'],
 ['Manrope','https://github.com/sharanda/manrope','Manrope font family','SIL OFL 1.1','Locally hosted interface typography.','public/pangea/Manrope-OFL.txt'],
 ['React','https://github.com/facebook/react','19.2.1','MIT','Interface runtime.','node_modules/react/LICENSE'],
 ['Lucide','https://github.com/lucide-icons/lucide','0.453.0','ISC / MIT','Interface icons.','node_modules/lucide-react/LICENSE'],
];
const credits=records.map(([name,url,revision,license,use,path])=>({name,url,revision,license,use,text:readFileSync(path,'utf8')}));
writeFileSync('src/pangea/credits.json',JSON.stringify(credits,null,2)+'\n');
writeFileSync('public/pangea/licenses.txt',credits.map(c=>`${c.name}\n${c.url}\nRevision: ${c.revision}\n${c.use}\n\n${c.text}`).join('\n\n----------------------------------------\n\n').replace(/[ \t]+$/gm,''));
console.log(`Bundled ${credits.length} license notices.`);
