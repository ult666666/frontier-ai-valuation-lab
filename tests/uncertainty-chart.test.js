import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {simulateValuation} from '../public/lib/uncertainty.js';
import {distributionChart,tornadoChart,uncertaintyMoney} from '../public/lib/uncertainty-chart.js';
import {suggestedDistributions,formatDriverValue} from '../public/uncertainty.js';

const presets=JSON.parse(await readFile(new URL('../data/presets.json',import.meta.url),'utf8'));
function run(assumptions,overrides={}){
  const d=suggestedDistributions(assumptions);
  return simulateValuation({assumptions,bridge:null,drivers:['growth','m36','wacc','tg'].map(key=>({key,distribution:d[key]})),correlation:null,draws:600,seed:4,hurdle:300,...overrides});
}
const accessible=svg=>{
  const ids=svg.match(/aria-labelledby="([^"]+)"/)[1].split(' ');
  assert.match(svg,/^<svg [^>]*role="img"/);
  for(const id of ids)assert.match(svg,new RegExp(`id="${id}">[^<]+<`));
  assert.ok(!/NaN|Infinity|undefined/.test(svg));
};

test('the distribution chart has a title, a text equivalent and one bar per bin',()=>{
  const r=run(presets.Anthropic.Base),svg=distributionChart(r,{subject:'Anthropic · Base'});
  accessible(svg);
  assert.equal((svg.match(/data-uncertainty-bin=/g)||[]).length,r.histogram.bins.length);
  for(const key of ['p5','p25','p50','p75','p95'])assert.ok(svg.includes(uncertaintyMoney(r.summary.percentiles[key])),key);
  assert.ok(svg.includes('Hurdle')&&svg.includes('of draws exceed'));
});

test('markers outside the plotted range are described instead of drawn',()=>{
  const r=run(presets.Anthropic.Base,{hurdle:5000}),svg=distributionChart(r);
  accessible(svg);
  assert.ok(!svg.includes('class="uq-hurdle-line"'));
  assert.ok(svg.includes('which lies outside the plotted range'));
});

test('the tornado chart draws one bar per driver in swing order and escapes text',()=>{
  const r=run(presets.OpenAI.Bull),svg=tornadoChart(r,{subject:'<img src=x onerror=alert(1)>',format:formatDriverValue});
  accessible(svg);
  assert.deepEqual([...svg.matchAll(/data-uncertainty-tornado="([^"]+)"/g)].map(match=>match[1]),r.tornado.bars.map(bar=>bar.key));
  assert.ok(!svg.includes('<img')&&svg.includes('&lt;img'));
});

test('zero-spread results still render finite charts',()=>{
  const a=presets.OpenAI.Bear;
  const drivers=['m36','wacc'].map(key=>({key,distribution:{type:'triangular',min:a[key],mode:a[key],max:a[key]}}));
  const r=simulateValuation({assumptions:a,bridge:null,drivers,correlation:null,draws:200,seed:1,hurdle:null});
  accessible(distributionChart(r));accessible(tornadoChart(r));
  assert.equal(r.histogram.bins.length,1);
});

test('driver values are formatted in their display units',()=>{
  assert.equal(formatDriverValue('growth',1.166),'×1.166');
  assert.equal(formatDriverValue('wacc',.125),'12.5%');
  assert.equal(formatDriverValue('tg',.0245),'2.45%');
  assert.equal(uncertaintyMoney(-13.16),'−$13.2B');
});
