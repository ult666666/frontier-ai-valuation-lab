import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {project,bridgeEquity} from '../public/lib/model.js';
import {detExp,detLog,detExpm1,detLog1p} from '../public/lib/deterministic-math.js';
import {createRandom,splitMix64,normalCdf,normalQuantile,AS241_COEFFICIENTS,MAX_SEED} from '../public/lib/random.js';
import {simulateValuation,sampleDrivers,validateSimulation,correlationFactor,distributionQuantile,tornadoBars,percentile,histogram,UNCERTAINTY_LIMITS} from '../public/lib/uncertainty.js';
import {suggestedDistributions} from '../public/uncertainty.js';

const presets=JSON.parse(await readFile(new URL('../data/presets.json',import.meta.url),'utf8'));
const base=presets.Anthropic.Base;
const f64=new Float64Array(1),i64=new BigInt64Array(f64.buffer);
function ulps(a,b){if(Object.is(a,b))return 0n;f64[0]=a;const x=i64[0];f64[0]=b;const y=i64[0];return x>y?x-y:y-x;}
function lcg(seed){let s=seed>>>0;return ()=>{s=(Math.imul(s,1103515245)+12345)>>>0;return (s+.5)/4294967296;};}
function specFor(assumptions,overrides={}){
  const d=suggestedDistributions(assumptions);
  return {assumptions,bridge:null,drivers:['growth','m36','wacc','tg'].map(key=>({key,distribution:d[key]})),
    correlation:[[1,.4,0,0],[.4,1,0,0],[0,0,1,.3],[0,0,.3,1]],draws:1000,seed:20261018,hurdle:300,...overrides};
}
// Abramowitz and Stegun 7.1.26 (absolute error below 1.5e-7): independent of the engine's normal CDF.
function roughPhi(z){
  const x=Math.abs(z)/Math.SQRT2,t=1/(1+.3275911*x);
  const erf=1-((((1.061405429*t-1.453152027)*t+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x);
  return z<0?(1-erf)/2:(1+erf)/2;
}
function cdf(d,x){
  if(d.type==='uniform')return (x-d.min)/(d.max-d.min);
  if(d.type==='triangular')return x<=d.mode?(x-d.min)**2/((d.max-d.min)*(d.mode-d.min)):1-(d.max-x)**2/((d.max-d.min)*(d.max-d.mode));
  const lower=roughPhi((d.min-d.mean)/d.sd),upper=roughPhi((d.max-d.mean)/d.sd);
  return (roughPhi((x-d.mean)/d.sd)-lower)/(upper-lower);
}
function ranks(values){
  const order=values.map((value,index)=>[value,index]).sort((a,b)=>a[0]-b[0]),out=Array(values.length);
  order.forEach(([,index],rank)=>{out[index]=rank;});return out;
}
function pearson(x,y){
  const n=x.length,mx=x.reduce((a,b)=>a+b,0)/n,my=y.reduce((a,b)=>a+b,0)/n;let sxy=0,sxx=0,syy=0;
  for(let i=0;i<n;i++){const a=x[i]-mx,b=y[i]-my;sxy+=a*b;sxx+=a*a;syy+=b*b;}
  return sxy/Math.sqrt(sxx*syy);
}

test('SplitMix64 reproduces its published zero-seed outputs and xoshiro128** matches an independent integer implementation',()=>{
  const next=splitMix64(0);
  assert.deepEqual([next(),next(),next()],[0xe220a8397b1dcdafn,0x6e789e6aa1b965f4n,0x06c45d188009454fn]);
  // Vectors from the arbitrary-precision Python implementation in scripts/check_uncertainty_reference.py.
  const vectors={0:[3737715805,2584255861,2876756834,3286328325,1553311962,1625202774],1:[1695105466,1423115009,634581793,1068227753,716759206,4186505319],[MAX_SEED]:[331202089,2303545133,2732085799,1755962312,20464611,435992899]};
  for(const [seed,expected] of Object.entries(vectors)){const random=createRandom(Number(seed));assert.deepEqual(expected.map(()=>random.nextUint32()),expected);}
  const random=createRandom(20261018);
  assert.deepEqual([random.nextUniform(),random.nextUniform(),random.nextUniform(),random.nextUniform()],[0.01226259258856921,0.2660880039750463,0.5013822459551779,0.28145303597457005]);
  for(const bad of [-1,MAX_SEED+1,1.5,'1',NaN,null])assert.throws(()=>createRandom(bad),/Seed/);
});

test('uniforms are exact 52-bit midpoints inside the open unit interval and pass a chi-square check',()=>{
  const random=createRandom(7),counts=Array(100).fill(0),n=100000;
  for(let i=0;i<n;i++){
    const u=random.nextUniform();
    assert.ok(u>0&&u<1);
    assert.ok(Number.isInteger(u*4503599627370496-.5));
    counts[Math.floor(u*100)]++;
  }
  const expected=n/100,chi=counts.reduce((sum,count)=>sum+(count-expected)**2/expected,0);
  // 99 degrees of freedom; 148.3 is the 0.999 quantile (Wilson-Hilferty).
  assert.ok(chi<148.3,`chi-square ${chi}`);
});

test('fdlibm exp and log stay within one unit in the last place of the platform functions',()=>{
  const random=lcg(99);let worstExp=0n,worstLog=0n;
  for(let i=0;i<100000;i++){
    const x=(random()-.5)*1490;worstExp=ulps(detExp(x),Math.exp(x))>worstExp?ulps(detExp(x),Math.exp(x)):worstExp;
    const y=Math.exp((random()-.5)*1400)*(1+random());worstLog=ulps(detLog(y),Math.log(y))>worstLog?ulps(detLog(y),Math.log(y)):worstLog;
  }
  assert.ok(worstExp<=1n&&worstLog<=1n,`exp ${worstExp} ulps, log ${worstLog} ulps`);
  assert.equal(detExp(0),1);assert.equal(detExp(-Infinity),0);assert.equal(detExp(Infinity),Infinity);
  assert.equal(detExp(710),Infinity);assert.equal(detExp(-746),0);assert.ok(Number.isNaN(detExp(NaN)));
  assert.ok(ulps(detExp(1),Math.E)<=1n);
  assert.equal(detLog(1),0);assert.equal(detLog(0),-Infinity);assert.ok(Number.isNaN(detLog(-1)));
  assert.equal(detLog(Infinity),Infinity);assert.ok(ulps(detLog(5e-324),-744.4400719213812)<=1n);
});

test('fdlibm expm1 and log1p stay within one unit in the last place of the platform functions',()=>{
  // Horizon uses these so that the browser and the API produce identical bits.
  const random=lcg(1234);let worstExpm1=0n,worstLog1p=0n;
  for(let i=0;i<100000;i++){
    const scale=10**(-12+random()*14); // magnitudes from 1e-12 to 100
    const x=(random()-.5)*2*scale;
    const a=ulps(detExpm1(x),Math.expm1(x));if(a>worstExpm1)worstExpm1=a;
    const y=-1+(1+random()*1e3)*random()**8; // dense near -1, up to 1e3
    const b=ulps(detLog1p(y),Math.log1p(y));if(b>worstLog1p)worstLog1p=b;
    const c=ulps(detLog1p(x),Math.log1p(x));if(c>worstLog1p)worstLog1p=c;
  }
  assert.ok(worstExpm1<=1n&&worstLog1p<=1n,`expm1 ${worstExpm1} ulps, log1p ${worstLog1p} ulps`);
  assert.ok(Object.is(detExpm1(-0),-0)&&Object.is(detLog1p(-0),-0));
  assert.equal(detExpm1(1e-300),1e-300);assert.equal(detLog1p(1e-300),1e-300);
  assert.equal(detExpm1(-Infinity),-1);assert.equal(detExpm1(-40),-1);assert.equal(detExpm1(Infinity),Infinity);
  assert.equal(detExpm1(710),Infinity);assert.ok(Number.isNaN(detExpm1(NaN)));
  assert.ok(ulps(detExpm1(1),Math.E-1)<=1n);
  assert.equal(detLog1p(-1),-Infinity);assert.ok(Number.isNaN(detLog1p(-1.5)));assert.ok(Number.isNaN(detLog1p(-Infinity)));
  assert.equal(detLog1p(Infinity),Infinity);assert.ok(Number.isNaN(detLog1p(NaN)));
  assert.ok(ulps(detLog1p(Math.E-1),1)<=1n);
});

test('AS 241 coefficients reproduce the published significand check sums and known quantiles',()=>{
  const significand=x=>{let m=Math.abs(x)/10**Math.floor(Math.log10(Math.abs(x)));if(m>=10)m/=10;return m;};
  const sums=Object.values(AS241_COEFFICIENTS).map(({numerator,denominator})=>[...numerator,...denominator.slice(1)].reduce((sum,x)=>sum+significand(x),0));
  [55.883192880614901,49.332065033016103,47.525833175492897].forEach((expected,i)=>assert.ok(Math.abs(sums[i]-expected)<1e-12,`${sums[i]}`));
  assert.equal(normalQuantile(.5),0);
  assert.ok(Math.abs(normalQuantile(.975)-1.959963984540054)<=4.5e-16);
  assert.ok(Math.abs(normalQuantile(.9)-1.2815515655446004)<=4.5e-16);
  // For dyadic p, 1 - p is exact, so AS 241 is exactly antisymmetric.
  for(const p of [2**-53,2**-40,2**-10,.125,.3125,.4375])assert.equal(normalQuantile(1-p),-normalQuantile(p));
  for(const bad of [0,1,-.1,NaN,'0.5'])assert.throws(()=>normalQuantile(bad));
});

test('the normal CDF matches 60-digit references, inverts the quantile and is monotone',()=>{
  // Values from a 60-digit Decimal series and continued fraction.
  const references=[[-37,5.725571222524577e-300],[-20,2.7536241186062337e-89],[-8,6.220960574271784e-16],[-2.5,0.006209665325776135],[-1,0.15865525393145705],[.5,0.6914624612740131],[1.5,0.9331927987311419],[3,0.9986501019683699]];
  for(const [z,expected] of references)assert.ok(Math.abs(normalCdf(z)-expected)<=5e-14*expected,`Phi(${z})=${normalCdf(z)}`);
  assert.equal(normalCdf(0),.5);assert.equal(normalCdf(-41),0);assert.equal(normalCdf(41),1);
  // A relative error e in z becomes about z^2 e in the lower-tail probability.
  for(let exponent=-300;exponent<=-1;exponent+=1.25){
    const p=10**exponent,z=normalQuantile(p);
    assert.ok(Math.abs(normalCdf(z)-p)<=1e-14*Math.max(1,z*z)*p,`round trip at ${p}`);
  }
  let previous=0;
  for(let z=-12;z<=8;z+=.001){const value=normalCdf(z);assert.ok(value>=previous,`not monotone at ${z}`);previous=value;}
  previous=-Infinity;
  for(let p=1e-6;p<1;p+=1e-4){const value=normalQuantile(p);assert.ok(value>=previous);previous=value;}
});

test('bounded quantiles match closed forms, return a zero-spread value exactly and stay monotone',()=>{
  assert.equal(distributionQuantile({type:'uniform',min:2,max:6},.25),3);
  const tri={type:'triangular',min:.1,mode:.2,max:.5};
  assert.ok(Math.abs(distributionQuantile(tri,(tri.mode-tri.min)/(tri.max-tri.min))-tri.mode)<1e-15);
  for(const d of [tri,{type:'triangular',min:1,mode:1,max:2},{type:'triangular',min:1,mode:2,max:2},{type:'normal',mean:.12,sd:.02,min:.08,max:.2},{type:'uniform',min:-1,max:1}]){
    let previous=-Infinity;
    for(let p=.001;p<1;p+=.001){
      const x=distributionQuantile(d,p);
      assert.ok(x>=previous&&x>=d.min&&x<=d.max);previous=x;
      assert.ok(Math.abs(cdf(d,x)-p)<=(d.type==='normal'?5e-7:1e-12),`${d.type} at ${p}`);
    }
  }
  assert.equal(distributionQuantile({type:'normal',mean:.125,sd:0,min:.1,max:.2},.9),.125);
  assert.equal(distributionQuantile({type:'triangular',min:.22,mode:.22,max:.22},.1),.22);
  assert.equal(distributionQuantile({type:'uniform',min:.03,max:.03},.5),.03);
  assert.throws(()=>distributionQuantile({type:'uniform',min:2,max:1},.5),/minimum/);
  assert.throws(()=>distributionQuantile({type:'beta',min:0,max:1},.5),/type/);
});

test('correlation validation rejects asymmetric, non-unit and indefinite matrices and accepts singular ones',()=>{
  const indefinite=[[1,.9,-.9],[.9,1,.9],[-.9,.9,1]];
  assert.throws(()=>correlationFactor(indefinite,3),/smallest eigenvalue is -/);
  assert.throws(()=>correlationFactor([[1,.2],[.3,1]],2),/symmetric/);
  assert.throws(()=>correlationFactor([[1,.2],[.2,.9]],2),/diagonal/);
  assert.throws(()=>correlationFactor([[1,1.2],[1.2,1]],2),/between/);
  assert.throws(()=>correlationFactor([[1,0],[0,1]],3),/exactly 3/);
  const root=1/Math.SQRT2;
  for(const singular of [[[1,1],[1,1]],[[1,-1],[-1,1]],[[1,0,root],[0,1,root],[root,root,1]]]){
    const result=correlationFactor(singular,singular.length);
    assert.ok(Math.abs(result.minEigenvalue)<=1e-12&&result.reconstructionError<=1e-12);
  }
  for(const [k,rho] of [[5,.3],[4,-.25],[3,.95]]){
    const matrix=Array.from({length:k},(_,i)=>Array.from({length:k},(_,j)=>i===j?1:rho));
    const {eigenvalues,reconstructionError}=correlationFactor(matrix,k);
    const expected=[...Array(k-1).fill(1-rho),1+(k-1)*rho].sort((a,b)=>a-b);
    eigenvalues.forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<1e-14));
    assert.ok(reconstructionError<1e-15);
  }
});

