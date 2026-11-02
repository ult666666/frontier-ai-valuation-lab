/**
 * Valuation under uncertainty: a seeded Monte Carlo simulation and a one-way
 * tornado on the unchanged FCFF engine. Amounts are USD billions.
 * Drivers follow analyst-chosen bounded distributions joined by a Gaussian
 * copula. Percentiles describe those assumptions, not a forecast of either
 * company, and they are not investment advice.
 */
import {project,bridgeEquity,validate,MODEL_VERSION,VALUATION_DATE} from './model.js';
import {createRandom,normalCdf,normalQuantile,RANDOM_ALGORITHM,MAX_SEED} from './random.js';

export const UNCERTAINTY_VERSION='1.0.0';
export const UNCERTAINTY_LIMITS=Object.freeze({minDraws:200,maxDraws:20000,maxDrivers:5,maxHurdle:1e12,replicates:4,stabilityTolerance:.02,histogramBins:24});
export const REPORTED_PERCENTILES=Object.freeze([5,25,50,75,95]);
/** Smallest eigenvalue allowed below zero, and the pivot treated as zero. */
export const PSD_TOLERANCE=1e-10;
const ASSUMPTION_KEYS=['rev2026','g1','g2','g3','m27','m30','m36','turns','wacc','tg','roic','stub','tax'];
const BRIDGE_KEYS=['cash','debt','otherClaims'];
const SPEC_KEYS=['assumptions','bridge','drivers','correlation','draws','seed','hurdle'];
const DISTRIBUTION_KEYS=Object.freeze({uniform:['type','min','max'],triangular:['type','min','mode','max'],normal:['type','mean','sd','min','max']});
const U_MIN=Number.EPSILON/2,U_MAX=1-Number.EPSILON/2;
const WILSON_Z=1.959963984540054; // standard normal 97.5th percentile

export const UNCERTAINTY_DRIVERS=Object.freeze([
  Object.freeze({key:'growth',label:'Revenue growth path',unit:'multiple',domain:[0,10],detail:'Multiplies each 2027–2036 annual growth rate (g1, g2 and g3). A value of 1 keeps the case.'}),
  Object.freeze({key:'m36',label:'Terminal operating margin',unit:'fraction',domain:[-1,1],detail:'2036 EBIT margin. It also sets the 2031–2035 interpolation and the terminal-year margin.'}),
  Object.freeze({key:'wacc',label:'Discount rate (WACC)',unit:'fraction',domain:[0,.6],detail:'Discounts every modeled cash flow, including the remaining-2026 stub and the terminal value.'}),
  Object.freeze({key:'tg',label:'Terminal growth',unit:'fraction',domain:[0,.6],detail:'Perpetual growth after 2036 in the growing-perpetuity terminal value.'}),
  Object.freeze({key:'dilution',label:'Uncompensated dilution',unit:'fraction',domain:[0,.95],detail:'Share of the equity pool issued without cash in this model, such as option grants. Needs a hypothetical bridge.'})
]);
const DRIVER_BY_KEY=new Map(UNCERTAINTY_DRIVERS.map(driver=>[driver.key,driver]));

function plain(value){return Boolean(value)&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));}

// Own enumerable data fields only. Reading an accessor could run caller code.
function record(value,allowed,required,label){
  if(!plain(value))throw new Error(`${label} must be a plain object.`);
  const keys=Reflect.ownKeys(value);
  if(keys.some(key=>typeof key!=='string'||!allowed.includes(key))||required.some(key=>!Object.hasOwn(value,key)))throw new Error(`${label} has missing or unsupported fields.`);
  const output={};
  for(const key of keys){
    const field=Object.getOwnPropertyDescriptor(value,key);
    if(!Object.hasOwn(field,'value')||!field.enumerable)throw new Error(`${label}.${key} must be an enumerable data property.`);
    output[key]=field.value;
  }
  return output;
}

