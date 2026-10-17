import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
const files=['world.mjs','data.mjs','sim.mjs','render.mjs','ui.mjs'];
const code=files.map(file=>`\n// ----- ${file} -----\n`+readFileSync(join(root,'src',file),'utf8').replace(/^import .*?;\s*$/gm,'').replace(/^export /gm,'')).join('\n');
const html=readFileSync(join(root,'index.template.html'),'utf8').replace('/*__STYLE__*/',()=>readFileSync(join(root,'src/style.css'),'utf8')).replace('/*__SCRIPT__*/',()=>`(()=>{'use strict';\n${code}\n})();`);
writeFileSync(join(root,'index.html'),html);
console.log(`Built index.html (${(Buffer.byteLength(html)/1024).toFixed(1)} KB). No runtime dependencies or CDN requests.`);