test('the positive semidefinite decision agrees with a brute-force principal-minor test on random matrices',()=>{
  const determinant=m=>m.length===1?m[0][0]:m[0].reduce((sum,value,j)=>sum+(j%2?-1:1)*value*determinant(m.slice(1).map(row=>row.filter((_,c)=>c!==j))),0);
  const random=lcg(4242);let accepted=0,rejected=0;
  for(let trial=0;trial<3000;trial++){
    const k=2+trial%4,m=Array.from({length:k},()=>Array(k).fill(1));
    for(let i=0;i<k;i++)for(let j=i+1;j<k;j++)m[i][j]=m[j][i]=Math.round((random()*2-1)*100)/100;
    let minimumMinor=Infinity;
    for(let mask=1;mask<1<<k;mask++){
      const index=[...Array(k).keys()].filter(i=>mask>>i&1);
      minimumMinor=Math.min(minimumMinor,determinant(index.map(i=>index.map(j=>m[i][j]))));
    }
    if(Math.abs(minimumMinor)<1e-6)continue; // too close to the boundary for a floating-point oracle
    let engine=true;try{correlationFactor(m,k);}catch{engine=false;}
    assert.equal(engine,minimumMinor>0,JSON.stringify(m));
    engine?accepted++:rejected++;
  }
  assert.ok(accepted>300&&rejected>300,`${accepted} accepted, ${rejected} rejected`);
});

