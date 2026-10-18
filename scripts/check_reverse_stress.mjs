// Optional numerical review: node scripts/check_reverse_stress.mjs
import {project,reverseGrowth} from '../public/lib/model.js';
import fs from 'node:fs';
const base={rev2026:53.26,g1:.45,g2:.24,g3:.12,m27:-.02,m30:.18,m36:.22,turns:2.5,wacc:.125,tg:.03,roic:.2,stub:-3,tax:.25};
const result={edgeCases:[], randomCases:0, failedKnownRoots:[]};
for(const p of [{...base,wacc:Number.MIN_VALUE,tg:0},{...base,wacc:1e-310,tg:0}]) {
  const edge={assumptions:p};
  try{edge.project=project(p).ev;}catch(e){edge.projectError=e.message;}
  try{edge.reverse=reverseGrowth(p,100);}catch(e){edge.reverseError=e.message;}
  result.edgeCases.push(edge);
}
let seed=10182026;
function rnd(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
for(let i=0;i<20000;i++) {
  const tg=.06*rnd(), wacc=tg+.02+.3*rnd(), roic=tg+.005+.6*rnd();
  const p={...base,rev2026:10**(-2+6*rnd()),g1:2*rnd(),g2:2*rnd(),g3:tg+(2-tg)*rnd(),m27:-.8+1.6*rnd(),m30:-.5+1.4*rnd(),m36:.001+.899*rnd(),turns:.05+19.95*rnd(),wacc,tg,roic,stub:-1000*rnd(),tax:.8*rnd()};
  let target=project(p).ev;
  if(!(target>0&&target<=1e12)) continue;
  result.randomCases++;
  const reverse=reverseGrowth(p,target);
  const roots=reverse.status==='solved'?[reverse]:reverse.solutions??[];
  if(!roots.some(s=>Math.abs(s.growth-p.g1)<1e-6)) {
    result.failedKnownRoots.push({assumptions:p,target,reverse});
    if(result.failedKnownRoots.length>=4) break;
  }
}
if(result.failedKnownRoots.length) process.exitCode=1;
console.log(JSON.stringify(result,null,2));
