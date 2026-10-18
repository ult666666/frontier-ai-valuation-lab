/**
 * Frontier AI Valuation Lab. All dollar amounts are USD billions.
 * Pure deterministic FCFF calculations shared by the browser and server.
 * Forecasts are analyst scenarios; see docs/METHODOLOGY.md for limitations.
 */
export const MODEL_VERSION = '3.0.0';
export const VALUATION_DATE = '2026-10-18';
const ASOF = Date.UTC(2026,9,18);
const YEAR_MS = 365.25 * 86400000;
const KEYS = ['rev2026','g1','g2','g3','m27','m30','m36','turns','wacc','tg','roic','stub','tax'];

export function validate(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('Assumptions must be an object.');
  for (const key of Object.keys(p)) if (!KEYS.includes(key)) throw new Error(`Unknown assumption: ${key}.`);
  for (const key of KEYS) if (typeof p[key] !== 'number' || !Number.isFinite(p[key])) throw new Error(`${key} must be a finite number.`);
  if (!(p.rev2026 > 0 && p.rev2026 <= 10000)) throw new Error('2026 revenue must be above zero and at most $10,000B.');
  if (!(p.turns >= .05 && p.turns <= 100)) throw new Error('Sales / invested capital must be between 0.05 and 100.');
  if (!(0 <= p.tg && p.tg < p.wacc && p.wacc <= .60)) throw new Error('Require 0 ≤ terminal growth < WACC ≤ 60%.');
  if (!(p.tg < p.roic && p.roic <= 1)) throw new Error('Terminal ROIC must exceed terminal growth and be at most 100%.');
  if (!(0 <= p.tax && p.tax < 1)) throw new Error('Tax must be between 0% and below 100%.');
  if (['g1','g2','g3'].some(k=>p[k]<0 || p[k]>2)) throw new Error('Forecast growth must be between 0% and 200%.');
  if (['m27','m30','m36'].some(k=>p[k]<-1 || p[k]>1) || p.m36<=0) throw new Error('Margins must be within ±100% with a positive terminal margin.');
  if (p.g3 < p.tg) throw new Error('2034–2036 growth cannot be below terminal growth.');
  if (Math.abs(p.stub)>10000) throw new Error('Remaining-2026 FCFF must be within ±$10,000B.');
  return true;
}

function yearFraction(year) { return (Date.UTC(year,11,31)-ASOF)/YEAR_MS; }
function marginAt(p,year) {
  return year<=2030 ? p.m27+(p.m30-p.m27)*(year-2027)/3 : p.m30+(p.m36-p.m30)*(year-2030)/6;
}
function finiteOutputs(result) {
  for (const value of Object.values(result)) {
    if (typeof value==='number' && !Number.isFinite(value)) throw new Error('These inputs exceed the model’s numeric range.');
    if (value && typeof value==='object') finiteOutputs(value);
  }
  return result;
}