test('the sample correlation of the latent scores recovers the requested matrix and ranks follow the Gaussian copula',()=>{
  const n=UNCERTAINTY_LIMITS.maxDraws;
  const matrices=[[[1,.4,0,0],[.4,1,0,0],[0,0,1,.3],[0,0,.3,1]],[[1,-.7,.2,0],[-.7,1,0,.1],[.2,0,1,-.5],[0,.1,-.5,1]],[[1,.95,.9,.85],[.95,1,.9,.85],[.9,.9,1,.85],[.85,.85,.85,1]],[[1,1,0,0],[1,1,0,0],[0,0,1,0],[0,0,0,1]]];
  for(const [index,correlation] of matrices.entries()){
    const sample=sampleDrivers(specFor(base,{correlation,draws:n,seed:100+index}));
    for(let a=0;a<4;a++)for(let b=a+1;b<4;b++){
      const rho=correlation[a][b];
      const scores=pearson(sample.scores.map(row=>row[a]),sample.scores.map(row=>row[b]));
      assert.ok(Math.abs(scores-rho)<=4*(1-rho*rho)/Math.sqrt(n)+1e-9,`matrix ${index} pair ${a},${b}: ${scores} vs ${rho}`);
      const spearman=pearson(ranks(sample.values.map(row=>row[a])),ranks(sample.values.map(row=>row[b])));
      assert.ok(Math.abs(spearman-6/Math.PI*Math.asin(rho/2))<=4/Math.sqrt(n),`rank correlation ${spearman} for ${rho}`);
    }
  }
});

