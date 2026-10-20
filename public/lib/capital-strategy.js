/**
 * A finite comparison of hypothetical primary equity plans.
 * Amounts are USD billions. Proceeds remain cash and operations are unchanged.
 * Signed allocations are model residuals, not limited-liability share values.
 */
import {project,bridgeEquity,MODEL_VERSION,VALUATION_DATE} from './model.js';
import {valueHorizon,HORIZON_MAX_YEARS} from './horizon.js';
import {financingLens,FINANCING_MAX_AMOUNT} from './financing.js';
import {ownershipFrontier} from './ownership.js';

export const CAPITAL_VERSION='1.0.0';
const BAND=32*Number.EPSILON;
const ASSUMPTION_KEYS=['rev2026','g1','g2','g3','m27','m30','m36','turns','wacc','tg','roic','stub','tax'];
const SNAPSHOT_KEYS=['company','scenarios','plans','policy','bridge'];
const POLICY_KEYS=['capitalTarget','retentionFloor','modelCoverageFloor','holderStake'];
const BRIDGE_KEYS=['cash','debt','otherClaims'];
const ID=/^[a-z][a-z0-9-]{0,23}$/;
const CONTROL=/[\u0000-\u001f\u007f-\u009f]/u;
const MISSING_BRIDGE='No hypothetical current equity bridge was supplied; modeled equity residuals and their allocations are unavailable.';

function record(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error(`${label} must be a plain object.`);
  const own=Reflect.ownKeys(value);
  if(own.length!==keys.length||own.some(key=>typeof key!=='string'||!keys.includes(key)))throw new Error(`${label} has missing or unsupported fields.`);
  const output={};
  for(const key of keys){
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor||!Object.hasOwn(descriptor,'value')||!descriptor.enumerable)throw new Error(`${label}.${key} must be an enumerable own data property.`);
    output[key]=descriptor.value===0?0:descriptor.value;
  }
  return output;
}

function list(value,maximum,label){
  if(!Array.isArray(value)||value.length<1||value.length>maximum)throw new Error(`${label} must contain 1–${maximum} items.`);
  const keys=Reflect.ownKeys(value),output=[];
  if(keys.length!==value.length+1||keys.some(key=>typeof key!=='string'||(key!=='length'&&!/^(0|[1-9][0-9]*)$/.test(key))))throw new Error(`${label} must be a dense array with no custom properties.`);
  for(let index=0;index<value.length;index++){
    const descriptor=Object.getOwnPropertyDescriptor(value,String(index));
    if(!descriptor||!Object.hasOwn(descriptor,'value')||!descriptor.enumerable)throw new Error(`${label} must contain enumerable own data elements, without holes or accessors.`);
    output.push(descriptor.value);
  }
  return output;
}

function identity(value,label){
  if(typeof value.id!=='string'||!ID.test(value.id))throw new Error(`${label} id must start with a lowercase letter and contain at most 24 lowercase letters, digits or hyphens.`);
  if(typeof value.label!=='string'||[...value.label].length<1||[...value.label].length>60||CONTROL.test(value.label))throw new Error(`${label} label must contain 1–60 Unicode code points without control characters.`);
  // A lone surrogate survives JSON escaping but changes during UTF-8 HTML
  // export. Match the well-formed Unicode contract used by decision prose.
  if([...value.label].some(character=>{const point=character.codePointAt(0);return point>=0xD800&&point<=0xDFFF;}))throw new Error(`${label} label must contain well-formed Unicode text.`);
}

function number(value,minimum,maximum,label){
  if(typeof value!=='number'||!Number.isFinite(value)||value<minimum||value>maximum)throw new Error(`${label} must be finite and between ${minimum} and ${maximum}.`);
  return value===0?0:value;
}

function unique(items,label){
  if(new Set(items.map(item=>item.id)).size!==items.length)throw new Error(`${label} identifiers must be unique.`);
}

/** Relative comparison without subtracting potentially overflowing amounts. */
function compare(a,b){
  if(a===b)return 0;
  const scale=Math.max(Math.abs(a),Math.abs(b));
  const difference=a/scale-b/scale;
  return Math.abs(difference)<=BAND?0:difference>0?1:-1;
}

function product(a,b){
  const result=a*b;
  return Number.isFinite(result)&&!(result===0&&a!==0&&b!==0)?(result===0?0:result):null;
}

function ratio(a,b){
  const result=a/b;
  return Number.isFinite(result)&&!(result===0&&a!==0)?(result===0?0:result):null;
}

