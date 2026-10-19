import {readFile,writeFile,mkdir,readdir,copyFile,rm,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {project,reverseGrowth,MODEL_VERSION,VALUATION_DATE} from '../public/lib/model.js';
import {APP_VERSION} from '../public/lib/release.js';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const packageInfo=JSON.parse(await readFile(path.join(ROOT,'package.json'),'utf8'));
if(packageInfo.version!==APP_VERSION) throw new Error('Application and package versions must agree.');
const presets=JSON.parse(await readFile(path.join(ROOT,'data/presets.json'),'utf8'));
const research=JSON.parse(await readFile(path.join(ROOT,'data/research.json'),'utf8'));
if(research.asOf!==VALUATION_DATE||research.modelVersion!==MODEL_VERSION) throw new Error('Research and model versions must agree.');
const cases={};for(const [company,scenarios] of Object.entries(presets)){
  cases[company]={};for(const [scenario,p] of Object.entries(scenarios))cases[company][scenario]=project(p);
}
const reverse={};for(const company of Object.keys(presets))reverse[company]=reverseGrowth(presets[company].Base,500);
await mkdir(path.join(ROOT,'public/data'),{recursive:true});
for(const name of ['presets.json','research.json'])await copyFile(path.join(ROOT,'data',name),path.join(ROOT,'public/data',name));
await writeFile(path.join(ROOT,'public/data/current-results.json'),JSON.stringify({modelVersion:MODEL_VERSION,valuationDate:VALUATION_DATE,cases,reverse},null,2)+'\n');
await import('./build_evidence.js');
const OUT=path.join(ROOT,'dist');
// dist is an ignored generated build directory, never a source or user path.
await rm(OUT,{recursive:true,force:true});await mkdir(OUT,{recursive:true});
async function stage(relative=''){
  for(const entry of await readdir(path.join(ROOT,'public',relative),{withFileTypes:true})){
    if(entry.name.startsWith('.'))continue;
    const name=path.join(relative,entry.name), source=path.join(ROOT,'public',name),target=path.join(OUT,name);
    if((await lstat(source)).isSymbolicLink())throw new Error('Public build cannot contain symbolic links.');
    if(entry.isDirectory()){await mkdir(target,{recursive:true});await stage(name);}
    else {if(!/\.(html|css|js|json|svg|png|pdf|xlsx|csv|txt)$/.test(entry.name))throw new Error(`Unexpected public file: ${name}`);await copyFile(source,target);}
  }
}
await stage();
console.log(`Built application ${APP_VERSION}, financial engine ${MODEL_VERSION} for ${VALUATION_DATE}; six scenario projections verified.`);
for(const [company,scenarios] of Object.entries(cases))console.log(company,Object.entries(scenarios).map(([name,r])=>`${name} EV $${r.ev.toFixed(1)}B`).join(' | '));
