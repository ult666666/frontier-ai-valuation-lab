// Complete, exact handoffs between the workbench and a two-case comparison.
import {project} from './model.js';
import {encodeScenario,decodeScenario} from './share.js';
import {normalizeThesis,encodeThesis,decodeThesis} from './thesis-share.js';
import {compareTheses,valuationLandscape} from './thesis.js';

const SIDES=['reference','alternative'];
function sideName(side){if(!SIDES.includes(side))throw new Error('Choose the reference or alternative case.');return side;}
function checkedThesis(draft){
  const checked=normalizeThesis(draft);
  compareTheses(checked.reference.assumptions,checked.alternative.assumptions);
  valuationLandscape(checked.alternative.assumptions,checked.landscape);
  return checked;
}
function spaced(lower,upper){return Array.from({length:13},(_,index)=>index===12?upper:lower+(upper-lower)*index/12);}

export function defaultLandscape(assumptions){
  project(assumptions);
  const p=assumptions;
  const rateBounds=p.wacc>=.075&&p.wacc<=.195?[.075,.195]:[Math.max(0,p.wacc-.06),Math.min(.6,p.wacc+.06)];
  const marginBounds=p.m36>=.06&&p.m36<=.42?[.06,.42]:[Math.max(0,p.m36-.18),Math.min(1,p.m36+.18)];
  return {rates:spaced(...rateBounds),margins:spaced(...marginBounds),target:500};
}

export function inspectionUrl(base,draft,side){
  sideName(side);
  const url=new URL(base);
  if(!['https:','http:'].includes(url.protocol))throw new Error('Inspection links require an HTTP or HTTPS address.');
  const token=encodeThesis(checkedThesis(draft));
  url.search='';url.hash=`inspect=${side}.${token}`;
  return url.href;
}

export function decodeInspection(hash){
  if(typeof hash!=='string'||hash.length>8230)throw new Error('This comparison inspection link is too large or malformed.');
  const match=/^#inspect=(reference|alternative)\.([A-Za-z0-9_-]{1,8192})$/.exec(hash);
  if(!match)throw new Error('This comparison inspection link is not recognized.');
  const side=match[1],draft=checkedThesis(decodeThesis(match[2]));
  const scenario=decodeScenario(encodeScenario({company:draft.company,...draft[side]}));
  return {side,draft,scenario};
}

export function returnFromInspection(context,scenario){
  if(!context||typeof context!=='object')throw new Error('The surrounding comparison is unavailable.');
  const side=sideName(context.side),draft=normalizeThesis(context.draft),item=decodeScenario(encodeScenario(scenario));
  if(item.company!==draft.company)throw new Error('The inspected case must stay with the comparison company.');
  return checkedThesis({...draft,[side]:{scenario:item.scenario,assumptions:item.assumptions,bridge:item.bridge}});
}

export function applyRequiredMargin(draft,rateIndex){
  const checked=checkedThesis(draft);
  if(!Number.isInteger(rateIndex)||rateIndex<0||rateIndex>=checked.landscape.rates.length)throw new Error('Select a valid cost-of-capital column.');
  const point=valuationLandscape(checked.alternative.assumptions,checked.landscape).frontier[rateIndex];
  if(point.status!=='solved')throw new Error('The target does not have a solved margin inside this window at the selected cost of capital.');
  return checkedThesis({...checked,alternative:{...checked.alternative,assumptions:{...checked.alternative.assumptions,wacc:point.wacc,m36:point.margin}}});
}
