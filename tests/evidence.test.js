import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MODEL_VERSION,VALUATION_DATE} from '../public/lib/model.js';

const json=async name=>JSON.parse(await readFile(new URL(`../${name}`,import.meta.url),'utf8'));
const research=await json('data/research.json');
const ledger=await json('data/fact-ledger.json');
const expectedKeys=['rev2026','g1','g2','g3','m27','m30','m36','turns','wacc','tg','roic','stub','tax'];
const api=await import('../public/lib/evidence.js').catch(error=>{
  if(error.code==='ERR_MODULE_NOT_FOUND')return {};
  throw error;
});
const clone=value=>structuredClone(value);
function fixture(){
  return {
    schemaVersion:1,modelVersion:MODEL_VERSION,valuationDate:VALUATION_DATE,
    sourceCompanies:research.sources.map(source=>({
      id:source.id,companies:source.id==='S19'?['Anthropic','OpenAI']:source.id==='S18'?['Anthropic']:[...new Set(ledger.facts.filter(fact=>fact.source===source.id).map(fact=>fact.entity))]
    })),
    contexts:['Anthropic','OpenAI'].map(company=>({
      id:`${company.toLowerCase()}-context`,company,inputKeys:[...expectedKeys],relationship:'context',
      title:'Reported operating context',summary:'This related evidence provides context for an analyst assumption.',
      limitation:'The source does not establish the numerical forecast input.',
      factIds:[ledger.facts.find(fact=>fact.entity===company).id],sourceIds:[]
    }))
  };
}
function build(overrides={}){
  assert.equal(typeof api.buildEvidenceCatalog,'function','The evidence catalog builder is available.');
  return api.buildEvidenceCatalog({research,ledger,mapping:fixture(),...overrides});
}

test('evidence preserves every frozen fact, original period and nineteen source records',()=>{
  const catalog=build();
  assert.equal(catalog.schemaVersion,1);
  assert.equal(catalog.modelVersion,MODEL_VERSION);
  assert.equal(catalog.valuationDate,VALUATION_DATE);
  assert.equal(catalog.researchCutoff,research.researchCutoff);
  assert.equal(catalog.facts.length,21);
  assert.equal(catalog.sources.length,19);
  for(const original of ledger.facts){
    const fact=catalog.facts.find(item=>item.id===original.id);
    assert.equal(fact.company,original.entity);
    assert.equal(fact.metric,original.metric);
    assert.deepEqual(fact.value,original.value);
    assert.equal(fact.unit,original.unit);
    assert.equal(fact.observationLabel,original.observation_date);
    assert.equal(fact.evidenceStatus,original.status);
    assert.equal(fact.modelImplication,original.model_implication);
    assert.deepEqual(fact.sourceIds,[original.source]);
    assert.ok(!Object.hasOwn(fact,'confidence'));
  }
  for(const original of research.sources){
    const source=catalog.sources.find(item=>item.id===original.id);
    for(const key of Object.keys(original))assert.deepEqual(source[key],original[key],`${original.id}.${key}`);
  }
  assert.ok(catalog.sources.some(source=>source.id==='S18'));
  assert.ok(catalog.sources.some(source=>source.id==='S19'));
  assert.ok(!/"(?:confidence|score|probability)"\s*:/.test(JSON.stringify(catalog)));
});

test('all thirteen inputs retain explicit assumption status for both companies',()=>{
  const catalog=build();
  assert.deepEqual(api.EVIDENCE_INPUT_KEYS,expectedKeys);
  assert.equal(api.EVIDENCE_FIELDS.length,13);
  for(const company of ['Anthropic','OpenAI']){
    assert.deepEqual(Object.keys(catalog.companies[company].inputs),expectedKeys);
    for(const key of expectedKeys){
      const input=catalog.companies[company].inputs[key];
      assert.equal(input.status,'Analyst or user assumption');
      assert.ok(input.contextIds.length>0);
      assert.ok(input.definition&&input.limit);
      assert.equal(api.evidenceButtonLabel(key),`Evidence for ${input.label}`);
    }
  }
  assert.throws(()=>api.evidenceButtonLabel('equity'),/Unknown assumption/);
});

