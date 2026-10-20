import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCapitalExample} from '../public/lib/capital-example.js';
import {parseCapitalRecord,CAPITAL_RECORD_MAX_BYTES} from '../public/lib/capital-record.js';
import {capitalBriefHtml} from '../public/lib/capital-brief.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const presets=JSON.parse(await readFile(path.join(root,'data/presets.json'),'utf8'));
const record=createCapitalExample(presets);
const json=JSON.stringify(record,null,2)+'\n';
if(new TextEncoder().encode(json).byteLength>CAPITAL_RECORD_MAX_BYTES)throw new Error('The worked JSON exceeds the supported record import size.');
parseCapitalRecord(json);
const html=capitalBriefHtml(record),directory=path.join(root,'public/downloads');
await mkdir(directory,{recursive:true});
await writeFile(path.join(directory,'Frontier_AI_Capital_Decision.json'),json);
await writeFile(path.join(directory,'Frontier_AI_Capital_Decision.html'),html);
console.log(JSON.stringify({status:'built',company:record.snapshot.company,scenarios:record.snapshot.scenarios.length,plans:record.snapshot.plans.length,jsonBytes:Buffer.byteLength(json),htmlBytes:Buffer.byteLength(html),selectedPlanId:record.decision.selectedPlanId,capitalVersion:record.capitalVersion}));