test('each driver keeps its requested marginal distribution under the copula (Kolmogorov-Smirnov)',()=>{
  const n=UNCERTAINTY_LIMITS.maxDraws,spec=specFor(base,{draws:n,seed:5});
  spec.drivers[0].distribution={type:'uniform',min:.75,max:1.2};
  spec.drivers[1].distribution={type:'triangular',min:.16,mode:.19,max:.3};
  spec.drivers[3].distribution={type:'triangular',min:.02,mode:.022,max:.04};
  const sample=sampleDrivers(spec);
  spec.drivers.forEach((driver,j)=>{
    const sorted=sample.values.map(row=>row[j]).sort((a,b)=>a-b);let statistic=0;
    sorted.forEach((x,i)=>{const F=cdf(driver.distribution,x);statistic=Math.max(statistic,Math.abs((i+1)/n-F),Math.abs(F-i/n));});
    assert.ok(statistic<1.95/Math.sqrt(n),`${driver.key}: D=${statistic}`); // 0.1% critical value
  });
});

test('percentiles converge to the exact quantiles of a monotone single-driver case as draws grow',()=>{
  // EV rises strictly with the 2036 margin, so the true value quantile is the
  // model evaluated at the margin quantile. No simulation is needed for it.
  const margin={type:'triangular',min:.14,mode:.2,max:.34},levels=[5,25,50,75,95];
  const exact=levels.map(p=>project({...base,m36:distributionQuantile(margin,p/100)}).ev);
  const meanError={};
  for(const n of [500,2000,8000]){
    let total=0;
    for(let seed=1;seed<=8;seed++){
      const {outcomes}=sampleDrivers({assumptions:base,bridge:null,drivers:[{key:'m36',distribution:margin}],correlation:null,draws:n,seed,hurdle:null});
      const sorted=Float64Array.from(outcomes).sort();
      levels.forEach((p,i)=>{
        const share=outcomes.filter(v=>v<=exact[i]).length/n,sigma=Math.sqrt(p/100*(1-p/100)/n);
        assert.ok(Math.abs(share-p/100)<=4.5*sigma,`n=${n} seed=${seed} P${p}: ${share}`);
        total+=Math.abs(percentile(sorted,p)-exact[i])/exact[i];
      });
    }
    meanError[n]=total/(8*levels.length);
  }
  assert.ok(meanError[8000]<meanError[2000]&&meanError[2000]<meanError[500],JSON.stringify(meanError));
  assert.ok(meanError[8000]<.5*meanError[500],JSON.stringify(meanError));
});