function list(value,minimum,maximum,label){
  if(!Array.isArray(value)||value.length<minimum||value.length>maximum)throw new Error(minimum===maximum?`${label} must contain exactly ${minimum} items.`:`${label} must contain ${minimum}–${maximum} items.`);
  const keys=Reflect.ownKeys(value);
  if(keys.length!==value.length+1||keys.some(key=>typeof key!=='string'||(key!=='length'&&!/^(0|[1-9][0-9]*)$/.test(key))))throw new Error(`${label} must be a dense array with no custom properties.`);
  return Array.from({length:value.length},(_,index)=>{
    const field=Object.getOwnPropertyDescriptor(value,String(index));
    if(!field||!Object.hasOwn(field,'value')||!field.enumerable)throw new Error(`${label} must contain enumerable data elements without holes or accessors.`);
    return field.value;
  });
}

function finite(value,label){
  if(typeof value!=='number'||!Number.isFinite(value))throw new Error(`${label} must be a finite number.`);
  return value===0?0:value;
}

function distribution(value,label){
  if(!plain(value))throw new Error(`${label} must be a plain object.`);
  const field=Object.getOwnPropertyDescriptor(value,'type');
  const type=field&&Object.hasOwn(field,'value')&&field.enumerable?field.value:undefined;
  if(typeof type!=='string'||!Object.hasOwn(DISTRIBUTION_KEYS,type))throw new Error(`${label} type must be uniform, triangular or normal.`);
  const keys=DISTRIBUTION_KEYS[type],output=record(value,keys,keys,label);
  for(const key of keys.slice(1))output[key]=finite(output[key],`${label}.${key}`);
  if(!(output.min<=output.max))throw new Error(`${label} minimum must not exceed its maximum.`);
  if(type==='triangular'&&!(output.min<=output.mode&&output.mode<=output.max))throw new Error(`${label} mode must lie between its minimum and maximum.`);
  if(type==='normal'&&!(output.sd>=0))throw new Error(`${label} standard deviation must be zero or positive.`);
  if(type==='normal'&&!(output.min<=output.mean&&output.mean<=output.max))throw new Error(`${label} mean must lie between its truncation bounds.`);
  return Object.fromEntries(keys.map(key=>[key,output[key]]));
}

const clamp=(value,low,high)=>value<low?low:value>high?high:value;

/** Inverse CDF of a validated bounded distribution. Zero spread returns its single value exactly. */
function quantileFunction(d){
  if(d.min===d.max||(d.type==='normal'&&d.sd===0)){
    const point=d.type==='normal'?d.mean:d.type==='triangular'?d.mode:d.min;
    return ()=>point;
  }
  if(d.type==='uniform')return u=>clamp(d.min+(d.max-d.min)*u,d.min,d.max);
  if(d.type==='triangular'){
    const width=d.max-d.min,split=(d.mode-d.min)/width;
    return u=>clamp(u<split?d.min+Math.sqrt(u*width*(d.mode-d.min)):d.max-Math.sqrt((1-u)*width*(d.max-d.mode)),d.min,d.max);
  }
  // Truncated normal: map u into [Phi(alpha), Phi(beta)] and invert.
  const lower=normalCdf((d.min-d.mean)/d.sd),upper=normalCdf((d.max-d.mean)/d.sd);
  return u=>clamp(d.mean+d.sd*normalQuantile(clamp(lower+u*(upper-lower),U_MIN,U_MAX)),d.min,d.max);
}

/** Quantile of one validated distribution at probability p in (0, 1). */
export function distributionQuantile(value,p){
  if(typeof p!=='number'||!(p>0&&p<1))throw new Error('Quantile probability must be strictly between 0 and 1.');
  return quantileFunction(distribution(value,'Distribution'))(p);
}

/**
 * Cyclic Jacobi eigenvalues of a small symmetric matrix (Golub and Van Loan,
 * Matrix Computations, section 8.5). Square roots are the only non-basic
 * operation, so every runtime returns the same bits. Sorted ascending.
 */