export function project(p) {
  validate(p);
  const rows=[]; let previous=p.rev2026, cumulative=p.stub, trough=Math.min(0,cumulative);
  const stub_t=yearFraction(2026), pv_stub=p.stub/(1+p.wacc)**stub_t;
  for (let year=2027;year<=2036;year++) {
    const growth=p[year<=2030?'g1':year<=2033?'g2':'g3'];
    const revenue=previous*(1+growth), margin=marginAt(p,year), ebit=revenue*margin;
    const tax=Math.max(0,ebit)*p.tax, nopat=ebit-tax;
    // Net investment includes both net capital expenditure and working capital.
    const reinvestment=(revenue-previous)/p.turns, fcf=nopat-reinvestment;
    const t=yearFraction(year), df=(1+p.wacc)**-t;
    cumulative+=fcf; trough=Math.min(trough,cumulative);
    rows.push({year,revenue,growth,margin,ebit,tax,nopat,reinvestment,fcf,t,df,pv:fcf*df,cumulative});
    previous=revenue;
  }
  const last=rows.at(-1), terminal_revenue=last.revenue*(1+p.tg);
  const terminal_nopat=terminal_revenue*p.m36*(1-p.tax), terminal_reinvestment_rate=p.tg/p.roic;
  const terminal_fcf=terminal_nopat*(1-terminal_reinvestment_rate);
  const tv=terminal_fcf/(p.wacc-p.tg), pvtv=tv*last.df;
  const pv_explicit=pv_stub+rows.reduce((sum,row)=>sum+row.pv,0), ev=pv_explicit+pvtv;
  const tv_share=ev>0?pvtv/ev:null;
  const terminal_fcf_change=last.fcf>0?terminal_fcf/last.fcf-1:null;
  const implied_incremental_roic=p.m36*(1-p.tax)*p.turns;
  const warnings=[];
  if (tv_share!==null && tv_share>.75) warnings.push('More than 75% of enterprise value comes from the terminal value.');
  if (terminal_fcf_change!==null && Math.abs(terminal_fcf_change)>.25) warnings.push('Terminal FCFF changes by more than 25% from 2036; review the growth and capital-return transition.');
  if (Math.abs(implied_incremental_roic-p.roic)>.05) warnings.push('Terminal ROIC differs from the incremental return implied by the final explicit margin and capital turns.');
  if (p.g1<p.g2 || p.g2<p.g3) warnings.push('This scenario assumes growth accelerates in a later forecast stage.');
  if (p.roic<p.wacc) warnings.push('Terminal ROIC is below WACC; perpetual growth can reduce value.');
  if (ev<=0) warnings.push('This scenario has nonpositive operating enterprise value; no valuation floor is imposed.');
  return finiteOutputs({rows,stub_t,pv_stub,pv_explicit,terminal_revenue,terminal_nopat,terminal_reinvestment_rate,terminal_fcf,tv,pvtv,ev,tv_share,peak_funding_need:-trough,terminal_t:last.t,cagr:(last.revenue/p.rev2026)**.1-1,terminal_fcf_change,implied_incremental_roic,warnings});
}

/** EV is a quartic in x=1+early growth under this model's fixed tax/margin policy. */
function valuePolynomial(p) {
  const coefficients=[p.stub/(1+p.wacc)**yearFraction(2026),0,0,0,0];
  for (let year=2027;year<=2030;year++) {
    const power=year-2026, margin=marginAt(p,year);
    const operating=margin*(margin>0?1-p.tax:1), df=(1+p.wacc)**-yearFraction(year);
    coefficients[power]+=p.rev2026*(operating-1/p.turns)*df;
    coefficients[power-1]+=p.rev2026/p.turns*df;
  }
  let previous=p.rev2026;
  for (let year=2031;year<=2036;year++) {
    const revenue=previous*(1+p[year<=2033?'g2':'g3']), margin=marginAt(p,year);
    const operating=margin*(margin>0?1-p.tax:1), df=(1+p.wacc)**-yearFraction(year);
    coefficients[4]+=(revenue*operating-(revenue-previous)/p.turns)*df;
    previous=revenue;
  }
  coefficients[4]+=previous*(1+p.tg)*p.m36*(1-p.tax)*(1-p.tg/p.roic)/(p.wacc-p.tg)/(1+p.wacc)**yearFraction(2036);
  return coefficients;
}
function polynomialAt(c,x) { return c.reduceRight((sum,value)=>sum*x+value,0); }
function rootsInInterval(coefficients,lower,upper) {
  const scale=Math.max(...coefficients.map(Math.abs),1), c=coefficients.map(v=>v/scale);
  while (c.length>1 && c.at(-1)===0) c.pop();
  if (c.length===1) return Math.abs(c[0])<1e-12?[lower,upper]:[];
  if (c.length===2) { const root=-c[0]/c[1];return root>=lower-1e-12&&root<=upper+1e-12?[Math.max(lower,Math.min(upper,root))]:[]; }
  const critical=rootsInInterval(c.slice(1).map((v,i)=>v*(i+1)),lower,upper);
  const points=[lower,...critical.filter(v=>v>lower&&v<upper),upper].sort((a,b)=>a-b), roots=[];
  for (const point of points) if (Math.abs(polynomialAt(c,point))<1e-11) roots.push(point);
  for (let i=1;i<points.length;i++) {
    let lo=points[i-1], hi=points[i], flo=polynomialAt(c,lo), fhi=polynomialAt(c,hi);
    if (flo*fhi>=0 || Math.abs(flo)<1e-11 || Math.abs(fhi)<1e-11) continue;
    for (let iteration=0;iteration<90;iteration++) {
      const mid=(lo+hi)/2, value=polynomialAt(c,mid);
      if (flo*value<=0) {hi=mid;fhi=value;} else {lo=mid;flo=value;}
    }
    roots.push((lo+hi)/2);
  }
  return roots.sort((a,b)=>a-b).filter((v,i,a)=>i===0 || v-a[i-1]>1e-7);
}