test('the standard error of the mean shrinks with the square root of the draws',()=>{
  const small=simulateValuation(specFor(base,{draws:2500,seed:11})),large=simulateValuation(specFor(base,{draws:10000,seed:11}));
  const ratio=large.convergence.standardError/small.convergence.standardError;
  assert.ok(ratio>.4&&ratio<.6,`ratio ${ratio}`);
  assert.ok(Math.abs(small.convergence.standardError-small.summary.standardDeviation/50)<1e-12*small.summary.standardDeviation);
  assert.deepEqual(large.convergence.prefixes.map(p=>p.draws),[1250,2500,5000,10000]);
  assert.equal(large.convergence.prefixes.at(-1).p50,large.summary.percentiles.p50);
  assert.equal(large.convergence.stability.seeds.length,5);
  assert.equal(large.convergence.stability.p50[0],large.summary.percentiles.p50);
});

test('zero spread at the base values reproduces every deterministic preset exactly',()=>{
  for(const [company,cases] of Object.entries(presets))for(const [scenario,assumptions] of Object.entries(cases)){
    const ev=project(assumptions).ev;
    for(const shape of ['triangular','normal','uniform']){
      const point=key=>key==='growth'?1:assumptions[key];
      const drivers=['growth','m36','wacc','tg'].map(key=>({key,distribution:shape==='triangular'?{type:shape,min:point(key),mode:point(key),max:point(key)}:shape==='normal'?{type:shape,mean:point(key),sd:0,min:point(key),max:point(key)}:{type:shape,min:point(key),max:point(key)}}));
      const r=simulateValuation({assumptions,bridge:null,drivers,correlation:[[1,.5,0,0],[.5,1,0,0],[0,0,1,-.2],[0,0,-.2,1]],draws:200,seed:3,hurdle:ev});
      const label=`${company} ${scenario} ${shape}`;
      for(const value of [...Object.values(r.summary.percentiles),r.summary.mean,r.summary.min,r.summary.max,r.base.value,r.tornado.base])assert.equal(value,ev,label);
      assert.equal(r.summary.standardDeviation,0);assert.equal(r.convergence.standardError,0);
      assert.equal(r.convergence.stability.range,0);assert.equal(r.convergence.stability.status,'stable');
      assert.equal(r.hurdle.probabilityAbove,0);
      for(const bar of r.tornado.bars){assert.equal(bar.low,ev);assert.equal(bar.high,ev);assert.equal(bar.swing,0);}
    }
  }
  const bridge={cash:20,debt:5,otherClaims:3},equity=bridgeEquity(project(base).ev,bridge).equityValue;
  const r=simulateValuation({assumptions:base,bridge,drivers:[{key:'wacc',distribution:{type:'normal',mean:base.wacc,sd:0,min:.1,max:.15}},{key:'dilution',distribution:{type:'uniform',min:0,max:0}}],correlation:null,draws:200,seed:9,hurdle:null});
  assert.equal(r.measure,'equity-after-dilution');
  for(const value of Object.values(r.summary.percentiles))assert.equal(value,equity);
});