function symmetricEigenvalues(matrix){
  const n=matrix.length,a=matrix.map(row=>[...row]);
  for(let sweep=0;sweep<64;sweep++){
    let off=0;
    for(let p=0;p<n;p++)for(let q=p+1;q<n;q++)off+=a[p][q]*a[p][q];
    if(off<1e-36)break;
    for(let p=0;p<n-1;p++)for(let q=p+1;q<n;q++){
      if(a[p][q]===0)continue;
      const theta=(a[q][q]-a[p][p])/(2*a[p][q]);
      const t=(theta>=0?1:-1)/(Math.abs(theta)+Math.sqrt(theta*theta+1));
      const c=1/Math.sqrt(t*t+1),s=t*c;
      for(let r=0;r<n;r++){const rp=a[r][p],rq=a[r][q];a[r][p]=c*rp-s*rq;a[r][q]=s*rp+c*rq;}
      for(let r=0;r<n;r++){const pr=a[p][r],qr=a[q][r];a[p][r]=c*pr-s*qr;a[q][r]=s*pr+c*qr;}
      a[p][q]=0;a[q][p]=0;
    }
  }
  return a.map((row,index)=>row[index]).sort((x,y)=>x-y);
}

/**
 * Lower-triangular L with L L^T = C for a positive semidefinite C. A pivot at
 * or below PSD_TOLERANCE is an exact linear dependence: that driver's normal
 * score is then a combination of earlier scores and its column stays zero.
 */
function cholesky(matrix){
  const n=matrix.length,factor=matrix.map(()=>Array(n).fill(0));
  for(let j=0;j<n;j++){
    let pivot=matrix[j][j];
    for(let m=0;m<j;m++)pivot-=factor[j][m]*factor[j][m];
    if(pivot<=PSD_TOLERANCE)continue;
    const root=Math.sqrt(pivot);factor[j][j]=root;
    for(let i=j+1;i<n;i++){
      let value=matrix[i][j];
      for(let m=0;m<j;m++)value-=factor[i][m]*factor[j][m];
      factor[i][j]=value/root;
    }
  }
  return factor;
}

/** Validates a correlation matrix and returns its Cholesky factor and spectrum. */
export function correlationFactor(value,size=Array.isArray(value)?value.length:0){
  if(value===null){
    const identity=Array.from({length:size},(_,i)=>Array.from({length:size},(_,j)=>i===j?1:0));
    return {matrix:identity,factor:identity.map(row=>[...row]),eigenvalues:Array(size).fill(1),minEigenvalue:1,reconstructionError:0};
  }
  const rows=list(value,size,size,'Correlation matrix');
  const matrix=rows.map((row,i)=>list(row,size,size,`Correlation row ${i+1}`).map((entry,j)=>{
    const number=finite(entry,`Correlation entry (${i+1}, ${j+1})`);
    if(number<-1||number>1)throw new Error(`Correlation entry (${i+1}, ${j+1}) must be between −1 and 1.`);
    return number;
  }));
  for(let i=0;i<size;i++){
    if(matrix[i][i]!==1)throw new Error('Every diagonal correlation entry must equal 1.');
    for(let j=i+1;j<size;j++)if(matrix[i][j]!==matrix[j][i])throw new Error(`The correlation matrix must be symmetric: entries (${i+1}, ${j+1}) and (${j+1}, ${i+1}) differ.`);
  }
  const eigenvalues=symmetricEigenvalues(matrix),minEigenvalue=eigenvalues[0];
  if(minEigenvalue<-PSD_TOLERANCE)throw new Error(`The correlation matrix is not positive semidefinite: its smallest eigenvalue is ${minEigenvalue.toPrecision(4)}. No set of drivers can have all of these pairwise correlations at once. Reduce the conflicting entries.`);
  const factor=cholesky(matrix);
  let reconstructionError=0;
  for(let i=0;i<size;i++)for(let j=0;j<size;j++){
    let sum=0;for(let m=0;m<size;m++)sum+=factor[i][m]*factor[j][m];
    reconstructionError=Math.max(reconstructionError,Math.abs(sum-matrix[i][j]));
  }
  return {matrix,factor,eigenvalues,minEigenvalue,reconstructionError};
}

const baseValue=(key,assumptions)=>key==='growth'?1:key==='dilution'?0:assumptions[key];

function pointAssumptions(base,keys,values){
  const p={...base};
  for(let j=0;j<keys.length;j++){
    const key=keys[j],x=values[j];
    if(key==='growth'){p.g1=base.g1*x;p.g2=base.g2*x;p.g3=base.g3*x;}
    else if(key!=='dilution')p[key]=x;
  }
  return p;
}