function sum(a,b){const result=a+b;return Number.isFinite(result)?(result===0?0:result):null;}

function covers(model,quote,floor){
  // Positive quotes and positive coverage floors cannot be covered by zero or
  // negative residuals, even when a subnormal quote times its floor rounds away.
  if(model<=0)return false;
  const scale=Math.max(model,quote);
  return compare(model/scale,(quote/scale)*floor)>=0;
}

/** Every listed case is validated in full; none is dropped on failure. */
export function validateCapitalSnapshot(snapshot){
  const input=record(snapshot,SNAPSHOT_KEYS,'Capital snapshot');
  if(!['Anthropic','OpenAI'].includes(input.company))throw new Error('Company must be Anthropic or OpenAI.');
  const policy=record(input.policy,POLICY_KEYS,'Policy');
  policy.capitalTarget=number(policy.capitalTarget,0,FINANCING_MAX_AMOUNT,'Capital objective');
  policy.retentionFloor=number(policy.retentionFloor,.01,1,'Retained-stake floor');
  policy.modelCoverageFloor=number(policy.modelCoverageFloor,.1,10,'Model-value coverage floor');
  policy.holderStake=number(policy.holderStake,0,1,'Tracked holder stake');
  const bridge=input.bridge===null?null:record(input.bridge,BRIDGE_KEYS,'Hypothetical bridge');
  if(bridge!==null)bridgeEquity(0,bridge);
  const scenarios=list(input.scenarios,9,'Scenarios').map((value,index)=>{
    const item=record(value,['id','label','assumptions','continuationYears'],`Scenario ${index+1}`);
    identity(item,`Scenario ${index+1}`);
    const assumptions=record(item.assumptions,ASSUMPTION_KEYS,`Scenario ${item.id} assumptions`);
    project(assumptions);
    const years=item.continuationYears;
    if(years!==null&&(!Number.isInteger(years)||years<0||years>HORIZON_MAX_YEARS))throw new Error(`Scenario ${item.id} continuation years must be null or a whole number from 0 to ${HORIZON_MAX_YEARS}.`);
    if(years!==null)valueHorizon(assumptions,{years});
    return {id:item.id,label:item.label,assumptions,continuationYears:years};
  });
  unique(scenarios,'Scenario');
  const plans=list(input.plans,6,'Plans').map((value,index)=>{
    const item=record(value,['id','label','basis','quote','primaryCapital'],`Plan ${index+1}`);
    identity(item,`Plan ${index+1}`);
    financingLens(scenarios[0].assumptions,{round:{basis:item.basis,quote:item.quote,primaryCapital:item.primaryCapital,holderStake:policy.holderStake},bridge:null});
    return item;
  });
  unique(plans,'Plan');
  return {company:input.company,scenarios,plans,policy,bridge};
}

function scenarioResults(snapshot){
  return snapshot.scenarios.map(item=>{
    const horizon=item.continuationYears===null?null:valueHorizon(item.assumptions,{years:item.continuationYears});
    const baseline=horizon===null?project(item.assumptions):horizon.baseline;
    const operatingEv=horizon===null?baseline.ev:horizon.selected.ev;
    const warnings=[...baseline.warnings];
    if(horizon!==null)warnings.push(`Finite continuation includes ${item.continuationYears} annual periods after 2036 and assigns zero residual value after that cutoff.`);
    let modelPreMoneyEquity=null;
    if(snapshot.bridge===null)warnings.push(MISSING_BRIDGE);
    else{
      const residual=bridgeEquity(operatingEv,snapshot.bridge).equityValue;
      if(Number.isFinite(residual))modelPreMoneyEquity=residual===0?0:residual;
      else warnings.push('The modeled pre-money equity residual exceeds the supported numeric range.');
      if(modelPreMoneyEquity!==null&&modelPreMoneyEquity<=0)warnings.push('The nonpositive modeled residual is preserved; it is not a limited-liability common-share valuation.');
    }
    return {id:item.id,label:item.label,assumptions:{...item.assumptions},continuationYears:item.continuationYears,operatingEv,perpetualEv:baseline.ev,modelPreMoneyEquity,warnings};
  });
}

