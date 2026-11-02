/**
 * Script-free SVG views of a simulation result. Each chart has a title and a
 * text description, and the panel prints every plotted value in a table.
 * Rendering helpers may use Math.log10; they never change a result.
 */
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const round=value=>Math.round(value*100)/100;

export function uncertaintyMoney(value,digits=1){
  if(typeof value!=='number'||!Number.isFinite(value))return '–';
  const absolute=Math.abs(value);
  const text=absolute>=1e7?absolute.toExponential(2):absolute.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  return `${value<0?'−':''}$${text}B`;
}

export function uncertaintyPercent(value,digits=1){
  if(typeof value!=='number'||!Number.isFinite(value))return '–';
  return `${(value*100).toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits}).replace('-','−')}%`;
}

const MEASURES=Object.freeze({'operating-ev':'operating enterprise value','equity-value':'hypothetical equity value','equity-after-dilution':'hypothetical equity value after dilution'});
export const measureLabel=measure=>MEASURES[measure]||'value';

function niceStep(span,target){
  if(!(span>0))return 1;
  const raw=span/target,magnitude=10**Math.floor(Math.log10(raw)),fraction=raw/magnitude;
  return (fraction<=1?1:fraction<=2?2:fraction<=2.5?2.5:fraction<=5?5:10)*magnitude;
}

function ticks(low,high,target){
  const step=niceStep(high-low,target),values=[];
  for(let value=Math.ceil(low/step)*step;value<=high+step*1e-9;value+=step)values.push(Math.abs(value)<step*1e-9?0:value);
  return values;
}

/** Histogram of draws between P1 and P99, with percentile, case and hurdle markers. */
export function distributionChart(result,{idPrefix='uncertainty-distribution',subject='the current case'}={}){
  const prefix=String(idPrefix).replace(/[^A-Za-z0-9_-]/g,'-');
  const {histogram,summary:{percentiles:p},base,hurdle,sampling}=result;
  const width=720,height=318,left=58,right=24,top=34,plotBottom=214,bandY=252;
  const bins=histogram.bins,maxCount=Math.max(1,...bins.map(bin=>bin.count));
  const low=histogram.lower,high=histogram.upper>histogram.lower?histogram.upper:histogram.lower+1;
  const x=value=>left+(value-low)/(high-low)*(width-left-right);
  const y=count=>plotBottom-count/maxCount*(plotBottom-top);
  const inside=value=>value>=low&&value<=high;
  const shareTicks=ticks(0,maxCount/sampling.draws,4),shareDigits=shareTicks.every(share=>Number.isInteger(Math.round(share*1e6)/1e4))?0:1;
  const parts=[];
  for(const share of shareTicks){
    const yy=y(share*sampling.draws);
    parts.push(`<line x1="${left}" y1="${round(yy)}" x2="${width-right}" y2="${round(yy)}" class="uq-grid"/><text x="${left-8}" y="${round(yy+4)}" text-anchor="end" class="uq-axis">${escape(uncertaintyPercent(share,shareDigits))}</text>`);
  }
  for(const value of ticks(low,high,5))parts.push(`<text x="${round(x(value))}" y="${plotBottom+18}" text-anchor="middle" class="uq-axis">${escape(uncertaintyMoney(value,0))}</text>`);
  bins.forEach((bin,index)=>{
    const x0=x(bin.lower),x1=histogram.upper>histogram.lower?x(bin.upper):width-right,yy=y(bin.count);
    parts.push(`<rect x="${round(x0+.5)}" y="${round(yy)}" width="${round(Math.max(.5,x1-x0-1))}" height="${round(plotBottom-yy)}" class="uq-bar" data-uncertainty-bin="${index}"/>`);
  });
  parts.push(`<line x1="${left}" y1="${plotBottom}" x2="${width-right}" y2="${plotBottom}" class="uq-baseline"/>`);
  // Percentile band: whiskers P5 to P95, box P25 to P75, median tick.
  parts.push(`<line x1="${round(x(p.p5))}" y1="${bandY}" x2="${round(x(p.p95))}" y2="${bandY}" class="uq-whisker"/>`);
  parts.push(`<rect x="${round(x(p.p25))}" y="${bandY-9}" width="${round(Math.max(1,x(p.p75)-x(p.p25)))}" height="18" class="uq-box"/>`);
  parts.push(`<line x1="${round(x(p.p50))}" y1="${bandY-12}" x2="${round(x(p.p50))}" y2="${bandY+12}" class="uq-median"/>`);
  for(const [key,label] of [['p5','P5'],['p50','P50'],['p95','P95']])parts.push(`<text x="${round(x(p[key]))}" y="${bandY+29}" text-anchor="middle" class="uq-band-label">${label}</text>`);
  const markers=[];
  if(inside(base.value))markers.push(`<line x1="${round(x(base.value))}" y1="${top-6}" x2="${round(x(base.value))}" y2="${plotBottom}" class="uq-case-line"/><text x="${round(x(base.value)+5)}" y="${top-10}" class="uq-marker-label">Case</text>`);
  if(hurdle&&inside(hurdle.value))markers.push(`<line x1="${round(x(hurdle.value))}" y1="${top-6}" x2="${round(x(hurdle.value))}" y2="${plotBottom}" class="uq-hurdle-line"/><text x="${round(x(hurdle.value)-5)}" y="${top-10}" text-anchor="end" class="uq-marker-label">Hurdle</text>`);
  const title=`Simulated ${measureLabel(result.measure)}, ${subject}`;
  const hurdleText=hurdle?` ${uncertaintyPercent(hurdle.probabilityAbove)} of draws exceed the ${uncertaintyMoney(hurdle.value)} hurdle${inside(hurdle.value)?'':', which lies outside the plotted range'}.`:'';
  const description=`Histogram of ${sampling.draws.toLocaleString('en-US')} seeded draws between the 1st and 99th percentiles, ${uncertaintyMoney(low)} to ${uncertaintyMoney(histogram.upper)}; ${histogram.below} draws fall below and ${histogram.above} above that range. Percentiles: P5 ${uncertaintyMoney(p.p5)}, P25 ${uncertaintyMoney(p.p25)}, P50 ${uncertaintyMoney(p.p50)}, P75 ${uncertaintyMoney(p.p75)}, P95 ${uncertaintyMoney(p.p95)}. The deterministic case is ${uncertaintyMoney(base.value)}${inside(base.value)?'':', outside the plotted range'}.${hurdleText}`;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${prefix}-title ${prefix}-desc" class="uq-chart"><title id="${prefix}-title">${escape(title)}</title><desc id="${prefix}-desc">${escape(description)}</desc><text x="${left}" y="16" class="uq-axis-title">Share of draws</text>${parts.join('')}${markers.join('')}<text x="${width-right}" y="${height-4}" text-anchor="end" class="uq-axis-title">USD billions · bars cover P1 to P99</text></svg>`;
}