/** Complete validation. Every corner of the driver box must pass the model's own validation. */
export function validateSimulation(spec){
  const input=record(spec,SPEC_KEYS,SPEC_KEYS.filter(key=>key!=='hurdle'),'Simulation');
  const assumptions=record(input.assumptions,ASSUMPTION_KEYS,ASSUMPTION_KEYS,'Assumptions');
  const base=Object.fromEntries(ASSUMPTION_KEYS.map(key=>[key,assumptions[key]]));
  project(base);
  const bridge=input.bridge===null?null:record(input.bridge,BRIDGE_KEYS,BRIDGE_KEYS,'Hypothetical bridge');
  if(bridge!==null)bridgeEquity(0,bridge);
  const drivers=list(input.drivers,1,UNCERTAINTY_LIMITS.maxDrivers,'Drivers').map((value,index)=>{
    const item=record(value,['key','distribution'],['key','distribution'],`Driver ${index+1}`);
    const definition=typeof item.key==='string'?DRIVER_BY_KEY.get(item.key):undefined;
    if(!definition)throw new Error(`Driver ${index+1} key must be one of ${UNCERTAINTY_DRIVERS.map(driver=>driver.key).join(', ')}.`);
    const d=distribution(item.distribution,`${definition.label} distribution`);
    if(d.min<definition.domain[0]||d.max>definition.domain[1])throw new Error(`${definition.label} must stay within ${definition.domain[0]} and ${definition.domain[1]}.`);
    return {key:item.key,distribution:d};
  });
  const keys=drivers.map(driver=>driver.key);
  if(new Set(keys).size!==keys.length)throw new Error('Each driver may appear only once.');
  if(keys.includes('dilution')&&bridge===null)throw new Error('Dilution applies to equity value. Supply a hypothetical cash, debt and other-claims bridge to model it.');
  const correlation=correlationFactor(input.correlation,drivers.length);
  const draws=input.draws;
  if(typeof draws!=='number'||!Number.isInteger(draws)||draws<UNCERTAINTY_LIMITS.minDraws||draws>UNCERTAINTY_LIMITS.maxDraws)throw new Error(`Draws must be a whole number from ${UNCERTAINTY_LIMITS.minDraws} to ${UNCERTAINTY_LIMITS.maxDraws.toLocaleString('en-US')}.`);
  if(typeof input.seed!=='number'||!Number.isInteger(input.seed)||input.seed<0||input.seed>MAX_SEED)throw new Error(`Seed must be a whole number from 0 to ${MAX_SEED}.`);
  const hurdle=Object.hasOwn(input,'hurdle')?input.hurdle:null;
  if(hurdle!==null&&(typeof hurdle!=='number'||!Number.isFinite(hurdle)||Math.abs(hurdle)>UNCERTAINTY_LIMITS.maxHurdle))throw new Error('Hurdle must be null or a finite value within ±$1,000,000,000,000B.');
  // Every model constraint is linear in these driver values with the others
  // fixed, so the valid set is convex. A box whose corners pass contains only
  // valid points: no draw is ever clipped, skipped or replaced.
  const ranges=drivers.map(driver=>{const b=baseValue(driver.key,base);return [Math.min(driver.distribution.min,b),Math.max(driver.distribution.max,b)];});
  for(let mask=0;mask<1<<drivers.length;mask++){
    const corner=ranges.map((range,j)=>range[(mask>>j)&1]);
    try{validate(pointAssumptions(base,keys,corner));}
    catch(error){throw new Error(`The driver ranges reach an invalid model input at ${keys.map((key,j)=>`${key}=${corner[j]}`).join(', ')}: ${error.message}`);}
  }
  return {assumptions:base,bridge:bridge===null?null:Object.fromEntries(BRIDGE_KEYS.map(key=>[key,finite(bridge[key],key)])),drivers,correlation:correlation.matrix,draws,seed:input.seed,hurdle:hurdle===0?0:hurdle};
}

