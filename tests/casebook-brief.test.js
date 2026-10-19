import test from 'node:test';
import assert from 'node:assert/strict';
import presets from '../data/presets.json' with {type:'json'};
import research from '../data/research.json' with {type:'json'};
import {MODEL_VERSION,VALUATION_DATE,project,bridgeEquity} from '../public/lib/model.js';
import {compareTheses,valuationLandscape} from '../public/lib/thesis.js';
import {decodeScenario} from '../public/lib/share.js';
import {decodeThesis} from '../public/lib/thesis-share.js';
import {createScenarioEntry,createThesisEntry} from '../public/lib/casebook.js';

const renderer=await import('../public/lib/casebook-brief.js').catch(error=>{
  if(error.code==='ERR_MODULE_NOT_FOUND'&&error.url?.endsWith('/public/lib/casebook-brief.js'))return {};
  throw error;
});
const stamp='2026-10-19T09:00:00.000Z',baseUrl='https://example.test/project/casebook.html?private=argument';
const scenario=()=>({company:'Anthropic',scenario:'Base',assumptions:{...presets.Anthropic.Base,g1:.4781234567890123},bridge:{cash:10.125,debt:3.5,otherClaims:.25}});
const thesis=()=>({company:'Anthropic',reference:{scenario:'Base',assumptions:{...presets.Anthropic.Base},bridge:{cash:1,debt:2,otherClaims:0}},alternative:{scenario:'Bull',assumptions:{...presets.Anthropic.Bull,g1:.6112345678901234},bridge:{cash:9.75,debt:1,otherClaims:.5}},landscape:{rates:[.0871234567890123,.105,.129,.18],margins:[.041,.0837,.141,.397],target:500.1234567890123}});
const metadata=(id='case-1')=>({id,title:'Scale must earn its capital',createdAt:stamp,updatedAt:stamp,notes:{rationale:'Growth needs operating leverage.\nReinvestment must remain affordable.',keyAssumption:'Sales / invested capital',reviewTrigger:'Review after the next operating disclosure.'},sourceIds:['S04','S18','S19']});
const single=()=>createScenarioEntry(scenario(),metadata(),research);
const pair=()=>createThesisEntry(thesis(),metadata('pair-1'),research);
const brief=(entry,overrides={})=>{
  assert.equal(typeof renderer.createCasebookBrief,'function','createCasebookBrief must export an inspectable standalone document');
  return renderer.createCasebookBrief({entry,research,baseUrl,...overrides});
};
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function reopening(html){
  const match=html.match(/<a\b[^>]*id="casebook-reopen"[^>]*href="([^"]+)"/);
  assert.ok(match,'The brief must expose an exact calculation reopening link.');
  return new URL(match[1].replaceAll('&amp;','&'));
}

test('research briefs recalculate scenario EV and hypothetical equity without accepting saved outputs',()=>{
  const entry=single(),html=brief(entry),result=project(scenario().assumptions);
  assert.ok(html.includes('data-scenario-ev="'+result.ev+'"'));
  assert.ok(html.includes('data-equity-value="'+bridgeEquity(result.ev,scenario().bridge).equityValue+'"'));
  assert.ok(html.includes('Hypothetical equity bridge'));
  assert.ok(html.includes('Operating enterprise value'));
  assert.ok(html.includes(MODEL_VERSION));assert.ok(html.includes(VALUATION_DATE));assert.ok(html.includes(research.researchCutoff));
  assert.throws(()=>brief({...entry,result:{ev:1}}),/unsupported|unexpected/i);
});

