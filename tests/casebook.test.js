import test from 'node:test';
import assert from 'node:assert/strict';
import presets from '../data/presets.json' with {type:'json'};
import research from '../data/research.json' with {type:'json'};
import {project,MODEL_VERSION,VALUATION_DATE} from '../public/lib/model.js';
import {encodeScenario,decodeScenario} from '../public/lib/share.js';
import {encodeThesis,decodeThesis} from '../public/lib/thesis-share.js';

const core=await import('../public/lib/casebook.js').catch(error=>{
  if(error.code==='ERR_MODULE_NOT_FOUND'&&error.url?.endsWith('/public/lib/casebook.js'))return {};
  throw error;
});
const api=name=>{assert.equal(typeof core[name],'function',name+' must implement the casebook contract');return core[name];};
const stamp='2026-10-19T09:00:00.000Z';
const scenario=()=>({company:'Anthropic',scenario:'Base',assumptions:{...presets.Anthropic.Base,g1:.4781234567890123,stub:-.123456789012345},bridge:{cash:10.125,debt:3.5,otherClaims:.25}});
const thesis=()=>({company:'Anthropic',reference:{scenario:'Base',assumptions:{...presets.Anthropic.Base},bridge:{cash:1.125,debt:2,otherClaims:0}},alternative:{scenario:'Bull',assumptions:{...presets.Anthropic.Bull,g1:.6112345678901234},bridge:{cash:9.75,debt:1,otherClaims:.5}},landscape:{rates:[.0871234567890123,.105,.129,.18],margins:[.041,.0837,.141,.397],target:500.1234567890123}});
const meta=(id='case-1',extra={})=>({id,title:'Revenue before returns',createdAt:stamp,updatedAt:stamp,notes:{rationale:'Demand must convert to cash.',keyAssumption:'Capital turns',reviewTrigger:'Review the next operating disclosure.'},sourceIds:['S04','S19'],...extra});
const item=(id='case-1',extra={})=>api('createScenarioEntry')(scenario(),meta(id,extra),research);
const book=entries=>api('createCasebook')(entries,research);
const legacy=(id='old-1',extra={})=>({id,name:'Original saved case',company:'Anthropic',scenario:'Base',assumptions:{...presets.Anthropic.Base},modelVersion:MODEL_VERSION,savedAt:stamp,...extra});

test('casebook scenarios retain all exact inputs, bridges and detached analyst metadata',()=>{
  const snapshot=scenario(),metadata=meta(),entry=api('createScenarioEntry')(snapshot,metadata,research);
  assert.equal(entry.kind,'scenario');
  assert.deepEqual(api('decodeEntry')(entry),snapshot);
  assert.equal(project(api('decodeEntry')(entry).assumptions).ev,project(snapshot.assumptions).ev);
  snapshot.assumptions.g1=.2;metadata.notes.rationale='Changed outside the book';metadata.sourceIds.push('S18');
  assert.equal(api('decodeEntry')(entry).assumptions.g1,.4781234567890123);
  assert.equal(entry.notes.rationale,'Demand must convert to cash.');
  assert.deepEqual(entry.sourceIds,['S04','S19']);
});

test('casebook thesis snapshots retain both bridges, full precision and uneven landscape axes',()=>{
  const snapshot=thesis(),entry=api('createThesisEntry')(snapshot,meta('pair-1'),research);
  assert.equal(entry.kind,'thesis');
  assert.deepEqual(api('decodeEntry')(entry),snapshot);
  const reopened=decodeThesis(entry.token);
  assert.equal(project(reopened.alternative.assumptions).ev,project(snapshot.alternative.assumptions).ev);
  snapshot.landscape.rates[0]=.01;snapshot.reference.bridge.cash=90;
  assert.notEqual(api('decodeEntry')(entry).landscape.rates[0],.01);
  assert.equal(api('decodeEntry')(entry).reference.bridge.cash,1.125);
});

test('entry creation supplies valid IDs, timestamps and empty optional annotations',()=>{
  const entry=api('createScenarioEntry')(scenario(),{title:'New research'},research);
  assert.match(entry.id,/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/);
  assert.equal(new Date(entry.createdAt).toISOString(),entry.createdAt);
  assert.equal(entry.updatedAt,entry.createdAt);
  assert.deepEqual(entry.notes,{rationale:'',keyAssumption:'',reviewTrigger:''});
  assert.deepEqual(entry.sourceIds,[]);
});