function prepare(spec){
  const canonical=validateSimulation(spec),keys=canonical.drivers.map(driver=>driver.key);
  const quantiles=canonical.drivers.map(driver=>quantileFunction(driver.distribution));
  const correlation=correlationFactor(canonical.correlation,keys.length);
  const dilutionIndex=keys.indexOf('dilution');
  const value=point=>{
    const ev=project(pointAssumptions(canonical.assumptions,keys,point)).ev;
    if(canonical.bridge===null)return ev;
    const equity=bridgeEquity(ev,canonical.bridge).equityValue;
    return dilutionIndex<0?equity:(1-point[dilutionIndex])*equity;
  };
  const basePoint=keys.map(key=>baseValue(key,canonical.assumptions));
  return {canonical,keys,quantiles,correlation,value,basePoint};
}

/**
 * Draw i uses k standard normals e from consecutive uniforms. The latent
 * scores z = L e have correlation C, and each driver is F_j^-1(Phi(z_j)): the
 * Gaussian copula (McNeil, Frey and Embrechts, Quantitative Risk Management).
 */
function run(prepared,seed,draws,keep=false){
  const {keys,quantiles,correlation:{factor},value}=prepared,k=keys.length,random=createRandom(seed);
  const outcomes=new Float64Array(draws),normals=new Float64Array(k),point=new Float64Array(k);
  const scores=keep?new Float64Array(draws*k):null,samples=keep?new Float64Array(draws*k):null;
  for(let i=0;i<draws;i++){
    for(let j=0;j<k;j++)normals[j]=normalQuantile(random.nextUniform());
    for(let j=0;j<k;j++){
      const row=factor[j];let z=0;
      for(let m=0;m<=j;m++)z+=row[m]*normals[m];
      point[j]=quantiles[j](normalCdf(z));
      if(keep){scores[i*k+j]=z;samples[i*k+j]=point[j];}
    }
    outcomes[i]=value(point);
  }
  return {outcomes,scores,samples};
}

/** Hyndman and Fan (1996) definition 7, with exact integer positions for whole percents. */
export function percentile(sorted,percent){
  if(!Number.isInteger(percent)||percent<0||percent>100)throw new Error('Percent must be a whole number from 0 to 100.');
  const position=(sorted.length-1)*percent,index=Math.floor(position/100),remainder=position-index*100;
  if(remainder===0)return sorted[index];
  const low=sorted[index],high=sorted[index+1];
  return low+(high-low)*(remainder/100);
}

function sortedCopy(values,length=values.length){return Float64Array.from(values.subarray(0,length)).sort();}

function moments(values,center,length=values.length){
  let shifted=0;
  for(let i=0;i<length;i++)shifted+=values[i]-center;
  const mean=center+shifted/length;let squares=0;
  for(let i=0;i<length;i++){const d=values[i]-mean;squares+=d*d;}
  const standardDeviation=length>1?Math.sqrt(squares/(length-1)):0;
  return {mean,standardDeviation,standardError:standardDeviation/Math.sqrt(length)};
}

function percentileSet(sorted){return Object.fromEntries(REPORTED_PERCENTILES.map(p=>[`p${p}`,percentile(sorted,p)]));}

/** Wilson (1927) score interval for a binomial share at 95% confidence. */
function wilson(successes,n){
  const share=successes/n,z2=WILSON_Z*WILSON_Z,denominator=1+z2/n;
  const center=(share+z2/(2*n))/denominator;
  const half=WILSON_Z*Math.sqrt(share*(1-share)/n+z2/(4*n*n))/denominator;
  return [Math.max(0,center-half),Math.min(1,center+half)];
}

/** Equal-width bins between P1 and P99, with counts below and above that range. */
export function histogram(sorted,outcomes){
  const lower=percentile(sorted,1),upper=percentile(sorted,99);
  const count=upper>lower?UNCERTAINTY_LIMITS.histogramBins:1;
  const edges=Array.from({length:count+1},(_,i)=>i===count?upper:lower+(upper-lower)*(i/count));
  const counts=Array(count).fill(0);let below=0,above=0;
  for(const v of outcomes){
    if(v<lower){below++;continue;}
    if(v>upper){above++;continue;}
    let index=count===1?0:Math.min(count-1,Math.floor((v-lower)/(upper-lower)*count));
    while(index>0&&v<edges[index])index--;
    while(index<count-1&&v>=edges[index+1])index++;
    counts[index]++;
  }
  return {lower,upper,below,above,bins:counts.map((value,i)=>({lower:edges[i],upper:edges[i+1],count:value}))};
}