/** One-way tornado: each bar spans the values at a driver's own P10 and P90. */
export function tornadoChart(result,{idPrefix='uncertainty-tornado',subject='the current case',format=(key,value)=>String(value)}={}){
  const prefix=String(idPrefix).replace(/[^A-Za-z0-9_-]/g,'-');
  const {bars,base}=result.tornado,rowHeight=52,top=40,left=210,right=150,width=760;
  const height=top+bars.length*rowHeight+30;
  const low=Math.min(base,...bars.map(bar=>bar.low)),high=Math.max(base,...bars.map(bar=>bar.high));
  const span=high>low?high-low:Math.max(1,Math.abs(base)*.1),from=high>low?low:base-span/2;
  const x=value=>left+(value-from)/span*(width-left-right);
  const parts=[];
  for(const value of ticks(from,from+span,4))parts.push(`<line x1="${round(x(value))}" y1="${top-8}" x2="${round(x(value))}" y2="${height-28}" class="uq-grid"/><text x="${round(x(value))}" y="${height-12}" text-anchor="middle" class="uq-axis">${escape(uncertaintyMoney(value,0))}</text>`);
  bars.forEach((bar,index)=>{
    const yy=top+index*rowHeight,x0=x(bar.low),x1=x(bar.high),barWidth=Math.max(1.5,x1-x0);
    const lowEnd=bar.valueAtP10<=bar.valueAtP90?'P10':'P90',highEnd=lowEnd==='P10'?'P90':'P10';
    parts.push(`<text x="${left-14}" y="${yy+17}" text-anchor="end" class="uq-tornado-label">${escape(bar.label)}</text>`);
    parts.push(`<text x="${left-14}" y="${yy+32}" text-anchor="end" class="uq-axis">P10 ${escape(format(bar.key,bar.p10))} · P90 ${escape(format(bar.key,bar.p90))}</text>`);
    parts.push(`<rect x="${round(x0)}" y="${yy+5}" width="${round(barWidth)}" height="26" class="uq-tornado-bar" data-uncertainty-tornado="${escape(bar.key)}"/>`);
    // End tags sit inside a bar wide enough to hold both; the table always lists them.
    if(barWidth>=64)parts.push(`<text x="${round(x0+6)}" y="${yy+22}" class="uq-bar-end">${lowEnd}</text><text x="${round(x0+barWidth-6)}" y="${yy+22}" text-anchor="end" class="uq-bar-end">${highEnd}</text>`);
    parts.push(`<text x="${round(x0+barWidth+8)}" y="${yy+22}" class="uq-axis">swing ${escape(uncertaintyMoney(bar.swing,0))}</text>`);
  });
  parts.push(`<line x1="${round(x(base))}" y1="${top-14}" x2="${round(x(base))}" y2="${height-28}" class="uq-case-line"/><text x="${round(x(base))}" y="${top-19}" text-anchor="middle" class="uq-marker-label">Case ${escape(uncertaintyMoney(base,0))}</text>`);
  const title=`One-way sensitivity of ${measureLabel(result.measure)}, ${subject}`;
  const description=`Each bar moves one driver from its own 10th to 90th percentile while the other drivers stay at the case value of ${uncertaintyMoney(base)}. Largest swing first: ${bars.map(bar=>`${bar.label} ${uncertaintyMoney(bar.low)} to ${uncertaintyMoney(bar.high)} (swing ${uncertaintyMoney(bar.swing)})`).join('; ')}.`;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${prefix}-title ${prefix}-desc" class="uq-chart"><title id="${prefix}-title">${escape(title)}</title><desc id="${prefix}-desc">${escape(description)}</desc>${parts.join('')}</svg>`;
}