test('summary recalculates signed endpoint values without persisting outputs or verification claims',()=>{
  const bear={company:'OpenAI',scenario:'Bear',assumptions:{...presets.OpenAI.Bear},bridge:null};
  const single=api('createScenarioEntry')(bear,meta(),research);
  assert.deepEqual(api('summarizeEntry')(single),{company:'OpenAI',kind:'scenario',scenario:'Bear',referenceScenario:null,alternativeScenario:null,ev:project(bear.assumptions).ev,referenceEv:null,alternativeEv:null,evDelta:null});
  const pair=api('createThesisEntry')(thesis(),meta('pair'),research),summary=api('summarizeEntry')(pair);
  assert.equal(summary.ev,null);assert.equal(summary.referenceScenario,'Base');assert.equal(summary.alternativeScenario,'Bull');
  assert.equal(summary.evDelta,project(thesis().alternative.assumptions).ev-project(thesis().reference.assumptions).ev);
  assert.throws(()=>api('normalizeEntry')({...single,serverVerified:true},research),/unsupported|unexpected/i);
});

test('calculation reopening chooses the correct relative page and contains only the exact numeric snapshot',()=>{
  const entry=item(),url=new URL(api('entryUrl')('https://example.test/project/casebook.html?private=notes#entry',entry));
  assert.equal(url.pathname,'/project/index.html');assert.equal(url.search,'');
  assert.deepEqual(decodeScenario(url.hash.slice('#scenario='.length)),scenario());
  const pair=api('createThesisEntry')(thesis(),meta('pair'),research);
  const paired=new URL(api('entryUrl')('https://example.test/project/',pair));
  assert.equal(paired.pathname,'/project/thesis.html');assert.deepEqual(decodeThesis(paired.hash.slice(8)),thesis());
  for(const base of ['javascript:alert(1)','file:///tmp/casebook.html','data:text/html,hello'])assert.throws(()=>api('entryUrl')(base,entry),/HTTP|URL/i);
  assert.ok(!url.href.includes('Demand'));
});

test('token normalization uses the existing codecs and canonical bridge field order',()=>{
  const original=scenario(),reordered={...original,bridge:{otherClaims:.25,debt:3.5,cash:10.125}};
  const entry=item(),normalized=api('normalizeEntry')({...entry,token:encodeScenario(reordered)},research);
  assert.equal(normalized.token,encodeScenario(original));
  assert.equal(api('normalizeEntry')(api('createThesisEntry')(thesis(),meta('pair'),research),research).token,encodeThesis(thesis()));
});

test('books pin schema, model, valuation date and original research cutoff',()=>{
  const original=book([item()]);
  assert.deepEqual(Object.keys(original),['schema','modelVersion','valuationDate','researchCutoff','entries']);
  assert.equal(original.schema,1);assert.equal(original.modelVersion,MODEL_VERSION);assert.equal(original.valuationDate,VALUATION_DATE);assert.equal(original.researchCutoff,research.researchCutoff);
  for(const alteration of [{schema:2},{modelVersion:'4.0.0'},{valuationDate:'2027-01-01'},{researchCutoff:'2026-10-19T00:00:00Z'},{verified:true}]){
    assert.throws(()=>api('normalizeCasebook')({...original,...alteration},research),/schema|format|model|date|snapshot|cutoff|unsupported|unexpected/i);
  }
});

test('notes and source references enforce the published bounds without relabeling text as evidence',()=>{
  const entry=item();
  assert.deepEqual(api('normalizeEntry')({...entry,sourceIds:['S19','S18','S01']},research).sourceIds,['S01','S18','S19']);
  for(const sourceIds of [['S99'],['S01','S01'],[1],['__proto__']])assert.throws(()=>api('normalizeEntry')({...entry,sourceIds},research),/source/i);
  for(const [key,limit] of [['rationale',1200],['keyAssumption',600],['reviewTrigger',1000]]){
    assert.equal(api('normalizeEntry')({...entry,notes:{...entry.notes,[key]:'x'.repeat(limit)}},research).notes[key].length,limit);
    assert.throws(()=>api('normalizeEntry')({...entry,notes:{...entry.notes,[key]:'x'.repeat(limit+1)}},research),/character|limit|long/i);
    assert.throws(()=>api('normalizeEntry')({...entry,notes:{...entry.notes,[key]:17}},research),/text|string/i);
  }
  assert.throws(()=>api('normalizeEntry')({...entry,title:'x'.repeat(101)},research),/title|character|limit/i);
  assert.throws(()=>api('normalizeEntry')({...entry,title:'  '},research),/title/i);
  const text='<img src=x onerror="alert(1)"> \u4e2d\u6587 \ud83d\udcc1';
  assert.equal(api('normalizeEntry')({...entry,title:text},research).title,text);
});

