// Guards the plain presentation of the five workspace pages: one plain title,
// sentence-case section titles without numbered eyebrows, a single method and
// limits note, and a footer that names the source and license.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const pages={
  'capital.html':{title:'Capital Strategy Studio',limits:'capital-method'},
  'index.html':{title:'Frontier AI Valuation Lab',limits:'panel-methodology'},
  'thesis.html':{title:'Thesis Lab',limits:'thesis-limits'},
  'horizon.html':{title:'Value Horizon',limits:'horizon-method'},
  'casebook.html':{title:'Research Casebook',limits:null}
};
const read=name=>readFile(new URL(`../public/${name}`,import.meta.url),'utf8');
// Visible text of a trusted local fragment: drop everything between < and >.
const text=html=>{
  let out='',inTag=false;
  for(const ch of html){if(ch==='<')inTag=true;else if(ch==='>')inTag=false;else if(!inTag)out+=ch;}
  return out.replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
};
const headings=(html,level)=>[...html.matchAll(new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)</h${level}>`,'g'))].map(match=>match[1]);

// WCAG 2.2 relative luminance and contrast ratio of two hex colors.
const luminance=hex=>{
  const full=hex.length===4?`#${[...hex.slice(1)].map(c=>c+c).join('')}`:hex;
  const [r,g,b]=[1,3,5].map(i=>parseInt(full.slice(i,i+2),16)/255).map(c=>c<=.03928?c/12.92:((c+.055)/1.055)**2.4);
  return .2126*r+.7152*g+.0722*b;
};
const contrast=(a,b)=>{const [hi,lo]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (hi+.05)/(lo+.05);};

test('the shared field border is visible and leaves state styles in charge',async()=>{
  const css=await read('shell.css');
  const token=name=>css.match(new RegExp(`--${name}:(#[0-9a-f]{6}|#[0-9a-f]{3})\\b`,'i'))?.[1];
  for(const surface of ['surface','surface-2','paper']){
    assert.ok(contrast(token('field-line'),token(surface))>=3,`Field border on --${surface}`);
  }
  // Invalid and focused fields are styled by page rules, which must outrank this
  // default, so it sits inside :where(), which adds no specificity.
  const at=css.indexOf('{border-color:var(--field-line)}');
  assert.ok(at>0,'The shared field border rule exists');
  const selector=css.slice(Math.max(css.lastIndexOf('}',at)+1,css.lastIndexOf('*/',at)+2),at).trim();
  assert.match(selector,/^:where\(/);
});

for(const [name,expected] of Object.entries(pages)){
  test(`${name} opens with one plain page title`,async()=>{
    const html=await read(name),titles=headings(html,1);
    assert.equal(titles.length,1);
    assert.equal(text(titles[0]),expected.title);
    assert.ok(!/<(?:em|i|br)\b/.test(titles[0]),'The title has no italic or broken second line');
  });

  test(`${name} uses plain section titles without numbered eyebrows`,async()=>{
    const html=await read(name);
    for(const level of [2,3]){
      for(const heading of headings(html,level)){
        assert.ok(!/<(?:em|br)\b/.test(heading),`Styled heading: ${heading}`);
        const plain=text(heading);
        assert.ok(plain===''||!/[.!]$/.test(plain),`Section titles are labels, not slogans: ${plain}`);
      }
    }
    assert.ok(!/class="[^"]*\b(?:eyebrow|index-mark|section-index|stage-badge|tab-number|chapter-number)\b/.test(html),'No eyebrow or index-mark furniture');
    assert.ok(!/(?:^|[>\s])(?:F \/ 0\d|0\d \/ )/m.test(html),'No numbered eyebrows such as "01 / Define"');
  });

  test(`${name} keeps prose free of em dashes`,async()=>{
    // A lone em dash is the empty-value placeholder in figures and tables.
    const html=(await read(name)).replace(/>—</g,'><');
    assert.ok(!html.includes('—'),'Prose uses periods, commas, colons or parentheses');
  });

  test(`${name} has a plain footer and at most one method and limits note`,async()=>{
    const html=await read(name),footer=html.match(/<footer class="app-footer">([\s\S]*?)<\/footer>/);
    assert.ok(footer,'The shared footer is present');
    assert.match(footer[1],/github\.com\/ult666666\/frontier-ai-valuation-lab"/);
    assert.match(footer[1],/MIT License/);
    assert.ok(!/AI assistance|Independent fintech research|Working software/i.test(footer[1]),'No motto in the footer');
    const notes=[...html.matchAll(/<h[23][^>]*>\s*Method and limits\s*<\/h[23]>/g)].length;
    if(expected.limits===null)assert.equal(notes,0);
    else{
      assert.equal(notes,1);
      assert.match(html,new RegExp(`id="${expected.limits}"`));
    }
  });
}
