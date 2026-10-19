import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {buildEvidenceCatalog} from '../public/lib/evidence.js';

const root=new URL('../',import.meta.url);
const readJson=async name=>JSON.parse(await readFile(new URL(name,root),'utf8'));
const [research,ledger,mapping]=await Promise.all([
  readJson('data/research.json'),readJson('data/fact-ledger.json'),readJson('data/assumption-context.json')
]);
const catalog=buildEvidenceCatalog({research,ledger,mapping});
await mkdir(new URL('public/data/',root),{recursive:true});
await writeFile(new URL('public/data/evidence.json',root),JSON.stringify(catalog,null,2)+'\n');
console.log(`Built evidence context for ${catalog.facts.length} facts, ${catalog.sources.length} sources and 13 assumptions per company; snapshot ${catalog.valuationDate}.`);