test('unknown fields, accessors, inherited data, malformed timestamps and duplicate IDs are rejected',()=>{
  const entry=item();let reads=0;
  const accessor={...entry};Object.defineProperty(accessor.notes,'rationale',{get(){reads++;return 'no';},enumerable:true});
  assert.throws(()=>api('normalizeEntry')(accessor,research),/data property/i);assert.equal(reads,0);
  assert.throws(()=>api('normalizeEntry')(Object.create(item()),research),/plain object/i);
  for(const mutation of [{id:''},{kind:'forecast'},{createdAt:'2026-02-30T09:00:00.000Z'},{updatedAt:'2026-10-18T09:00:00.000Z'},{token:'bad token'},{notes:{rationale:''}}]){
    assert.throws(()=>api('normalizeEntry')({...item(),...mutation},research));
  }
  assert.throws(()=>book([item(),item()]),/duplicate|unique/i);
  const sparse=book([]);sparse.entries=Array(1);assert.throws(()=>api('normalizeCasebook')(sparse,research),/missing|sparse|entry|entries/i);
});

test('JSON imports retain Unicode and exact inputs but reject malformed or oversized UTF-8 before use',()=>{
  const original=book([item('unicode',{title:'\u4e2d\u6587 \ud83d\udcc1',notes:{rationale:'An analyst claim, not company guidance.',keyAssumption:'\u6210\u672c',reviewTrigger:''}})]);
  const text=api('serializeCasebook')(original,research);
  assert.deepEqual(api('parseCasebook')(text,research),original);
  assert.equal(api('decodeEntry')(api('parseCasebook')(text,research).entries[0]).assumptions.g1,scenario().assumptions.g1);
  assert.throws(()=>api('parseCasebook')('{invalid',research),/JSON/i);
  assert.throws(()=>api('parseCasebook')(' '.repeat(524289),research),/512|size|KiB/i);
  const padding='\u2003'.repeat(180000);
  assert.throws(()=>api('parseCasebook')(padding+text,research),/512|size|KiB/i);
});

test('merging skips exact records and preserves conflicting IDs without mutating either input',()=>{
  const original=item(),changed={...item(),title:'Alternative argument'};
  const current=book([original]),incoming=book([changed]),before=structuredClone({current,incoming});
  const result=api('mergeCasebooks')(current,incoming,research,{makeId:()=> 'imported-conflict'});
  assert.equal(result.imported,1);assert.equal(result.skipped,0);assert.equal(result.conflicts,1);
  assert.equal(result.book.entries.length,2);assert.ok(result.book.entries.some(entry=>entry.id===original.id&&entry.title===original.title));
  assert.equal(result.entries[0].id,'imported-conflict');assert.equal(result.entries[0].title,changed.title);
  assert.deepEqual({current,incoming},before);
  const repeated=api('mergeCasebooks')(result.book,incoming,research,{makeId:()=> 'unused-id'});
  assert.equal(repeated.imported,0);assert.equal(repeated.skipped,1);assert.equal(repeated.book.entries.length,2);
});

test('capacity and failed ID allocation reject a merge rather than dropping existing work',()=>{
  const current=book(Array.from({length:24},(_,index)=>item('saved-'+index,{title:'Case '+index})));
  const before=structuredClone(current);
  assert.throws(()=>api('mergeCasebooks')(current,book([item('extra')]),research),/24|capacity|full/i);
  assert.deepEqual(current,before);
  assert.throws(()=>book([...current.entries,item('overflow')]),/24|capacity|full/i);
  assert.throws(()=>api('mergeCasebooks')(book([item()]),book([{...item(),title:'Conflict'}]),research,{makeId:()=> 'case-1'}),/unique|ID|identifier/i);
});

test('legacy migration validates records, keeps an explicit null bridge and is repeatable',()=>{
  const raw=JSON.stringify({version:1,scenarios:[legacy(),legacy('wrong-model',{modelVersion:'2.0.0'}),legacy('bad-input',{assumptions:{...presets.Anthropic.Base,turns:-1}})]});
  const before=raw,result=api('migrateLegacyScenarios')(raw,research);
  assert.equal(result.total,3);assert.equal(result.book.entries.length,1);assert.equal(result.invalid.length,2);
  const migrated=result.book.entries[0];
  assert.equal(migrated.title,'Original saved case');assert.equal(migrated.createdAt,stamp);assert.equal(api('decodeEntry')(migrated).bridge,null);
  assert.deepEqual(api('decodeEntry')(migrated).assumptions,presets.Anthropic.Base);
  assert.deepEqual(api('migrateLegacyScenarios')(raw,research),result);
  const repeated=api('mergeCasebooks')(result.book,api('migrateLegacyScenarios')(raw,research).book,research);
  assert.equal(repeated.imported,0);assert.equal(repeated.skipped,1);assert.equal(raw,before);
  assert.throws(()=>api('migrateLegacyScenarios')('{broken',research),/legacy|JSON/i);
});