function planResults(snapshot){
  return snapshot.plans.map(item=>{
    const round={basis:item.basis,quote:item.quote,primaryCapital:item.primaryCapital,holderStake:snapshot.policy.holderStake};
    const pricing=financingLens(snapshot.scenarios[0].assumptions,{round,bridge:null}).pricing;
    const ownership=ownershipFrontier(round,{retentionFloor:snapshot.policy.retentionFloor});
    const meetsCapital=compare(item.primaryCapital,snapshot.policy.capitalTarget)>=0;
    const meetsRetention=ownership.current.status!=='below-floor';
    return {id:item.id,label:item.label,round,pricing,capitalGap:item.primaryCapital-snapshot.policy.capitalTarget,
      meetsCapital,retainedFraction:pricing.existingOwnership,meetsRetention,eligible:meetsCapital&&meetsRetention,ownership};
  });
}

function matrixResults(snapshot,scenarios,plans){
  return scenarios.flatMap(s=>plans.map(p=>{
    const warnings=[],modelPreMoneyEquity=s.modelPreMoneyEquity;
    let modelPostMoneyEquity=null,existingCohortAllocation=null,trackedHolderAllocation=null,modelToQuote=null,meetsModelCoverage=null;
    if(modelPreMoneyEquity===null)warnings.push(MISSING_BRIDGE);
    else{
      modelPostMoneyEquity=sum(modelPreMoneyEquity,p.round.primaryCapital);
      if(modelPostMoneyEquity===null)warnings.push('The post-money modeled residual exceeds the supported numeric range.');
      else{
        existingCohortAllocation=product(p.retainedFraction,modelPostMoneyEquity);
        if(existingCohortAllocation===null)warnings.push('The signed existing-cohort allocation cannot be resolved at the supported numeric precision.');
        else{
          trackedHolderAllocation=product(snapshot.policy.holderStake,existingCohortAllocation);
          if(trackedHolderAllocation===null)warnings.push('The tracked holder allocation is below the supported numeric resolution.');
        }
      }
      modelToQuote=ratio(modelPreMoneyEquity,p.pricing.preMoney);
      if(modelToQuote===null)warnings.push('The model-value/quote ratio is outside the supported numeric range; its scaled threshold comparison remains available.');
      meetsModelCoverage=covers(modelPreMoneyEquity,p.pricing.preMoney,snapshot.policy.modelCoverageFloor);
      if(modelPreMoneyEquity<=0||existingCohortAllocation!==null&&existingCohortAllocation<0)warnings.push('Signed residual allocations are preserved and do not value limited-liability common shares.');
    }
    return {scenarioId:s.id,planId:p.id,modelPreMoneyEquity,modelPostMoneyEquity,existingCohortAllocation,trackedHolderAllocation,
      modelToQuote,meetsModelCoverage,regret:null,warnings};
  }));
}

// Exact binary rational arithmetic is limited to pairwise share ledgers. It
// prevents cancellation of almost-equal slopes, without changing the FCFF
// engine or asserting that a floating-point DCF is exact.
function binaryParts(value){
  if(value===0)return [0n,0];
  const view=new DataView(new ArrayBuffer(8));view.setFloat64(0,value,false);
  const bits=view.getBigUint64(0,false),exponent=Number((bits>>52n)&2047n);
  return [(bits&((1n<<52n)-1n))+(exponent===0?0n:1n<<52n),exponent===0?-1074:exponent-1075];
}

function fraction(n,d=1n){
  if(d<0n){n=-n;d=-d;}
  if(n===0n)return {n:0n,d:1n};
  let a=n<0n?-n:n,b=d;
  while(b!==0n){const remainder=a%b;a=b;b=remainder;}
  return {n:n/a,d:d/a};
}

function numberFraction(value){
  const [mantissa,exponent]=binaryParts(value);
  return exponent>=0?fraction(mantissa<<BigInt(exponent)):fraction(mantissa,1n<<BigInt(-exponent));
}

const addFraction=(a,b)=>fraction(a.n*b.d+b.n*a.d,a.d*b.d);
const subtractFraction=(a,b)=>fraction(a.n*b.d-b.n*a.d,a.d*b.d);
const multiplyFraction=(a,b)=>fraction(a.n*b.n,a.d*b.d);
const divideFraction=(a,b)=>fraction(a.n*b.d,a.d*b.n);

