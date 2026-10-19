import test from 'node:test';
import assert from 'node:assert/strict';
import presets from '../data/presets.json' with {type:'json'};
import research from '../data/research.json' with {type:'json'};
import {project,bridgeEquity} from '../public/lib/model.js';
import {decodeThesis,thesisUrl} from '../public/lib/thesis-share.js';
import {createThesisBrief} from '../public/lib/thesis-brief.js';

const draft=()=>({company:'OpenAI',reference:{scenario:'Base',assumptions:{...presets.OpenAI.Base},bridge:null},alternative:{scenario:'Bull',assumptions:{...presets.OpenAI.Bull,g1:.6333333333333333},bridge:{cash:20,debt:5,otherClaims:1}},landscape:{rates:[.08,.10,.12,.14],margins:[.06,.16,.26,.36],target:500}});
const make=(d=draft(),evidence=research)=>createThesisBrief({draft:d,research:evidence,shareUrl:'https://example.test/project/thesis.html?old=1#old'});

test('comparison brief recomputes the active cases and exact EV change',()=>{
  const d=draft(),a=project(d.reference.assumptions),b=project(d.alternative.assumptions),html=make(d);
  assert.match(html,/<title>OpenAI .*Comparison brief<\/title>/);
  assert.ok(html.includes(`data-reference-ev="${a.ev}"`));assert.ok(html.includes(`data-alternative-ev="${b.ev}"`));
  assert.ok(html.includes(`data-ev-delta="${b.ev-a.ev}"`));
  assert.ok(html.includes('18 October 2026'));assert.ok(html.includes('720'));assert.ok(html.includes('64'));
  assert.ok(html.includes('operating enterprise value'));assert.ok(html.includes('not a probability'));
});

test('all 13 assumptions and all ten paired annual forecast rows remain inspectable',()=>{
  const d=draft(),html=make(d),a=project(d.reference.assumptions),b=project(d.alternative.assumptions);
  assert.equal([...html.matchAll(/data-assumption="/g)].length,13);
  for(const key of Object.keys(d.reference.assumptions)){
    const row=html.match(new RegExp(`<tr data-assumption="${key}"[^>]*>(.*?)</tr>`,'s'))?.[1];
    assert.ok(row,key);assert.ok(row.includes(`data-value="${d.reference.assumptions[key]}"`));assert.ok(row.includes(`data-value="${d.alternative.assumptions[key]}"`));
  }
  assert.equal([...html.matchAll(/data-year="/g)].length,10);
  for(let i=0;i<10;i++){
    const row=html.match(new RegExp(`<tr data-year="${a.rows[i].year}"[^>]*>(.*?)</tr>`,'s'))?.[1];
    for(const key of ['revenue','fcf','pv']){
      assert.ok(row.includes(`data-reference-${key}="${a.rows[i][key]}"`));
      assert.ok(row.includes(`data-alternative-${key}="${b.rows[i][key]}"`));
    }
  }
});

test('signed group contributions reconcile and never blend a hypothetical equity bridge into EV',()=>{
  const d=draft(),html=make(d),a=project(d.reference.assumptions),b=project(d.alternative.assumptions);
  const contributions=[...html.matchAll(/<tr data-group="[^"]+" data-contribution="([^"]+)"/g)].map(m=>Number(m[1]));
  assert.equal(contributions.length,6);assert.ok(Math.abs(contributions.reduce((s,v)=>s+v,0)-(b.ev-a.ev))<1e-8);
  const equity=bridgeEquity(b.ev,d.alternative.bridge);
  assert.ok(html.includes(`data-equity-value="${equity.equityValue}"`));assert.ok(html.includes('Hypothetical equity bridge'));
  assert.ok(html.includes('does not enter the operating EV attribution'));
});

test('negative reference values remain negative and their percentage change is undefined',()=>{
  const d=draft();d.reference={scenario:'Bear',assumptions:{...presets.OpenAI.Bear},bridge:null};
  const html=make(d);assert.ok(html.includes(`data-reference-ev="${project(d.reference.assumptions).ev}"`));
  assert.ok(html.includes('Undefined for nonpositive reference EV'));assert.ok(!html.includes('NaN'));assert.ok(!html.includes('Infinity'));
});

test('the exact two-case link is rebuilt from the current draft; document contains no executable content',()=>{
  const d=draft(),html=make(d),match=html.match(/id="reopen-thesis" href="([^"]+)"/);
  assert.ok(match);const url=new URL(match[1].replaceAll('&amp;','&'));assert.equal(url.search,'');
  assert.deepEqual(decodeThesis(url.hash.slice('#thesis='.length)),d);
  assert.ok(!/<script\b|\son\w+=|<iframe\b/i.test(html));assert.ok(html.includes('@page'));assert.ok(html.includes('Reference workbench'));assert.ok(html.includes('Alternative workbench'));
  assert.throws(()=>createThesisBrief({draft:d,research,shareUrl:'javascript:alert(1)'}),/HTTP/);
});

test('target frontier and axis window are labeled as conditional and include every displayed rate',()=>{
  const d=draft(),html=make(d);assert.ok(html.includes('Target operating EV'));
  assert.equal([...html.matchAll(/data-frontier-rate="/g)].length,d.landscape.rates.length);
  for(const rate of d.landscape.rates)assert.ok(html.includes(`data-frontier-rate="${rate}"`));
  assert.ok(html.includes('other eleven'));assert.ok(html.includes('2031–2036'));assert.match(html,/displayed margin range/i);
});

test('source context is escaped, uses safe URLs and does not claim sources for every assumption',()=>{
  const evidence=structuredClone(research),source=evidence.sources.find(s=>s.id==='S02');
  source.title='<img src=x onerror=alert(1)> "source"';source.url='javascript:alert(1)';source.publisher='A & B';
  const html=make(draft(),evidence);assert.ok(html.includes('&lt;img'));assert.ok(html.includes('A &amp; B'));
  assert.ok(!html.includes('<img src=x'));assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('company evidence does not establish every forecast assumption'));
  assert.ok(html.includes('source-S02'));assert.ok(!html.includes('source-S01'));
});

test('brief refuses incompatible evidence and invalid current cases',()=>{
  assert.throws(()=>make(draft(),{...research,asOf:'2000-01-01'}),/matching/);
  const d=draft();d.alternative.assumptions.wacc=d.alternative.assumptions.tg;assert.throws(()=>make(d));
});

test('finite extreme relative changes remain finite in the displayed percentage',()=>{
  const d=draft();d.company='Anthropic';
  d.reference={scenario:'Base',assumptions:{...presets.Anthropic.Base,rev2026:1e-305,stub:0},bridge:null};
  d.alternative={scenario:'Bull',assumptions:{...presets.Anthropic.Bull},bridge:null};
  const html=make(d);assert.ok(!html.includes('Infinity'));assert.ok(!html.includes('NaN'));
  assert.match(html,/\+2\.707e\+309% relative change/);
});

test('out-of-model but finite landscape axis labels do not overflow their percentage display',()=>{
  const d=draft();d.landscape.rates=[1e307,1e308];d.landscape.margins=[1e307,1e308];
  const html=make(d);assert.ok(!html.includes('Infinity'));assert.ok(!html.includes('NaN'));
  assert.ok(html.includes('1.000e+310%'));assert.ok(html.includes('Unavailable'));
});