test('dilution scales modeled equity and needs an explicit bridge',()=>{
  const bridge={cash:20,debt:5,otherClaims:0};
  const spec={assumptions:base,bridge,drivers:[{key:'dilution',distribution:{type:'uniform',min:.05,max:.05}}],correlation:null,draws:200,seed:1,hurdle:null};
  const r=simulateValuation(spec),equity=bridgeEquity(project(base).ev,bridge).equityValue;
  assert.equal(r.summary.percentiles.p50,.95*equity);
  assert.equal(r.base.value,equity);
  assert.throws(()=>simulateValuation({...spec,bridge:null}),/bridge/);
  assert.equal(simulateValuation({...spec,drivers:[{key:'m36',distribution:{type:'uniform',min:.2,max:.24}}]}).measure,'equity-value');
});

test('the tornado ordering is unchanged by strictly monotone reparameterisation of any driver',()=>{
  const evaluateWith=(assumptions,key,x)=>{
    const p={...assumptions};
    if(key==='growth'){p.g1*=x;p.g2*=x;p.g3*=x;}else p[key]=x;
    return project(p).ev;
  };
  const transforms=[
    {name:'affine',f:x=>3*x+2,inverse:y=>(y-2)/3,increasing:true},
    {name:'negated',f:x=>-.5*x,inverse:y=>-2*y,increasing:false},
    {name:'cube',f:x=>x*x*x,inverse:Math.cbrt,increasing:true},
    {name:'exponential',f:x=>Math.exp(4*x),inverse:y=>Math.log(y)/4,increasing:true},
    {name:'reciprocal',f:x=>1/(1+x),inverse:y=>1/y-1,increasing:false},
    {name:'logit',f:x=>Math.log(x/(2-x)),inverse:y=>2/(1+Math.exp(-y)),increasing:true}
  ];
  const random=lcg(2026);let checked=0;
  for(let trial=0;trial<240;trial++){
    const assumptions=Object.values(presets)[trial%2][['Bear','Base','Bull'][trial%3]];
    const suggested=suggestedDistributions(assumptions);
    const keys=['growth','m36','wacc','tg'].filter(()=>random()<.8);if(keys.length<2)continue;
    const drivers=keys.map(key=>{
      const d={...suggested[key]},shrink=.3+.7*random();
      const centre=key==='growth'?1:assumptions[key];
      if(d.type==='normal'){d.sd*=shrink;d.min=centre-(centre-d.min)*shrink;d.max=centre+(d.max-centre)*shrink;}
      else{d.min=centre-(centre-d.min)*shrink;d.max=centre+(d.max-centre)*(.3+.7*random());}
      return {key,label:key,quantile:p=>distributionQuantile(d,p)};
    });
    const evaluate=(index,x)=>evaluateWith(assumptions,keys[index],x);
    const original=tornadoBars(drivers,evaluate);
    const swings=original.map(bar=>bar.swing);
    if(swings.some((swing,i)=>i>0&&swings[i-1]-swing<=1e-9*swings[i-1]))continue; // ties have no stable order
    const chosen=keys.map(()=>transforms[Math.floor(random()*transforms.length)]);
    const transformed=tornadoBars(drivers.map((driver,j)=>({...driver,quantile:chosen[j].increasing?p=>chosen[j].f(driver.quantile(p)):p=>chosen[j].f(driver.quantile(1-p))})),(index,y)=>evaluate(index,chosen[index].inverse(y)));
    assert.deepEqual(transformed.map(bar=>bar.key),original.map(bar=>bar.key),`trial ${trial}: ${chosen.map(t=>t.name)}`);
    transformed.forEach((bar,i)=>{for(const field of ['low','high','swing'])assert.ok(Math.abs(bar[field]-original[i][field])<=1e-9*Math.max(1,Math.abs(original[i][field])),`${field} trial ${trial}`);});
    checked++;
  }
  assert.ok(checked>150,`only ${checked} trials checked`);
});