/** Round a rational once to binary64, including subnormals and even ties. */
function fractionNumber(value){
  if(value.n===0n)return 0;
  const negative=value.n<0n,n=negative?-value.n:value.n,d=value.d;
  let exponent=n.toString(2).length-d.toString(2).length;
  if(exponent>=0?n<(d<<BigInt(exponent)):(n<<BigInt(-exponent))<d)exponent--;
  if(exponent>1023||exponent<-1075)return null;
  const shift=exponent>=-1022?52-exponent:1074;
  const numerator=shift>=0?n<<BigInt(shift):n,denominator=shift>=0?d:d<<BigInt(-shift);
  let quotient=numerator/denominator;
  const remainder=numerator%denominator,twice=remainder*2n;
  if(twice>denominator||(twice===denominator&&(quotient&1n)===1n))quotient++;
  const result=Number(quotient)*2**(exponent>=-1022?exponent-52:-1074);
  return Number.isFinite(result)&&result!==0?(negative?-result:result):null;
}

function shareLedger(plan){
  // Use the exact binary values ENTERED by the analyst. In particular, do not
  // import an already-rounded quote+raise (or quote-raise) from pricing output.
  const quote=numberFraction(plan.round.quote),capital=numberFraction(plan.round.primaryCapital);
  const pre=plan.round.basis==='pre'?quote:subtractFraction(quote,capital);
  const post=plan.round.basis==='post'?quote:addFraction(quote,capital);
  const retained=divideFraction(pre,post);
  return {capital,retained,intercept:multiplyFraction(retained,capital)};
}

function crossoverPoint(a,b,slope){
  const point=divideFraction(subtractFraction(b.intercept,a.intercept),slope);
  return {equityResidual:fractionNumber(point),allocation:fractionNumber(multiplyFraction(a.retained,addFraction(point,a.capital)))};
}

function crossover(a,b,range){
  const empty={planA:a.id,planB:b.id,eligiblePair:a.eligible&&b.eligible,status:'unavailable',equityResidual:null,
    allocation:null,inSelectedRange:null,higherResidualPreferred:null,lowerResidualPreferred:null};
  const ra=a.retainedFraction,rb=b.retainedFraction,ba=product(ra,a.round.primaryCapital),bb=product(rb,b.round.primaryCapital);
  if(ba===null||bb===null)return empty;
  const ledgerA=shareLedger(a),ledgerB=shareLedger(b),exactSlope=subtractFraction(ledgerA.retained,ledgerB.retained);
  if(exactSlope.n===0n){
    if(a.round.primaryCapital===b.round.primaryCapital)return {...empty,status:'identical'};
    const preference=compare(ba,bb),preferred=preference>0?a.id:preference<0?b.id:null;
    return {...empty,status:'parallel',higherResidualPreferred:preferred,lowerResidualPreferred:preferred};
  }
  if(compare(ra,rb)===0)return empty;
  const exactPoint=crossoverPoint(ledgerA,ledgerB,exactSlope);
  if(exactPoint.equityResidual===null||exactPoint.allocation===null)return empty;
  const {equityResidual,allocation}=exactPoint;
  const left=ra*(equityResidual+a.round.primaryCapital),right=rb*(equityResidual+b.round.primaryCapital);
  if(![left,right].every(Number.isFinite))return empty;
  const scale=Math.max(Math.abs(left),Math.abs(right),Math.abs(ra*equityResidual),Math.abs(rb*equityResidual),Math.abs(ba),Math.abs(bb));
  if(scale>0&&(Math.abs(left/scale-right/scale)>BAND||Math.abs(left/scale-allocation/scale)>BAND||Math.abs(right/scale-allocation/scale)>BAND))return empty;
  const inSelectedRange=range.minEquity===null?null:compare(equityResidual,range.minEquity)>=0&&compare(equityResidual,range.maxEquity)<=0;
  return {...empty,status:'finite',equityResidual:equityResidual===0?0:equityResidual,allocation,inSelectedRange,
    higherResidualPreferred:exactSlope.n>0n?a.id:b.id,lowerResidualPreferred:exactSlope.n>0n?b.id:a.id};
}