test('catalog building is deterministic, detached and leaves frozen inputs untouched',()=>{
  const inputs={research:clone(research),ledger:clone(ledger),mapping:fixture()};
  const before=JSON.stringify(inputs),first=build(inputs),second=build(inputs);
  assert.equal(JSON.stringify(first),JSON.stringify(second));
  assert.equal(JSON.stringify(inputs),before);
  inputs.ledger.facts[0].value.round_size=1;
  assert.equal(first.facts[0].value.round_size,65);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.facts[0].value));
  assert.throws(()=>{first.facts[0].value.round_size=1;},TypeError);
});

test('unknown evidence, source and model-input references are rejected',()=>{
  for(const [field,value,pattern] of [
    ['factIds',['UNKNOWN_FACT'],/Unknown fact/],
    ['sourceIds',['S99'],/Unknown source/],
    ['inputKeys',['revenue'],/Unknown assumption/]
  ]){
    const mapping=fixture();mapping.contexts[0][field]=value;
    assert.throws(()=>build({mapping}),pattern);
  }
  const badLedger=clone(ledger);badLedger.facts[0].source='S99';
  assert.throws(()=>build({ledger:badLedger}),/Unknown source/);
  const mapping=fixture();mapping.sourceCompanies[0].id='S99';
  assert.throws(()=>build({mapping}),/Unknown source/);
});

test('duplicate sources, facts, contexts and mapping references fail instead of double counting',()=>{
  const duplicateResearch=clone(research);duplicateResearch.sources.push(clone(duplicateResearch.sources[0]));
  assert.throws(()=>build({research:duplicateResearch}),/Duplicate source/);
  const duplicateLedger=clone(ledger);duplicateLedger.facts.push(clone(duplicateLedger.facts[0]));
  assert.throws(()=>build({ledger:duplicateLedger}),/Duplicate fact/);
  const duplicateLedgerSource=clone(ledger);duplicateLedgerSource.sources.push(clone(duplicateLedgerSource.sources[0]));
  assert.throws(()=>build({ledger:duplicateLedgerSource}),/Duplicate ledger source/);
  const mapping=fixture();mapping.contexts.push(clone(mapping.contexts[0]));
  assert.throws(()=>build({mapping}),/Duplicate context/);
  for(const field of ['inputKeys','factIds','sourceIds']){
    const map=fixture();const entry=map.contexts[0];
    if(field==='sourceIds')entry[field]=['S01'];
    if(field==='inputKeys')entry[field][1]=entry[field][0];
    else entry[field].push(entry[field][0]);
    assert.throws(()=>build({mapping:map}),/Duplicate/);
  }
});

test('cross-company fact and source mappings are rejected',()=>{
  const factMapping=fixture();factMapping.contexts[1].factIds=['A_Q3'];
  assert.throws(()=>build({mapping:factMapping}),/different company/);
  const sourceMapping=fixture();sourceMapping.contexts[1].sourceIds=['S18'];
  assert.throws(()=>build({mapping:sourceMapping}),/different company/);
  const unknownCompany=fixture();unknownCompany.sourceCompanies[0].companies=['Other'];
  assert.throws(()=>build({mapping:unknownCompany}),/Unknown company/);
});

test('incomplete field coverage and incompatible snapshots cannot produce a catalog',()=>{
  const mapping=fixture();mapping.contexts[0].inputKeys=mapping.contexts[0].inputKeys.filter(key=>key!=='tax');
  assert.throws(()=>build({mapping}),/No context.*Anthropic.*tax/);
  const futureMapping=fixture();futureMapping.valuationDate='2026-10-19';
  assert.throws(()=>build({mapping:futureMapping}),/snapshot/);
  const futureResearch=clone(research);futureResearch.modelVersion='4.0.0';
  assert.throws(()=>build({research:futureResearch}),/snapshot/);
  const futureLedger=clone(ledger);futureLedger.metadata.as_of='2026-10-19T09:22:26-07:00';
  assert.throws(()=>build({ledger:futureLedger}),/cutoff/);
});