test('the tornado uses each marginal P10 and P90 with the other drivers at base',()=>{
  const r=simulateValuation(specFor(base));
  for(const bar of r.tornado.bars){
    const driver=r.drivers.find(d=>d.key===bar.key);
    assert.equal(bar.p10,driver.p10);assert.equal(bar.p90,driver.p90);
    assert.equal(bar.p10,distributionQuantile(driver.distribution,.1));
    const at=x=>{const p={...base};if(bar.key==='growth'){p.g1*=x;p.g2*=x;p.g3*=x;}else p[bar.key]=x;return project(p).ev;};
    assert.equal(bar.valueAtP10,at(bar.p10));assert.equal(bar.valueAtP90,at(bar.p90));
  }
  const swings=r.tornado.bars.map(bar=>bar.swing);
  assert.deepEqual(swings,[...swings].sort((a,b)=>b-a));
  assert.equal(r.tornado.base,project(base).ev);
});

test('results are deterministic for a seed, change with the seed and wrap replicate seeds',()=>{
  const spec=specFor(base);
  const first=simulateValuation(spec),second=simulateValuation(structuredClone(spec));
  assert.equal(JSON.stringify(first),JSON.stringify(second));
  assert.notEqual(simulateValuation({...spec,seed:spec.seed+1}).summary.percentiles.p50,first.summary.percentiles.p50);
  assert.deepEqual(simulateValuation({...spec,seed:MAX_SEED,draws:200}).convergence.stability.seeds,[MAX_SEED,0,1,2,3]);
  assert.deepEqual(first.sampling.replicateSeeds,[20261019,20261020,20261021,20261022]);
});

test('histogram, hurdle share and Wilson interval account for every draw',()=>{
  const spec=specFor(base,{draws:4000,hurdle:400}),r=simulateValuation(spec),{outcomes}=sampleDrivers(spec);
  const h=r.histogram;
  assert.equal(h.bins.reduce((sum,bin)=>sum+bin.count,0)+h.below+h.above,4000);
  assert.equal(h.bins.length,UNCERTAINTY_LIMITS.histogramBins);assert.equal(h.bins[0].lower,h.lower);assert.equal(h.bins.at(-1).upper,h.upper);
  for(const bin of h.bins)assert.equal(bin.count,outcomes.filter(v=>v>=bin.lower&&(bin===h.bins.at(-1)?v<=bin.upper:v<bin.upper)).length);
  const above=outcomes.filter(v=>v>400).length;
  assert.equal(r.hurdle.count,above);assert.equal(r.hurdle.probabilityAbove,above/4000);
  assert.ok(r.hurdle.interval95[0]<r.hurdle.probabilityAbove&&r.hurdle.probabilityAbove<r.hurdle.interval95[1]);
  // Wilson interval for 100 successes in 200 trials: 0.431361 to 0.568639.
  const coin=simulateValuation({assumptions:base,bridge:null,drivers:[{key:'m36',distribution:{type:'uniform',min:.2,max:.24}}],correlation:null,draws:200,seed:1,hurdle:simulateValuation({assumptions:base,bridge:null,drivers:[{key:'m36',distribution:{type:'uniform',min:.2,max:.24}}],correlation:null,draws:200,seed:1,hurdle:null}).summary.percentiles.p50});
  assert.equal(coin.hurdle.count,100);
  assert.ok(Math.abs(coin.hurdle.interval95[0]-.43136085960389187)<1e-15&&Math.abs(coin.hurdle.interval95[1]-.5686391403961082)<1e-15,JSON.stringify(coin.hurdle.interval95));
});