function comparisonResults(scenarios,plans,matrix){
  const eligible=plans.filter(p=>p.eligible),eligiblePlanIds=eligible.map(p=>p.id);
  const scenarioIds=scenarios.map(s=>s.id);
  const range=scenarios.every(s=>s.modelPreMoneyEquity!==null)
    ?{minEquity:Math.min(...scenarios.map(s=>s.modelPreMoneyEquity)),maxEquity:Math.max(...scenarios.map(s=>s.modelPreMoneyEquity))}
    :{minEquity:null,maxEquity:null};
  const perScenario=scenarios.map(s=>{
    const required=matrix.filter(item=>item.scenarioId===s.id&&eligiblePlanIds.includes(item.planId));
    if(required.length===0||required.some(item=>item.existingCohortAllocation===null))return {scenarioId:s.id,bestAllocation:null,bestPlanIds:[]};
    const bestAllocation=Math.max(...required.map(item=>item.existingCohortAllocation));
    const bestPlanIds=required.filter(item=>compare(item.existingCohortAllocation,bestAllocation)===0).map(item=>item.planId);
    for(const item of required){
      const regret=bestAllocation-item.existingCohortAllocation;
      item.regret=Number.isFinite(regret)?compare(item.existingCohortAllocation,bestAllocation)===0?0:regret:null;
      if(item.regret===null)item.warnings.push('The scenario regret exceeds the supported numeric range.');
    }
    return {scenarioId:s.id,bestAllocation,bestPlanIds};
  });
  const planMetrics=plans.map(p=>{
    const rows=matrix.filter(item=>item.planId===p.id);
    const allocationsAvailable=rows.every(item=>item.existingCohortAllocation!==null);
    const regretAvailable=p.eligible&&rows.every(item=>item.regret!==null);
    const worstRegret=regretAvailable?Math.max(...rows.map(item=>item.regret)):null;
    return {planId:p.id,eligible:p.eligible,worstRegret,
      worstScenarioIds:worstRegret===null?[]:rows.filter(item=>compare(item.regret,worstRegret)===0).map(item=>item.scenarioId),
      minAllocation:allocationsAvailable?Math.min(...rows.map(item=>item.existingCohortAllocation)):null,
      maxAllocation:allocationsAvailable?Math.max(...rows.map(item=>item.existingCohortAllocation)):null,
      meetsModelCoverageIn:rows.every(item=>item.meetsModelCoverage!==null)?rows.filter(item=>item.meetsModelCoverage).length:null,totalScenarios:scenarios.length};
  });
  const comparisonsAvailable=eligible.length>0&&planMetrics.filter(item=>item.eligible).every(item=>item.worstRegret!==null);
  let minimax={status:eligible.length===0?'no-eligible-plans':'unavailable',planIds:[],worstRegret:null};
  if(comparisonsAvailable){
    const best=Math.min(...planMetrics.filter(item=>item.eligible).map(item=>item.worstRegret));
    minimax={status:'available',planIds:planMetrics.filter(item=>item.eligible&&compare(item.worstRegret,best)===0).map(item=>item.planId),worstRegret:best};
  }
  const dominanceStatus=eligible.length===0?'no-eligible-plans':comparisonsAvailable?'available':'unavailable',dominance=[];
  if(comparisonsAvailable)for(const a of eligible)for(const b of eligible){
    if(a.id===b.id)continue;
    const differences=scenarioIds.map(id=>compare(matrix.find(item=>item.scenarioId===id&&item.planId===a.id).existingCohortAllocation,
      matrix.find(item=>item.scenarioId===id&&item.planId===b.id).existingCohortAllocation));
    if(differences.every(value=>value>=0)&&differences.some(value=>value>0))dominance.push({dominatingPlanId:a.id,dominatedPlanId:b.id});
  }
  const crossovers=[];
  for(let a=0;a<plans.length;a++)for(let b=a+1;b<plans.length;b++)crossovers.push(crossover(plans[a],plans[b],range));
  return {eligiblePlanIds,scenarioIds,metric:'existing-cohort-signed-residual',range,perScenario,planMetrics,minimax,dominance,dominanceStatus,crossovers};
}

