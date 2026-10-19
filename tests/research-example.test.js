import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseCasebook,decodeEntry} from '../public/lib/casebook.js';
import {project} from '../public/lib/model.js';
import {APP_VERSION} from '../public/lib/release.js';
const read=name=>readFileSync(new URL('../'+name,import.meta.url));

test('published research example is importable, clearly illustrative and recalculates its exact requirement',()=>{
  const research=JSON.parse(read('data/research.json')),presets=JSON.parse(read('data/presets.json'));
  const book=parseCasebook(read('public/downloads/Frontier_AI_Research_Casebook.json').toString(),research);
  assert.equal(book.entries.length,3);assert.ok(book.entries.every(entry=>entry.title.startsWith('Example · ')));
  const draft=decodeEntry(book.entries[0]);assert.equal(draft.company,'Anthropic');assert.equal(draft.landscape.target,500);
  assert.deepEqual(draft.reference.assumptions,presets.Anthropic.Base);
  assert.ok(Math.abs(project(draft.alternative.assumptions).ev-500)<1e-8);
  assert.equal(draft.alternative.assumptions.wacc,.105);
  for(const [key,value] of Object.entries(presets.Anthropic.Bull))if(!['wacc','m36'].includes(key))assert.equal(draft.alternative.assumptions[key],value);
  const baseline=decodeEntry(book.entries[1]),higher=decodeEntry(book.entries[2]);
  assert.equal(baseline.company,'OpenAI');assert.deepEqual(baseline.assumptions,presets.OpenAI.Base);
  assert.equal(higher.assumptions.wacc,baseline.assumptions.wacc+.02);
  for(const key of Object.keys(baseline.assumptions))if(key!=='wacc')assert.equal(higher.assumptions[key],baseline.assumptions[key]);
  const html=read('public/downloads/Frontier_AI_Research_Brief.html').toString(),pdf=read('public/downloads/Frontier_AI_Research_Brief.pdf');
  assert.ok(html.includes('Application '+APP_VERSION));assert.ok(html.includes(book.entries[0].notes.rationale));
  assert.ok(html.includes('#thesis='));assert.ok(!/<script\b|\son\w+=/i.test(html));
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>10000);
});