test('histogram bins place values that sit exactly on an edge into the bin that starts there',()=>{
  const random=lcg(77);
  for(let trial=0;trial<300;trial++){
    const lower=(random()-.5)*2000,upper=lower+1e-3+random()*900;
    // With 101 values, P1 and P99 are the second and second-to-last order statistics exactly.
    const shell=[lower-1,lower,upper,upper+1],filler=Array.from({length:72},()=>lower+(upper-lower)*random());
    const edges=histogram(Float64Array.from([...shell,...Array(25).fill(lower),...filler]).sort(),[]).bins.map(bin=>bin.lower).concat(upper);
    const values=[...shell,...edges,...filler],h=histogram(Float64Array.from(values).sort(),values);
    assert.equal(h.lower,lower);assert.equal(h.upper,upper);assert.equal(h.below,1);assert.equal(h.above,1);
    h.bins.forEach((bin,i)=>assert.equal(bin.count,values.filter(v=>v>=bin.lower&&(i===h.bins.length-1?v<=bin.upper:v<bin.upper)).length,`trial ${trial} bin ${i}`));
  }
});

test('validation rejects malformed requests, unsafe records and ranges that leave the model domain',()=>{
  const spec=specFor(base);
  const rejects=(change,pattern)=>{const value=structuredClone(spec);change(value);assert.throws(()=>validateSimulation(value),pattern);};
  rejects(value=>{value.extra=1;},/unsupported/);
  rejects(value=>{delete value.seed;},/missing/);
  rejects(value=>{value.drivers=[];},/1–5/);
  rejects(value=>{value.drivers.push({key:'dilution',distribution:{type:'uniform',min:0,max:.1}},{key:'growth',distribution:{type:'uniform',min:1,max:1}});value.correlation=null;},/1–5/);
  rejects(value=>{value.drivers[1].key='growth';},/once/);
  rejects(value=>{value.drivers[0].key='revenue';},/key must be one of/);
  rejects(value=>{value.drivers=[{key:'dilution',distribution:{type:'uniform',min:0,max:.1}}];value.correlation=null;},/bridge/);
  rejects(value=>{value.drivers[0].distribution={type:'triangular',min:1.2,mode:1,max:1.3};},/mode/);
  rejects(value=>{value.drivers[2].distribution.sd=-.01;},/standard deviation/);
  rejects(value=>{value.drivers[2].distribution.mean=.5;},/mean/);
  rejects(value=>{value.drivers[0].distribution.max=Infinity;},/finite/);
  rejects(value=>{value.drivers[0].distribution.max=11;},/within/);
  rejects(value=>{value.drivers[3].distribution.max=.2;},/invalid model input at .*tg=0\.2/);
  rejects(value=>{value.drivers[1].distribution.min=-.05;},/invalid model input/);
  rejects(value=>{value.correlation=[[1,0],[0,1]];},/exactly 4/);
  rejects(value=>{value.correlation[0][1]=.9;},/symmetric/);
  rejects(value=>{value.draws=UNCERTAINTY_LIMITS.minDraws-1;},/Draws/);
  rejects(value=>{value.draws=UNCERTAINTY_LIMITS.maxDraws+1;},/Draws/);
  rejects(value=>{value.draws=1000.5;},/Draws/);
  rejects(value=>{value.seed=-1;},/Seed/);
  rejects(value=>{value.hurdle=2e12;},/Hurdle/);
  rejects(value=>{value.assumptions.tg=.2;},/WACC/);
  let reads=0;
  const accessor=structuredClone(spec);Object.defineProperty(accessor.drivers[0],'key',{enumerable:true,get(){reads++;return 'growth';}});
  assert.throws(()=>validateSimulation(accessor),/data property/);
  const inherited=structuredClone(spec);inherited.assumptions=Object.create(inherited.assumptions);
  assert.throws(()=>validateSimulation(inherited),/missing|plain/);
  assert.equal(reads,0);
  const before=JSON.stringify(spec);simulateValuation(spec);assert.equal(JSON.stringify(spec),before);
  const {hurdle,...withoutHurdle}=spec;assert.equal(validateSimulation(withoutHurdle).hurdle,null);
});

test('suggested ranges are valid starting points for all six presets',()=>{
  for(const cases of Object.values(presets))for(const assumptions of Object.values(cases)){
    const d=suggestedDistributions(assumptions);
    validateSimulation({...specFor(assumptions),drivers:['growth','m36','wacc','tg'].map(key=>({key,distribution:d[key]}))});
    validateSimulation({...specFor(assumptions),bridge:{cash:20,debt:5,otherClaims:0},drivers:[{key:'dilution',distribution:d.dilution}],correlation:null});
  }
});
