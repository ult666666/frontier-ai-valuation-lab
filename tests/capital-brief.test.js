import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

let recordApi={},briefApi={},shareApi={},exampleApi={};
for(const [path,set] of [
  ['../public/lib/capital-record.js',value=>recordApi=value],
  ['../public/lib/capital-brief.js',value=>briefApi=value],
  ['../public/lib/capital-share.js',value=>shareApi=value],
  ['../public/lib/capital-example.js',value=>exampleApi=value]
]){try{set(await import(path));}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}}
const api=(source,name)=>{assert.equal(typeof source[name],'function',`${name} is not implemented`);return source[name];};
const presets=JSON.parse(await readFile(new URL('../data/presets.json',import.meta.url),'utf8'));
const example=company=>api(exampleApi,'createCapitalExample')(presets,company);
const brief=record=>api(briefApi,'capitalBriefHtml')(record);
const unescape=value=>value.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>');

test('the worked record uses complete current presets and the declared three-plan decision',()=>{
  const record=example('Anthropic');assert.equal(record.snapshot.company,'Anthropic');
  assert.deepEqual(record.snapshot.scenarios.map(item=>item.id),['bear','base','bull']);
  assert.deepEqual(record.snapshot.scenarios.map(item=>item.assumptions),['Bear','Base','Bull'].map(name=>presets.Anthropic[name]));
  assert.deepEqual(record.snapshot.plans.map(({id,basis,quote,primaryCapital})=>({id,basis,quote,primaryCapital})),[
    {id:'a',basis:'pre',quote:250,primaryCapital:25},{id:'b',basis:'pre',quote:300,primaryCapital:35},{id:'c',basis:'pre',quote:300,primaryCapital:20}
  ]);
  assert.equal(record.snapshot.policy.capitalTarget,25);assert.equal(record.snapshot.policy.retentionFloor,.88);assert.equal(record.snapshot.policy.modelCoverageFloor,1);assert.equal(record.snapshot.policy.holderStake,.1);
  assert.deepEqual(record.analysis.comparison.eligiblePlanIds,['a','b']);assert.equal(record.decision.selectedPlanId,'a');assert.match(record.decision.rationale,/illustrative/i);
  const cross=record.analysis.comparison.crossovers.find(item=>item.planA==='a'&&item.planB==='b');assert.ok(Math.abs(cross.equityResidual-635)<1e-8);assert.ok(Math.abs(cross.allocation-600)<1e-8);
});

test('the canonical example selects the requested company without mutating supplied presets',()=>{
  const before=JSON.stringify(presets),record=example('OpenAI');assert.equal(record.snapshot.company,'OpenAI');
  assert.deepEqual(record.snapshot.scenarios[1].assumptions,presets.OpenAI.Base);assert.equal(JSON.stringify(presets),before);
  assert.throws(()=>example('Unknown'));assert.throws(()=>api(exampleApi,'createCapitalExample')({}));
});

test('the standalone brief preserves the exact decision and a working reopening URL',()=>{
  const record=example(),html=brief(record);
  assert.ok(html.startsWith('<!doctype html>'));assert.match(html,/<html lang="en"/);
  assert.ok(!/<script\b|\son[a-z]+\s*=/i.test(html));
  const match=/<a\b[^>]*id="capital-reopen"[^>]*href="([^"]+)"/.exec(html);assert.ok(match,'Exact reopening link is present');
  const restored=api(shareApi,'decodeCapitalShare')(new URL(unescape(match[1])).hash.slice('#decision='.length));
  assert.deepEqual(restored.snapshot,record.snapshot);assert.deepEqual(restored.decision,record.decision);
  assert.ok(html.indexOf('data-decision-field="rationale"')<html.indexOf('data-capital-section="plans"'));
});

test('all numeric assumptions, policy fields and scenario allocations are available in the brief',()=>{
  const record=example(),html=brief(record);
  for(const scenario of record.snapshot.scenarios)for(const [key,value] of Object.entries(scenario.assumptions))assert.ok(html.includes(`data-scenario-id="${scenario.id}" data-assumption="${key}" data-value="${value}"`),`${scenario.id} ${key}`);
  for(const key of Object.keys(record.snapshot.policy))assert.ok(html.includes(`data-policy="${key}" data-value="${record.snapshot.policy[key]}"`));
  for(const cell of record.analysis.matrix)assert.ok(html.includes(`data-scenario-id="${cell.scenarioId}" data-plan-id="${cell.planId}" data-allocation="${cell.existingCohortAllocation}"`));
});

test('untrusted decision text stays visible and inert in the generated document',()=>{
  const original=example(),notes={...original.decision,rationale:'选择 A 🧭 <img src=x onerror="alert(1)">',tradeoff:'</style><script>alert(1)</script> & private terms'};
  const html=brief(api(recordApi,'createCapitalRecord')(original.snapshot,notes));
  assert.ok(html.includes('选择 A 🧭 &lt;img'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!/<script\b|<img\b/i.test(html));
  assert.ok(!(html.match(/<[a-z][^>]*>/gi)||[]).some(tag=>/\son[a-z]+\s*=/i.test(tag)));
});

test('finite continuation, missing bridge and no eligible plans remain explicit in the brief',()=>{
  const original=example(),snapshot=structuredClone(original.snapshot);snapshot.scenarios[0].continuationYears=7;snapshot.bridge=null;snapshot.policy.capitalTarget=100;
  const record=api(recordApi,'createCapitalRecord')(snapshot,{...original.decision,selectedPlanId:null}),html=brief(record);
  assert.ok(html.includes('data-continuation-years="7"'));assert.ok(html.includes('2043'));
  assert.ok(html.includes('data-bridge-state="not-supplied"'));assert.ok(html.includes('data-minimax-status="no-eligible-plans"'));
  assert.ok(html.includes('data-selected-plan="none"'));assert.ok(!html.includes('NaN'));assert.ok(!html.includes('undefined'));
});

test('blank analyst fields are identified as drafts rather than inventing a recommendation',()=>{
  const original=example(),decision={selectedPlanId:null,rationale:'',tradeoff:'',reviewTrigger:'',informationNeeded:''};
  const html=brief(api(recordApi,'createCapitalRecord')(original.snapshot,decision));assert.equal((html.match(/data-note-state="empty"/g)||[]).length,4);assert.ok(html.includes('No analyst plan selected'));
});

test('a missing bridge does not mislabel a calculable crossover as outside the scenario range',()=>{
  const original=example(),snapshot=structuredClone(original.snapshot);snapshot.bridge=null;
  const html=brief(api(recordApi,'createCapitalRecord')(snapshot,original.decision));
  assert.ok(html.includes('Selected residual range unavailable.'));
  assert.ok(!html.includes('Outside selected residual range.'));
});

test('valid overlength links do not prevent a complete standalone brief',()=>{
  const original=example();for(const key of ['rationale','tradeoff','reviewTrigger','informationNeeded'])original.decision[key]='🧭'.repeat(1500);
  const html=brief(api(recordApi,'createCapitalRecord')(original.snapshot,original.decision));assert.ok(html.includes('data-share-state="unavailable"'));assert.ok(!html.includes('id="capital-reopen"'));
  assert.equal((html.match(/🧭/gu)||[]).length,6000);assert.ok(html.includes('JSON'));
});