export function reverseGrowth(p,target) {
  validate(p);
  if (typeof target!=='number' || !Number.isFinite(target) || target<=0 || target>1e12) throw new Error('Target enterprise value must be positive, finite, and at most $1,000,000,000,000B.');
  const coefficients=valuePolynomial(p); coefficients[0]-=target;
  const roots=rootsInInterval(coefficients,1,3);
  const solutions=roots.map(x=>{
    const growth=x-1,r=project({...p,g1:growth});
    return {growth,revenue2030:r.rows[3].revenue,revenue2036:r.rows.at(-1).revenue,ev:r.ev,residual:r.ev-target};
  }).filter(s=>Math.abs(s.residual)<=Math.max(1e-6,target*1e-9));
  if (solutions.length===0) return {status:'unreachable',reason:'No solution in the permitted 0–200% early-growth interval with the remaining assumptions fixed.'};
  if (solutions.length>1) return {status:'multiple_solutions',reason:'More than one growth path reaches this target. Higher early growth does not always increase value.',solutions};
  return {status:'solved',...solutions[0]};
}

export function sensitivity(p,rates,growthRates) {
  validate(p);
  for (const list of [rates,growthRates]) if (!Array.isArray(list)||list.length<1||list.length>9||list.some(v=>typeof v!=='number'||!Number.isFinite(v))) throw new Error('Sensitivity axes must contain 1–9 finite numeric values.');
  return {rates:[...rates],growthRates:[...growthRates],values:rates.map(wacc=>growthRates.map(tg=>{
    try {return project({...p,wacc,tg}).ev;} catch {return null;}
  }))};
}
export function bridgeEquity(ev,bridge) {
  if (typeof ev!=='number'||!Number.isFinite(ev)) throw new Error('Enterprise value must be finite.');
  if (!bridge||typeof bridge!=='object'||Array.isArray(bridge)) throw new Error('Supply cash, debt and other claims separately.');
  for (const key of ['cash','debt','otherClaims']) if (typeof bridge[key]!=='number'||!Number.isFinite(bridge[key])||bridge[key]<0||bridge[key]>10000) throw new Error(`${key} must be between $0B and $10,000B.`);
  const {cash,debt,otherClaims}=bridge, adjustment=cash-debt-otherClaims;
  return {ev,cash,debt,otherClaims,adjustment,equityValue:ev+adjustment,status:'hypothetical'};
}
export function scaleAccountingBasis(p,factor) {
  validate(p);
  if(typeof factor!=='number'||!Number.isFinite(factor)||factor<=0||factor>10) throw new Error('Accounting scale must be positive and at most 10.');
  const result={...p,rev2026:p.rev2026*factor,turns:p.turns*factor,m27:p.m27/factor,m30:p.m30/factor,m36:p.m36/factor};
  validate(result);return result;
}