function pearson(scores,draws,k){
  const means=Array(k).fill(0);
  for(let i=0;i<draws;i++)for(let j=0;j<k;j++)means[j]+=scores[i*k+j];
  for(let j=0;j<k;j++)means[j]/=draws;
  const covariance=Array.from({length:k},()=>Array(k).fill(0));
  for(let i=0;i<draws;i++)for(let a=0;a<k;a++){const da=scores[i*k+a]-means[a];for(let b=a;b<k;b++)covariance[a][b]+=da*(scores[i*k+b]-means[b]);}
  return Array.from({length:k},(_,a)=>Array.from({length:k},(_,b)=>{
    if(a===b)return 1;
    const [x,y]=a<b?[a,b]:[b,a];
    return clamp(covariance[x][y]/Math.sqrt(covariance[x][x]*covariance[y][y]),-1,1);
  }));
}

/**
 * One-way tornado. Each driver moves to its own P10 and P90 while every other
 * driver stays at base. Quantiles are equivariant under monotone maps, so a
 * monotone change of a driver's scale cannot reorder the bars; a mean plus or
 * minus standard deviation tornado does not have this property.
 */
export function tornadoBars(drivers,evaluate){
  return drivers.map((driver,index)=>{
    const p10=driver.quantile(.1),p90=driver.quantile(.9);
    const valueAtP10=evaluate(index,p10),valueAtP90=evaluate(index,p90);
    return {key:driver.key,label:driver.label,p10,p90,valueAtP10,valueAtP90,low:Math.min(valueAtP10,valueAtP90),high:Math.max(valueAtP10,valueAtP90),swing:Math.abs(valueAtP90-valueAtP10),order:index};
  }).sort((a,b)=>b.swing-a.swing||a.order-b.order).map(({order,...bar})=>bar);
}

/** Primary-seed latent scores, driver values and outcomes, for verification. */
export function sampleDrivers(spec){
  const prepared=prepare(spec),{draws,seed}=prepared.canonical,k=prepared.keys.length;
  const {outcomes,scores,samples}=run(prepared,seed,draws,true);
  const rows=array=>Array.from({length:draws},(_,i)=>Array.from(array.subarray(i*k,(i+1)*k)));
  return {keys:prepared.keys,scores:rows(scores),values:rows(samples),outcomes:Array.from(outcomes),factor:prepared.correlation.factor};
}