function envelopeResults(snapshot,scenarios,plans,matrix,warnings){
  const floor=snapshot.policy.retentionFloor;
  const allResiduals=scenarios.every(s=>s.modelPreMoneyEquity!==null);
  const minimum=allResiduals?Math.min(...scenarios.map(s=>s.modelPreMoneyEquity)):null;
  const modelQuoteCeiling=minimum===null?null:ratio(minimum,snapshot.policy.modelCoverageFloor);
  const limitingScenarioIds=minimum===null?[]:scenarios.filter(s=>compare(s.modelPreMoneyEquity,minimum)===0).map(s=>s.id);
  const maximumPrimaryCapital=modelQuoteCeiling!==null&&modelQuoteCeiling>0
    ?floor===1?0:product(modelQuoteCeiling,(1-floor)/floor):null;
  let status=modelQuoteCeiling===null?'unavailable':modelQuoteCeiling<=0?'no-positive-price':maximumPrimaryCapital===null?'unavailable':'available';
  if(allResiduals&&modelQuoteCeiling===null)warnings.push('The selected-set price ceiling cannot be represented at the supported numeric precision.');
  if(modelQuoteCeiling>0&&maximumPrimaryCapital===null)warnings.push('The positive analytical primary-capital ceiling is unresolved; no zero limit has been substituted.');
  if(maximumPrimaryCapital>FINANCING_MAX_AMOUNT)warnings.push('The analytical primary-capital ceiling exceeds the supported input range; the input cap is not an economic financing limit.');
  const intervals=plans.map(p=>{
    const capital=p.round.primaryCapital;
    const noFiniteQuote=floor===1&&capital>0;
    const lowerPreMoney=capital===0?0:noFiniteQuote?null:product(capital,floor/(1-floor));
    const includesLower=lowerPreMoney!==null&&lowerPreMoney>0;
    const cells=matrix.filter(item=>item.planId===p.id);
    const currentQuoteMeets=cells.some(item=>item.meetsModelCoverage===null)?null:p.meetsRetention&&cells.every(item=>item.meetsModelCoverage);
    let planStatus='unavailable';
    if(modelQuoteCeiling!==null){
      if(noFiniteQuote)planStatus='no-finite-quote';
      else if(modelQuoteCeiling<=0)planStatus='no-positive-price';
      else if(lowerPreMoney!==null)planStatus=compare(lowerPreMoney,modelQuoteCeiling)<=0?'compatible':'empty';
    }
    // A post-money quotation must also leave room for its retained primary
    // capital inside the existing quoted-value input cap.
    const quoteInputMaximum=p.round.basis==='pre'?FINANCING_MAX_AMOUNT:FINANCING_MAX_AMOUNT-capital;
    const withinInputRange=planStatus==='unavailable'?null:planStatus==='compatible'&&quoteInputMaximum>0&&lowerPreMoney<=quoteInputMaximum&&compare(lowerPreMoney,Math.min(modelQuoteCeiling,quoteInputMaximum))<=0;
    return {planId:p.id,lowerPreMoney,upperPreMoney:modelQuoteCeiling,status:planStatus,includesLower,withinInputRange,currentQuoteMeets};
  });
  if(intervals.some(item=>item.status==='unavailable')&&status==='available')status='unavailable';
  return {status,modelQuoteCeiling,limitingScenarioIds,maximumPrimaryCapital,plans:intervals};
}

/** Complete JSON-safe result over exactly the submitted cases and plans. */
export function capitalStrategy(snapshot){
  const input=validateCapitalSnapshot(snapshot),scenarios=scenarioResults(input),plans=planResults(input);
  const matrix=matrixResults(input,scenarios,plans),comparison=comparisonResults(scenarios,plans,matrix);
  const warnings=[
    'Scenario counts describe submitted cases and are not probabilities. Comparisons are conditional on these scenarios, plans and the signed cohort-residual metric.',
    'Primary proceeds remain cash and operating forecasts are unchanged. The capital objective is an analyst input, not a forecast of funding need.',
  ];
  if(input.bridge===null)warnings.push(MISSING_BRIDGE);
  const scenarioKeys=input.scenarios.map(s=>JSON.stringify([s.assumptions,s.continuationYears]));
  if(new Set(scenarioKeys).size!==scenarioKeys.length)warnings.push('Some scenarios have identical numerical assumptions and continuation periods. Repetition does not add independent evidence.');
  if(comparison.crossovers.some(item=>item.status==='unavailable'))warnings.push('At least one pairwise crossover is numerically unresolved; no switching point has been replaced with zero.');
  const envelope=envelopeResults(input,scenarios,plans,matrix,warnings);
  return {version:CAPITAL_VERSION,modelVersion:MODEL_VERSION,valuationDate:VALUATION_DATE,snapshot:input,scenarios,plans,matrix,comparison,envelope,
    method:{basis:'finite-scenario-capital-comparison',allocationMetric:'existing-cohort-signed-residual',scenarioWeighting:'none',
      comparisonScope:'eligible-submitted-plans-and-listed-scenarios',proceeds:'retained-as-cash',operations:'unchanged',rights:'equal-participating',fees:0,
      bridgeStatus:input.bridge===null?'not-supplied':'hypothetical',capitalTargetSource:'analyst-input',comparisonBand:BAND,
      quoteInputLimit:FINANCING_MAX_AMOUNT,capitalInputLimit:FINANCING_MAX_AMOUNT,finiteContinuation:'zero-residual-at-cutoff'},warnings};
}
