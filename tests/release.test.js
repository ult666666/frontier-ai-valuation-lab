import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {MODEL_VERSION, VALUATION_DATE} from '../public/lib/model.js';
import {APP_VERSION} from '../public/lib/release.js';

const publicRoot=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));

test('published HTML links resolve to actual public assets',async()=>{
  for(const name of ['index.html','report.html','thesis.html','casebook.html']){
    const text=await readFile(path.join(publicRoot,name),'utf8');
    for(const match of text.matchAll(/(?:href|src)="([^"]+)"/g)){
      const ref=match[1];
      if(/^(https?:|mailto:|#|data:)/.test(ref))continue;
      const pathname=ref.split(/[?#]/)[0];
      let resolved=path.resolve(publicRoot,pathname);
      assert.ok(resolved===publicRoot||resolved.startsWith(publicRoot+path.sep),`${name} link escapes public directory: ${ref}`);
      if((await stat(resolved)).isDirectory())resolved=path.join(resolved,'index.html');
      assert.ok((await stat(resolved)).isFile(),`${name} has missing asset ${ref}`);
    }
  }
});

test('release downloads are real PDF and XLSX files',async()=>{
  const pdf=await readFile(path.join(publicRoot,'downloads/Frontier_AI_Valuation_Review.pdf'));
  const xlsx=await readFile(path.join(publicRoot,'downloads/Frontier_AI_Valuation_Model.xlsx'));
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  assert.equal(xlsx.subarray(0,4).toString('hex'),'504b0304');
  assert.ok(pdf.length>10000&&xlsx.length>10000);
});

test('the published Thesis Lab example has a real PDF and a current standalone comparison',async()=>{
  const pdf=await readFile(path.join(publicRoot,'downloads/Frontier_AI_Thesis_Comparison.pdf'));
  const html=await readFile(path.join(publicRoot,'downloads/Frontier_AI_Thesis_Comparison.html'),'utf8');
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>10000);
  assert.ok(html.includes(`Application ${APP_VERSION}`));assert.ok(html.includes(`Financial engine ${MODEL_VERSION}`));
  assert.ok(html.includes('id="reopen-thesis"'));assert.ok(html.includes('#thesis='));
  assert.ok(!/<script\b|\son\w+=/i.test(html));
});

test('research and release snapshots identify the current model and calendar date',async()=>{
  const research=JSON.parse(await readFile(path.join(publicRoot,'data/research.json'),'utf8'));
  const current=JSON.parse(await readFile(path.join(publicRoot,'data/current-results.json'),'utf8'));
  assert.equal(research.modelVersion,MODEL_VERSION);
  assert.equal(research.asOf,VALUATION_DATE);
  assert.equal(current.modelVersion,MODEL_VERSION);
  assert.equal(current.valuationDate,VALUATION_DATE);
  assert.equal(Object.values(current.cases).flatMap(Object.values).length,6);
  assert.equal(new Set(research.sources.map(s=>s.id)).size,research.sources.length);
  for(const company of Object.values(research.companies)){
    const ids=[company.financing.sourceId,...company.operatingEvidence.map(e=>e.sourceId)].filter(Boolean);
    for(const id of ids)assert.ok(research.sources.some(s=>s.id===id),`Missing evidence reference ${id}`);
  }
});