/** Complete deterministic result. The same input and seed give the same bits in every runtime. */
export function simulateValuation(spec){
  const prepared=prepare(spec),{canonical,keys,quantiles,correlation,value,basePoint}=prepared;
  const {draws,seed,hurdle}=canonical,k=keys.length,limits=UNCERTAINTY_LIMITS;
  const baseOutcome=value(basePoint),baseEv=project(canonical.assumptions).ev;
  const primary=run(prepared,seed,draws,true),outcomes=primary.outcomes,sorted=sortedCopy(outcomes);
  const stats=moments(outcomes,baseOutcome),percentiles=percentileSet(sorted);
  const seeds=[seed,...Array.from({length:limits.replicates},(_,r)=>(seed+r+1)%(MAX_SEED+1))];
  const medians=[percentiles.p50,...seeds.slice(1).map(s=>percentile(sortedCopy(run(prepared,s,draws).outcomes),50))];
  const range=Math.max(...medians)-Math.min(...medians);
  const relativeRange=range===0?0:percentiles.p50===0?null:range/Math.abs(percentiles.p50);
  const prefixes=[8,4,2,1].map(divisor=>{
    const length=Math.floor(draws/divisor),part=sortedCopy(outcomes,length),m=moments(outcomes,baseOutcome,length);
    return {draws:length,p5:percentile(part,5),p50:percentile(part,50),p95:percentile(part,95),mean:m.mean,standardError:m.standardError};
  });
  let hurdleResult=null;
  if(hurdle!==null){
    let count=0;for(const v of outcomes)if(v>hurdle)count++;
    const share=count/draws;
    hurdleResult={value:hurdle,count,probabilityAbove:share,standardError:Math.sqrt(share*(1-share)/draws),interval95:wilson(count,draws)};
  }
  const achieved=pearson(primary.scores,draws,k);
  let maxDeviation=0;
  for(let a=0;a<k;a++)for(let b=a+1;b<k;b++)maxDeviation=Math.max(maxDeviation,Math.abs(achieved[a][b]-correlation.matrix[a][b]));
  const definitions=keys.map(key=>DRIVER_BY_KEY.get(key));
  const bars=tornadoBars(definitions.map((definition,j)=>({key:definition.key,label:definition.label,quantile:quantiles[j]})),(index,x)=>{
    const point=[...basePoint];point[index]=x;return value(point);
  });
  const measure=canonical.bridge===null?'operating-ev':keys.includes('dilution')?'equity-after-dilution':'equity-value';
  const warnings=[];
  const driverRows=canonical.drivers.map((driver,j)=>{
    const d=driver.distribution,base=basePoint[j],inside=d.min<=base&&base<=d.max;
    if(!inside)warnings.push(`The base value of ${definitions[j].label.toLowerCase()} lies outside its distribution. The tornado holds it at base, a value the simulation never draws.`);
    return {key:driver.key,label:definitions[j].label,unit:definitions[j].unit,base,distribution:d,p10:quantiles[j](.1),p90:quantiles[j](.9),baseInSupport:inside};
  });
  if(sorted[0]<=0)warnings.push('Some draws have a nonpositive value. Values remain signed and are not floored at zero.');
  if(correlation.minEigenvalue<=PSD_TOLERANCE)warnings.push('The correlation matrix is singular: at least one driver’s normal score is an exact combination of the others.');
  const stabilityStatus=relativeRange===null?'unavailable':relativeRange<=limits.stabilityTolerance?'stable':'unstable';
  if(stabilityStatus==='unstable')warnings.push(`The five seed medians span more than ${limits.stabilityTolerance*100}% of the primary median. Increase the number of draws before relying on it.`);
  return {
    version:UNCERTAINTY_VERSION,modelVersion:MODEL_VERSION,valuationDate:VALUATION_DATE,units:'USD billions',measure,
    assumptions:{...canonical.assumptions},bridge:canonical.bridge,drivers:driverRows,
    correlation:{requested:correlation.matrix,factor:correlation.factor,eigenvalues:correlation.eigenvalues,minEigenvalue:correlation.minEigenvalue,reconstructionError:correlation.reconstructionError,achieved,maxAbsoluteDeviation:maxDeviation},
    sampling:{algorithm:RANDOM_ALGORITHM,seed,draws,uniform:'52 random bits, midpoint (k + 0.5) / 2^52',normal:'inverse CDF, Wichura AS 241',copula:'Gaussian',replicateSeeds:seeds.slice(1)},
    base:{value:baseOutcome,operatingEv:baseEv},
    summary:{mean:stats.mean,standardDeviation:stats.standardDeviation,min:sorted[0],max:sorted[draws-1],percentiles},
    hurdle:hurdleResult,
    histogram:histogram(sorted,outcomes),
    convergence:{standardError:stats.standardError,relativeStandardError:stats.mean===0?null:stats.standardError/Math.abs(stats.mean),prefixes,
      stability:{seeds,p50:medians,range,relativeRange,tolerance:limits.stabilityTolerance,status:stabilityStatus}},
    tornado:{base:baseOutcome,bars},
    method:{engine:'project() from model.js, unchanged',percentiles:'Hyndman and Fan (1996) definition 7',hurdle:'share of draws strictly above the hurdle; Wilson 95% interval',
      tornado:'one-way: each driver at its own P10 and P90, all others at base',validity:'every corner of the driver range box passes model validation, so no draw is clipped or discarded',
      psdTolerance:PSD_TOLERANCE,weighting:'equal weight per draw',interpretation:'The draws describe the entered distributions. They are not calibrated probabilities of company outcomes.'},
    warnings
  };
}