test('all thirteen scenario assumptions are present with their exact stored values',()=>{
  const html=brief(single()),snapshot=scenario();
  assert.equal([...html.matchAll(/data-input="/g)].length,13);
  for(const [key,value] of Object.entries(snapshot.assumptions)){
    assert.ok(html.includes('data-input="'+key+'" data-value="'+value+'"'),'Missing exact input '+key);
    assert.ok(html.includes('Stored: '+value),'Exact stored number must remain visible for '+key);
  }
  assert.deepEqual(decodeScenario(reopening(html).hash.slice('#scenario='.length)),snapshot);
  assert.equal(reopening(html).pathname,'/project/index.html');assert.equal(reopening(html).search,'');
});

test('thesis briefs retain both full cases, signed attribution and the exact target window',()=>{
  const html=brief(pair()),snapshot=thesis(),comparison=compareTheses(snapshot.reference.assumptions,snapshot.alternative.assumptions),surface=valuationLandscape(snapshot.alternative.assumptions,snapshot.landscape);
  assert.equal([...html.matchAll(/data-input="/g)].length,26);
  assert.ok(html.includes('data-reference-ev="'+comparison.reference.result.ev+'"'));
  assert.ok(html.includes('data-alternative-ev="'+comparison.alternative.result.ev+'"'));
  assert.ok(html.includes('data-ev-delta="'+comparison.evDelta+'"'));
  for(const group of comparison.attribution.groups)assert.ok(html.includes('data-contribution="'+group.contribution+'"'));
  assert.ok(html.includes('data-target="'+snapshot.landscape.target+'"'));
  for(const point of surface.frontier){
    assert.ok(html.includes('data-frontier-wacc="'+point.wacc+'"'));
    if(point.status==='solved')assert.ok(html.includes('data-required-margin="'+point.margin+'"'));
  }
  assert.ok(html.includes(snapshot.landscape.rates.join(', ')));
  assert.ok(html.includes(snapshot.landscape.margins.join(', ')));
  assert.deepEqual(decodeThesis(reopening(html).hash.slice('#thesis='.length)),snapshot);
  assert.equal(reopening(html).pathname,'/project/thesis.html');
});

test('analyst rationale and review triggers are escaped plain text in a script-free document',()=>{
  const hostile='<img src=x onerror="alert(1)"> & <script>alert(2)</script>',entry=single();
  entry.title=hostile;entry.notes.rationale=hostile;entry.notes.reviewTrigger='Line one\nLine two';
  const html=brief(entry),tags=html.match(/<[^>]*>/g)??[];
  assert.ok(html.includes(escape(hostile)));assert.ok(html.includes('Line one\nLine two'));
  assert.ok(html.includes('Analyst argument'));assert.ok(html.includes('Key assumption'));assert.ok(html.includes('Review trigger'));
  assert.ok(!/<script\b/i.test(html));
  assert.ok(tags.every(tag=>!/\son[a-z]+\s*=/i.test(tag)));
  assert.ok(!/<link\b[^>]*rel="stylesheet"/i.test(html));
  assert.ok(html.includes('@media print'));
});

test('selected evidence retains source dates, publication class, purpose and limitations',()=>{
  const html=brief(single());
  for(const id of ['S04','S18','S19']){
    const source=research.sources.find(item=>item.id===id);
    assert.ok(html.includes('id="source-'+id+'"'));
    for(const field of ['date','publisher','title','type','use','limit'])assert.ok(html.includes(escape(source[field])),'Missing '+id+' '+field);
  }
  assert.ok(html.includes('Analyst-selected'));
  assert.ok(html.includes('do not establish')||html.includes('does not establish'));
  assert.ok(html.includes('calculation link')&&html.includes('notes'));
});

test('unsafe source protocols are never emitted as active links',()=>{
  const snapshot=structuredClone(research);
  snapshot.sources.find(item=>item.id==='S04').url='javascript:alert(1)';
  snapshot.sources.find(item=>item.id==='S18').url='data:text/html,unsafe';
  const html=brief(single(),{research:snapshot});
  assert.ok(!/href="(?:javascript:|data:)/i.test(html));
  assert.ok(html.includes(escape(snapshot.sources.find(item=>item.id==='S04').title)));
  for(const base of ['javascript:alert(1)','file:///tmp/book.html','data:text/html,book'])assert.throws(()=>brief(single(),{baseUrl:base}),/HTTP|URL/i);
});

test('negative operating values are retained and empty analyst notes are explicit',()=>{
  const snapshot={company:'OpenAI',scenario:'Bear',assumptions:{...presets.OpenAI.Bear},bridge:null};
  const entry=createScenarioEntry(snapshot,{id:'negative',title:'Downside review',createdAt:stamp,updatedAt:stamp},research),html=brief(entry),ev=project(snapshot.assumptions).ev;
  assert.ok(ev<0);assert.ok(html.includes('data-scenario-ev="'+ev+'"'));
  assert.ok(html.includes('Not recorded.'));
  assert.ok(html.includes('No sources were selected'));
  assert.ok(html.includes('Negative operating EV')||html.includes('negative operating EV'));
  assert.ok(!html.includes('data-equity-value='));
});

test('brief creation rejects an incompatible research snapshot and leaves supplied data unchanged',()=>{
  const entry=pair(),before=structuredClone({entry,research});
  brief(entry);assert.deepEqual({entry,research},before);
  assert.throws(()=>brief(entry,{research:{...research,modelVersion:'999.0.0'}}),/matching|snapshot|model/i);
  assert.throws(()=>brief({...entry,sourceIds:['S99']}),/source/i);
});
