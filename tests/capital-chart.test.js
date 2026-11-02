import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {capitalPlanChart,CAPITAL_CHART_THEMES} from '../public/lib/capital-chart.js';
import {createCapitalExample} from '../public/lib/capital-example.js';

const presets=JSON.parse(await readFile(new URL('../data/presets.json',import.meta.url),'utf8'));
const analysis=createCapitalExample(presets).analysis;

// WCAG 2.2 relative luminance and contrast ratio.
function luminance(hex){
  const value=hex.replace('#','');
  const full=value.length===3?[...value].map(c=>c+c).join(''):value;
  const [r,g,b]=[0,2,4].map(i=>parseInt(full.slice(i,i+2),16)/255).map(c=>c<=.03928?c/12.92:((c+.055)/1.055)**2.4);
  return .2126*r+.7152*g+.0722*b;
}
const contrast=(a,b)=>{const [hi,lo]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (hi+.05)/(lo+.05);};

test('the dark theme stays the default, so saved briefs keep their chart',()=>{
  for(const options of [{},{compact:true},{workspace:true},{workspace:true,narrow:true},{selectedPlanId:'b'}]){
    assert.equal(capitalPlanChart(analysis,options),capitalPlanChart(analysis,{...options,theme:'dark'}));
  }
  assert.ok(capitalPlanChart(analysis).includes('fill="#102b35"'));
  assert.throws(()=>capitalPlanChart(analysis,{theme:'sepia'}),/Unknown chart theme/);
});

test('the light theme draws on a white plot and changes no plotted value',()=>{
  const dark=capitalPlanChart(analysis,{workspace:true,selectedPlanId:'a'});
  const light=capitalPlanChart(analysis,{workspace:true,selectedPlanId:'a',theme:'light'});
  assert.ok(light.includes(`fill="${CAPITAL_CHART_THEMES.light.background}"`));
  assert.ok(!light.includes('#102b35'));
  const geometry=svg=>[...svg.matchAll(/\s(?:x|y|x1|y1|x2|y2|cx|cy|r|width|height|d)="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(geometry(light),geometry(dark));
  const text=svg=>[...svg.matchAll(/>([^<>]+)</g)].map(match=>match[1]);
  assert.deepEqual(text(light),text(dark));
});

test('light theme text and markers keep WCAG contrast on the plot and the qualifying zone',()=>{
  const t=CAPITAL_CHART_THEMES.light;
  // The zone is drawn fully opaque in the light theme, so its fill is the backdrop.
  assert.equal(t.zoneOpacity,'1');
  for(const backdrop of [t.background,t.zone]){
    for(const textColor of [t.tick,t.axis,t.legend,t.objective,t.zoneLabel,...t.palette]){
      assert.ok(contrast(textColor,backdrop)>=4.5,`${textColor} on ${backdrop} is ${contrast(textColor,backdrop).toFixed(2)}:1`);
    }
    for(const mark of [t.guide,t.baseline,t.ring]){
      assert.ok(contrast(mark,backdrop)>=3,`${mark} on ${backdrop} is ${contrast(mark,backdrop).toFixed(2)}:1`);
    }
  }
});