test('invalid datum values, unsafe source URLs and unsupported relationship classes are rejected',()=>{
  const badLedger=clone(ledger);badLedger.facts[0].value.round_size=Infinity;
  assert.throws(()=>build({ledger:badLedger}),/finite/);
  const badResearch=clone(research);badResearch.sources[0].url='javascript:alert(1)';
  assert.throws(()=>build({research:badResearch}),/web URL/);
  const credentialResearch=clone(research);credentialResearch.sources[0].url='https://user:secret@example.com/';
  assert.throws(()=>build({research:credentialResearch}),/web URL/);
  const mapping=fixture();mapping.contexts[0].relationship='predicts';
  assert.throws(()=>build({mapping}),/relationship/);
  const oversized=fixture();oversized.contexts[0].limitation='x'.repeat(2001);
  assert.throws(()=>build({mapping:oversized}),/length/);
});

test('source scope, ledger provenance and mapping shape are complete and unambiguous',()=>{
  const missing=fixture();missing.sourceCompanies.pop();
  assert.throws(()=>build({mapping:missing}),/source scope/);
  const duplicate=fixture();duplicate.sourceCompanies.push(clone(duplicate.sourceCompanies[0]));
  assert.throws(()=>build({mapping:duplicate}),/Duplicate source scope/);
  const mismatched=clone(ledger);mismatched.sources[0].url='https://example.com/different-record';
  assert.throws(()=>build({ledger:mismatched}),/source URL/);
  const unknownField=fixture();unknownField.contexts[0].confidence=90;
  assert.throws(()=>build({mapping:unknownField}),/unsupported field/);
});

test('curated mappings distinguish revenue arithmetic, context, methodology and unsupported numerical levels',async()=>{
  const mapping=await json('data/assumption-context.json').catch(error=>{
    if(error.code==='ENOENT')return null;
    throw error;
  });
  assert.ok(mapping,'The curated source-to-assumption map exists.');
  const catalog=build({mapping});
  const revenue=catalog.contexts.filter(context=>context.company==='Anthropic'&&context.inputKeys.includes('rev2026'));
  assert.ok(revenue.some(context=>context.relationship==='arithmetic_component'&&context.sourceIds.includes('S18')));
  assert.ok(catalog.contexts.some(context=>context.relationship==='method'&&context.sourceIds.includes('S19')));
  for(const company of ['Anthropic','OpenAI']){
    const tax=catalog.companies[company].inputs.tax;
    const contexts=tax.contextIds.map(id=>catalog.contexts.find(context=>context.id===id));
    assert.ok(contexts.every(context=>context.relationship==='boundary'));
    assert.ok(contexts.every(context=>context.factIds.length===0&&context.sourceIds.length===0));
  }
  assert.ok(catalog.contexts.every(context=>context.summary&&context.limitation));
});

test('contextual values retain full input precision and scale percentages without display artifacts',()=>{
  assert.equal(typeof api.formatEvidenceValue,'function');
  assert.equal(api.formatEvidenceValue('m36',0.07118481610922621),'7.118481610922621%');
  assert.equal(api.formatEvidenceValue('g1',0.58),'58%');
  assert.equal(api.formatEvidenceValue('m27',-0.01),'−1%');
  assert.equal(api.formatEvidenceValue('rev2026',53.26000000000001),'$53.26000000000001B');
  assert.equal(api.formatEvidenceValue('stub',-4.123456789012345),'−$4.123456789012345B');
  assert.equal(api.formatEvidenceValue('turns',3.123456789012345),'3.123456789012345×');
  assert.equal(api.formatEvidenceValue('tg',5e-324),'5e-322%');
  assert.throws(()=>api.formatEvidenceValue('g1',Infinity),/finite/);
  assert.throws(()=>api.formatEvidenceValue('equity',1),/Unknown assumption/);
});

test('generated public evidence is exactly reproducible from the frozen inputs and curated mapping',async()=>{
  const mapping=await json('data/assumption-context.json');
  const generated=await readFile(new URL('../public/data/evidence.json',import.meta.url),'utf8').catch(error=>{
    if(error.code==='ENOENT')return null;
    throw error;
  });
  assert.equal(typeof generated,'string','The deterministic public evidence artifact is present.');
  assert.equal(generated,JSON.stringify(build({mapping}),null,2)+'\n');
});
