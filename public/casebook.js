import {MODEL_VERSION,VALUATION_DATE,project} from './lib/model.js';
import {APP_VERSION} from './lib/release.js';
import {compareTheses,valuationLandscape} from './lib/thesis.js';
import {thesisUrl} from './lib/thesis-share.js';
import {defaultLandscape} from './lib/journey.js';
import {CASEBOOK_LIMITS,createCasebook,normalizeEntry,decodeEntry,summarizeEntry,entryUrl,serializeCasebook} from './lib/casebook.js';
import {createCasebookStore} from './lib/casebook-store.js';
import {createCasebookBrief} from './lib/casebook-brief.js';

const $=(selector,scope=document)=>scope.querySelector(selector);
const $$=(selector,scope=document)=>[...scope.querySelectorAll(selector)];
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const FORM_FIELDS=[['entry-title','title','title-count',100],['note-rationale','rationale','rationale-count',1200],['note-key-assumption','keyAssumption','key-assumption-count',600],['note-review-trigger','reviewTrigger','review-trigger-count',1000]];
const state={research:null,store:null,book:null,selected:null,editingEntry:null,dirty:false,busy:false,mutating:false,undo:null,compare:[],controller:null,verifyTimer:null,revision:0,importRevision:0,importMode:'file',importCandidate:null,importPreview:null,summaries:new Map()};

function number(value,digits=1){
  if(typeof value!=='number'||!Number.isFinite(value))return '—';
  if(Math.abs(value)>=1e7)return value.toExponential(2).replace('-','−');
  return new Intl.NumberFormat('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(Object.is(value,-0)?0:value).replace('-','−');
}
function money(value,signed=false){return typeof value==='number'&&Number.isFinite(value)?`${value<0?'−':signed&&value>0?'+':''}$${number(Math.abs(value))}bn`:'—';}
function moneyHtml(value,signed=false){return typeof value==='number'&&Number.isFinite(value)?`${value<0?'−':signed&&value>0?'+':''}$${escape(number(Math.abs(value)))}<small>bn</small>`:'—';}
function percent(value){
  if(value===null||!Number.isFinite(value))return 'Undefined';
  if(Number.isFinite(value*100))return `${number(value*100)}%`;
  const [coefficient,exponent]=value.toExponential(2).split('e');return `${coefficient.replace('-','−')}e+${Number(exponent)+2}%`;
}
function dateLabel(value,withTime=false){
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',...(withTime?{hour:'2-digit',minute:'2-digit'}:{}),timeZone:'UTC'}).format(date)+(withTime?' UTC':'');
}
function safeUrl(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}}
function selectedEntry(){return state.book?.entries.find(entry=>entry.id===state.selected)??null;}
function mostRecentEntry(){return state.book?.entries.slice().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id))[0]??null;}
function summary(entry){if(!state.summaries.has(entry.token))state.summaries.set(entry.token,summarizeEntry(entry));return state.summaries.get(entry.token);}
function status(message,kind=''){
  const element=$('#casebook-status');element.textContent=message;element.className=`notice status-notice${kind==='error'?' is-error':''}`;element.hidden=!message;
}
function storageError(error){const element=$('#storage-error');element.textContent=`${error.message||error} Existing saved data has not been replaced. Export an available casebook before clearing browser data.`;element.hidden=false;}
function notesError(message,field){const element=$('#notes-error');element.textContent=message;element.hidden=!message;if(field){$(field).setAttribute('aria-invalid','true');$(field).focus();}}
function setBusy(busy){
  state.busy=busy;document.body.dataset.casebookBusy=String(busy);
  for(const element of $$('#entry-notes-form input, #entry-notes-form textarea'))element.disabled=busy;
  for(const id of ['delete-entry','export-entry','export-brief','copy-calculation','import-open','migration-open','export-all','undo-delete'])$(`#${id}`).disabled=busy||!state.book||(id==='export-all'&&!state.book.entries.length);
  $('#save-notes').disabled=busy||!state.dirty||!selectedEntry();
  $('#import-merge').disabled=busy||!state.importPreview?.imported;
  $('#import-file').disabled=busy;
  $('#import-close').disabled=busy;$('#import-cancel').disabled=busy;$('#discard-notes').disabled=busy;
  renderCompare();
}
function entryHash(id){history.replaceState(null,'',location.pathname+location.search+(id?'#entry='+encodeURIComponent(id):''));}
function requestedEntry(){try{return location.hash.startsWith('#entry=')?decodeURIComponent(location.hash.slice(7)):new URL(location.href).searchParams.get('entry');}catch{return null;}}

function renderCards(){
  if(!state.book)return;
  const query=$('#casebook-search').value.trim().toLocaleLowerCase(),company=$('#company-filter').value,kind=$('#kind-filter').value;
  const entries=[...state.book.entries].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id)).filter(entry=>{
    const info=summary(entry);
    return(company==='all'||info.company===company)&&(kind==='all'||entry.kind===kind)&&(!query||[entry.title,info.company,...Object.values(entry.notes),...entry.sourceIds].join(' ').toLocaleLowerCase().includes(query));
  });
  $('#filtered-count').textContent=`${entries.length} of ${state.book.entries.length}`;
  $('#filter-empty').hidden=entries.length>0;
  $('#entry-list').innerHTML=entries.map(entry=>{
    const info=summary(entry),paired=entry.kind==='thesis',value=paired?info.evDelta:info.ev;
    const subtitle=paired?`${info.referenceScenario} → ${info.alternativeScenario}`:`${info.scenario} origin`;
    return `<article class="entry-card${entry.id===state.selected?' is-selected':''}" data-entry-card="${escape(entry.id)}"><button class="entry-select" type="button" data-select-entry="${escape(entry.id)}" aria-pressed="${entry.id===state.selected}"><span class="card-labels"><span class="company-badge${info.company==='OpenAI'?' is-openai':''}">${escape(info.company)}</span><span class="card-kind">${paired?'Comparison':'Single case'}</span></span><h3>${escape(entry.title)}</h3><span class="card-metric"><span class="card-value${value<0?' is-negative':''}">${moneyHtml(value,paired)}</span><span class="card-case">${paired?'EV change':'Operating EV'}<br>${escape(subtitle)}</span></span></button><div class="card-footer"><time datetime="${escape(entry.updatedAt)}">${escape(dateLabel(entry.updatedAt))}</time>${paired?`<span class="card-source-count">${entry.sourceIds.length} source${entry.sourceIds.length===1?'':'s'}</span>`:`<label class="compare-checkbox"><input type="checkbox" data-compare-entry="${escape(entry.id)}"${state.compare.includes(entry.id)?' checked':''} aria-label="Use ${escape(entry.title)} in a comparison">Compare</label>`}</div></article>`;
  }).join('');
}
function renderCompare(){
  if(!state.book)return;
  state.compare=state.compare.filter(id=>state.book.entries.some(entry=>entry.id===id&&entry.kind==='scenario'));
  const entries=state.compare.map(id=>state.book.entries.find(entry=>entry.id===id));
  const sameCompany=entries.length===2&&summary(entries[0]).company===summary(entries[1]).company;
  $('#compare-saved').disabled=state.busy||!sameCompany;
  $('#clear-comparison').hidden=entries.length===0;
  $('#compare-selection').innerHTML=entries.length?entries.map((entry,index)=>`<span>${index===0?'Reference':'Alternative'}: <strong>${escape(entry.title)}</strong></span>`).join('')+(entries.length===2&&!sameCompany?'<span>Choose two cases for the same company.</span>':''):'No cases selected.';
}
function renderBook({detail=true,focus=false}={}){
  if(!state.book)return;
  const total=state.book.entries.length;$('#casebook-count').textContent=String(total);$('#casebook-capacity').textContent=`${CASEBOOK_LIMITS.entries-total} spaces available`;
  $('#casebook-loading').hidden=true;$('#casebook-empty').hidden=total>0;$('#casebook-layout').hidden=total===0;
  if(!selectedEntry())state.selected=mostRecentEntry()?.id??null;
  renderCards();renderCompare();setBusy(state.busy);
  if(detail)renderDetail({focus});
  document.body.dataset.casebookState=total?'ready':'empty';
}
function stat(label,value,description='',negative=false){return `<div class="snapshot-stat"><span>${escape(label)}</span><strong${negative?' class="is-negative"':''}>${value}</strong>${description?`<p>${escape(description)}</p>`:''}</div>`;}
function renderSnapshot(entry){
  const decoded=decodeEntry(entry),info=summary(entry);
  if(entry.kind==='scenario'){
    const result=project(decoded.assumptions);
    $('#entry-snapshot').innerHTML=`<div class="snapshot-values">${stat('Operating enterprise value',moneyHtml(result.ev),`${decoded.scenario} origin`,result.ev<0)}${stat('Revenue in 2036',moneyHtml(result.rows.at(-1).revenue),'Illustrative annual revenue')}${stat('Terminal value / EV',escape(percent(result.tv_share)),'Value after 2036')}</div>${decoded.bridge?'<p class="snapshot-bridge">Hypothetical cash, debt and other claims are saved with this case and restored when reopened. Operating EV excludes that bridge.</p>':''}`;
  }else{
    $('#entry-snapshot').innerHTML=`<div class="snapshot-values">${stat('Reference operating EV',moneyHtml(info.referenceEv),`${info.referenceScenario} origin`,info.referenceEv<0)}${stat('Alternative operating EV',moneyHtml(info.alternativeEv),`${info.alternativeScenario} origin`,info.alternativeEv<0)}${stat('Alternative − reference',moneyHtml(info.evDelta,true),'Complete modeled EV change',info.evDelta<0)}</div><p class="snapshot-target">Saved target: ${escape(money(decoded.landscape.target))} operating EV · ${decoded.landscape.rates.length} WACC points × ${decoded.landscape.margins.length} margin points.</p>${decoded.reference.bridge||decoded.alternative.bridge?'<p class="snapshot-bridge">Each carried hypothetical equity bridge stays with its own case. Operating EV attribution excludes those balances.</p>':''}`;
  }
  $('#entry-snapshot').dataset.entryToken=entry.token;
}
function renderSources(entry){
  $('#source-choices').innerHTML=state.research.sources.map(source=>{
    const url=safeUrl(source.url);
    return `<div class="source-choice"><input id="casebook-source-${escape(source.id)}" type="checkbox" name="sourceIds" value="${escape(source.id)}"${entry.sourceIds.includes(source.id)?' checked':''}><div><label for="casebook-source-${escape(source.id)}"><span>${escape(source.id)}</span>${escape(source.title)}</label><p>${escape(source.publisher)} · ${escape(source.date)} · ${escape(source.type)}</p><p>${escape(source.limit)}</p>${url?`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">Read source <span aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span></a>`:''}</div></div>`;
  }).join('');
}
function renderDetail({focus=false,preserveVerification=false}={}){
  const entry=selectedEntry();$('#entry-detail').hidden=!entry;$('#detail-empty').hidden=Boolean(entry);
  if(!entry)return;
  state.editingEntry=entry;
  if(!preserveVerification)invalidateVerification();
  const info=summary(entry);$('#detail-company').textContent=info.company;$('#detail-kind').textContent=entry.kind==='thesis'?'Two-case comparison':'Single case';$('#detail-title').textContent=entry.title;
  $('#detail-dates').textContent=`Saved ${dateLabel(entry.createdAt)} · Notes updated ${dateLabel(entry.updatedAt,true)}`;
  $('#entry-detail').dataset.entryId=entry.id;$('#entry-detail').dataset.entryKind=entry.kind;
  renderSnapshot(entry);$('#entry-reopen').href=entryUrl(location.href,entry);
  $('#entry-title').value=entry.title;$('#note-rationale').value=entry.notes.rationale;$('#note-key-assumption').value=entry.notes.keyAssumption;$('#note-review-trigger').value=entry.notes.reviewTrigger;
  renderSources(entry);state.dirty=false;notesError('');$('#external-change').hidden=true;$('#calculation-link-area').hidden=true;
  for(const [id] of FORM_FIELDS)$(`#${id}`).removeAttribute('aria-invalid');
  updateNoteState();entryHash(entry.id);
  if(focus){$('#detail-title').focus({preventScroll:true});if(matchMedia('(max-width:650px)').matches)$('#entry-detail').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});}
}
function metadataFromForm(){return{title:$('#entry-title').value.trim(),notes:{rationale:$('#note-rationale').value,keyAssumption:$('#note-key-assumption').value,reviewTrigger:$('#note-review-trigger').value},sourceIds:$$('#source-choices input:checked').map(input=>input.value)};}
function updateNoteState(){
  for(const [id,,countId,limit]of FORM_FIELDS)$(`#${countId}`).textContent=`${$(`#${id}`).value.length.toLocaleString('en-US')} / ${limit.toLocaleString('en-US')}`;
  const entry=selectedEntry()??(state.editingEntry?.id===state.selected?state.editingEntry:null),metadata=metadataFromForm();
  state.dirty=Boolean(entry&&JSON.stringify(metadata)!==JSON.stringify({title:entry.title,notes:entry.notes,sourceIds:entry.sourceIds}));
  $('#notes-state').textContent=state.dirty?'Unsaved notes':'Saved';$('#notes-state').classList.toggle('is-dirty',state.dirty);
  $('#selected-source-count').textContent=`${metadata.sourceIds.length} selected`;
  $('#save-notes').disabled=!state.dirty||state.busy||!entry;
  if(!selectedEntry())$('#save-notes').disabled=true;
  $('#discard-notes').hidden=!state.dirty;
}
async function persistMetadata({announce=true}={}){
  if(!state.dirty)return true;if(state.busy||!selectedEntry())return false;
  for(const [id,, ,limit]of FORM_FIELDS){
    const input=$(`#${id}`);input.removeAttribute('aria-invalid');
    if(input.value.length>limit){notesError(`Keep this field to ${limit.toLocaleString('en-US')} characters or fewer.`,`#${id}`);return false;}
  }
  const metadata=metadataFromForm();if(!metadata.title){notesError('Give this analysis a title before saving.','#entry-title');return false;}
  const id=state.selected;state.mutating=true;setBusy(true);$('#notes-state').textContent='Saving…';
  try{
    const result=await state.store.update(id,metadata);state.book=result.book;state.selected=result.entry.id;state.dirty=false;renderBook({detail:false});renderDetail({preserveVerification:true});
    $('#storage-error').hidden=true;if(announce)status('Your research notes and source references are saved with the original calculation.');return true;
  }catch(error){notesError(`The notes could not be saved: ${error.message}`);$('#notes-state').textContent='Not saved';return false;}
  finally{state.mutating=false;setBusy(false);}
}
async function selectEntry(id,{focus=true}={}){
  if(state.busy||id===state.selected||!state.book?.entries.some(entry=>entry.id===id))return;
  if(!await persistMetadata({announce:false}))return;state.selected=id;renderCards();renderDetail({focus});
}
function filename(entry,suffix='json'){
  const stem=entry?entry.title.normalize('NFKD').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').slice(0,65).toLowerCase()||'saved-analysis':'frontier-ai-casebook';return `${stem}.${suffix}`;
}
function download(content,name,type){
  const url=URL.createObjectURL(new Blob([content],{type})),anchor=document.createElement('a');anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function exportSnapshot(){
  const entry=selectedEntry()??state.editingEntry;
  if(!entry)throw new Error('Choose a saved analysis first.');
  return state.dirty?normalizeEntry({...entry,...metadataFromForm(),updatedAt:new Date().toISOString()},state.research):entry;
}
async function exportBook(selected=false){
  if(state.busy||!state.book)return;
  try{
    const entry=state.dirty||selected?exportSnapshot():selectedEntry();
    const entries=state.dirty?state.book.entries.filter(item=>item.id!==entry.id).concat(entry):state.book.entries;
    const book=selected?createCasebook([entry],state.research):createCasebook(entries,state.research);
    download(serializeCasebook(book,state.research),filename(selected?entry:null),'application/json;charset=utf-8');
    status((selected?'This analysis was exported with its exact calculation, notes and source references.':'The complete casebook was exported. Keep the JSON file to restore your saved analyses in another browser.')+(state.dirty?' The export includes your unsaved notes; the browser copy has not been updated.':''));
  }catch(error){status(`The export could not be created: ${error.message}`,'error');}
}
async function exportBrief(){
  if(state.busy||(!selectedEntry()&&!state.editingEntry))return;
  try{const entry=exportSnapshot(),html=createCasebookBrief({entry,research:state.research,baseUrl:location.href});download(html,filename(entry,'research-brief.html'),'text/html;charset=utf-8');status('Research brief downloaded with your reasoning, the recalculated snapshot and dated evidence. Open the HTML file and print it to save a PDF.'+(state.dirty?' It includes your unsaved notes; the browser copy has not been updated.':''));}
  catch(error){status(`The research brief could not be created: ${error.message}`,'error');}
}
async function copyCalculation(){
  if(state.busy||!selectedEntry())return;
  const entry=selectedEntry(),revision=state.revision,link=entryUrl(location.href,entry);$('#calculation-link').value=link;$('#calculation-link-area').hidden=false;
  let copied=false;try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(link);copied=true;}}catch{/* Keep the selectable link available. */}
  if(revision!==state.revision||state.selected!==entry.id)return;
  status(copied?'Calculation link copied. Notes and selected sources travel in JSON exports and research briefs.':'The calculation link is ready below. Select and copy it; use a JSON export or research brief to include your notes.');
  if(!copied){$('#calculation-link').focus();$('#calculation-link').select();}
}
function equalResult(actual,expected){
  if(typeof expected==='number')return typeof actual==='number'&&Number.isFinite(actual)&&Math.abs(actual-expected)<=1e-9*Math.max(1,Math.abs(expected));
  if(expected===null||typeof expected!=='object')return actual===expected;
  if(!actual||typeof actual!=='object'||Array.isArray(actual)!==Array.isArray(expected))return false;
  const keys=Object.keys(expected);return keys.length===Object.keys(actual).length&&keys.every(key=>Object.hasOwn(actual,key)&&equalResult(actual[key],expected[key]));
}
function verificationStatus(message,kind=''){$('#entry-verification').textContent=message;$('#entry-verification').dataset.state=kind;}
function invalidateVerification(){
  state.revision++;state.controller?.abort();state.controller=null;if(state.verifyTimer)clearTimeout(state.verifyTimer);state.verifyTimer=null;
  verificationStatus('Recalculated in your browser');$('#verify-entry').disabled=false;$('#verify-entry').innerHTML='Verify calculation <span aria-hidden="true">↗</span>';
}
async function verifyEntry(){
  const entry=selectedEntry();if(!entry||state.controller||state.busy)return;
  const draft=decodeEntry(entry),requests=entry.kind==='scenario'?[{payload:{action:'value',assumptions:draft.assumptions},expected:project(draft.assumptions)}]:[
    {payload:{action:'attribute',reference:draft.reference.assumptions,alternative:draft.alternative.assumptions},expected:compareTheses(draft.reference.assumptions,draft.alternative.assumptions)},
    {payload:{action:'landscape',assumptions:draft.alternative.assumptions,...draft.landscape},expected:valuationLandscape(draft.alternative.assumptions,draft.landscape)}
  ];
  const controller=new AbortController(),revision=state.revision;state.controller=controller;let timedOut=false;
  state.verifyTimer=setTimeout(()=>{timedOut=true;controller.abort();},10000);$('#verify-entry').disabled=true;$('#verify-entry').textContent='Verifying…';verificationStatus('Checking every saved calculation output on the server…','pending');
  try{
    await Promise.all(requests.map(async({payload,expected})=>{
      const response=await fetch(new URL('./api/valuation',location.href),{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload),signal:controller.signal});
      if(!response.ok)throw new Error(response.status===404?'Server verification is unavailable on this host.':`Server verification returned HTTP ${response.status}.`);
      if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Server verification is unavailable on this host.');
      const body=await response.json();if(body.appVersion!==APP_VERSION||body.modelVersion!==MODEL_VERSION||body.valuationDate!==VALUATION_DATE)throw new Error('The server and browser use different release or model versions. Refresh after deployment finishes.');
      if(!equalResult(body.result,expected))throw new Error('The complete server result does not match the saved calculation.');
    }));
    if(revision!==state.revision||state.controller!==controller)return;
    verificationStatus(entry.kind==='thesis'?'Verified on server · Complete attribution and landscape match.':'Verified on server · The complete forecast and valuation match.','success');
  }catch(error){if(revision!==state.revision||state.controller!==controller)return;controller.abort();verificationStatus(`${timedOut?'Server verification timed out after 10 seconds.':error.message} Browser results remain unverified.`,'error');}
  finally{if(revision===state.revision&&state.controller===controller){clearTimeout(state.verifyTimer);state.verifyTimer=null;state.controller=null;$('#verify-entry').disabled=false;$('#verify-entry').innerHTML='Verify calculation <span aria-hidden="true">↗</span>';}}
}
async function compareSaved(){
  if(state.busy||state.compare.length!==2||!await persistMetadata({announce:false}))return;
  const entries=state.compare.map(id=>state.book.entries.find(entry=>entry.id===id));if(entries.some(entry=>!entry||entry.kind!=='scenario'))return;
  const [reference,alternative]=entries.map(decodeEntry);if(reference.company!==alternative.company){status('Choose two single cases for the same company.','error');return;}
  const caseOnly=({scenario,assumptions,bridge})=>({scenario,assumptions,bridge});
  try{location.assign(thesisUrl(new URL('./thesis.html',location.href).href,{company:reference.company,reference:caseOnly(reference),alternative:caseOnly(alternative),landscape:defaultLandscape(alternative.assumptions)}));}
  catch(error){status(`The saved cases could not be compared: ${error.message}`,'error');}
}
async function deleteEntry(){
  if(state.busy||!selectedEntry()||!await persistMetadata({announce:false}))return;
  const id=state.selected;state.mutating=true;setBusy(true);
  try{const result=await state.store.remove(id);state.book=result.book;state.undo=result.entry;state.selected=mostRecentEntry()?.id??null;state.dirty=false;invalidateVerification();renderBook();entryHash(state.selected);$('#undo-message').textContent=`“${result.entry.title}” was removed. You can undo this while the page stays open.`;$('#undo-notice').hidden=false;status('');}
  catch(error){status(`This analysis could not be deleted: ${error.message}`,'error');}
  finally{state.mutating=false;setBusy(false);}
}
async function undoDelete(){
  if(state.busy||!state.undo||!await persistMetadata({announce:false}))return;
  state.mutating=true;setBusy(true);
  try{const result=await state.store.add(state.undo);state.book=result.book;state.selected=result.entry.id;state.undo=null;$('#undo-notice').hidden=true;renderBook({focus:true});status('The deleted analysis has been restored with its calculation and notes.');}
  catch(error){status(`The analysis could not be restored: ${error.message}`,'error');}
  finally{state.mutating=false;setBusy(false);}
}
function importError(message){$('#import-error').textContent=message;$('#import-error').hidden=!message;}
function closeImport(){state.importRevision++;state.importCandidate=null;state.importPreview=null;$('#import-dialog').close();$('#import-open').focus();}
function renderImportPreview(result){
  state.importPreview=result;$('#import-preview').hidden=false;
  $('#import-summary').textContent=result.imported?`${result.imported} ${result.imported===1?'analysis':'analyses'} ready to add.`:'No new analyses to add.';
  const details=[`${result.skipped} exact duplicate${result.skipped===1?'':'s'} will be skipped.`,`${result.conflicts} conflicting version${result.conflicts===1?'':'s'} will be kept as separate analyses.`];
  if(state.importMode==='migration')details.push(`${result.total} earlier record${result.total===1?'':'s'} reviewed. Imported records use a disabled hypothetical equity bridge.`);
  $('#import-detail').textContent=details.join(' ');
  $('#import-entries').innerHTML=result.entries.map(entry=>{const info=summary(entry);return`<li>${escape(entry.title)}<span>${escape(info.company)} · ${entry.kind==='thesis'?'Two-case comparison':'Single case'} · ${escape(dateLabel(entry.updatedAt))}</span></li>`;}).join('');
  const invalid=result.invalid??[];$('#migration-invalid').hidden=invalid.length===0;
  $('#migration-invalid-list').innerHTML=invalid.slice(0,50).map(item=>`<li>${escape(item.id||`Record ${item.index+1}`)}: ${escape(item.reason)}</li>`).join('')+(invalid.length>50?`<li>${invalid.length-50} more invalid records remain in the original storage.</li>`:'');
  $('#import-merge').disabled=state.busy||!result.imported;
}
async function openImport(mode='file'){
  if(state.busy||!state.book||!await persistMetadata({announce:false}))return;
  state.importMode=mode;state.importCandidate=null;state.importPreview=null;const revision=++state.importRevision;
  $('#import-title').textContent=mode==='migration'?'Review earlier saves.':'Import a casebook.';
  $('#import-intro').textContent=mode==='migration'?'Valid earlier scenarios can be added to your casebook. The original records remain untouched.':'Choose an exported casebook JSON file. Review its contents before adding anything to your saved analyses.';
  $('#import-file-field').hidden=mode==='migration';$('#import-file').value='';$('#import-preview').hidden=true;$('#import-merge').disabled=true;$('#import-merge').innerHTML=mode==='migration'?'Import valid earlier saves <span aria-hidden="true">→</span>':'Merge into casebook <span aria-hidden="true">→</span>';importError('');$('#import-dialog').showModal();
  if(mode==='migration'){
    try{const result=await state.store.previewMigration();if(revision===state.importRevision&&$('#import-dialog').open)renderImportPreview(result);}
    catch(error){if(revision===state.importRevision)importError(`The earlier saves could not be reviewed: ${error.message}`);}
  }
}
async function previewFile(){
  const file=$('#import-file').files?.[0],revision=++state.importRevision;state.importCandidate=null;state.importPreview=null;$('#import-preview').hidden=true;$('#import-merge').disabled=true;importError('');if(!file)return;
  if(file.size>CASEBOOK_LIMITS.bytes){importError('This file exceeds the 512 KiB casebook limit. No saved analyses have changed.');return;}
  try{const text=await file.text(),result=await state.store.previewImport(text);if(revision!==state.importRevision||!$('#import-dialog').open)return;state.importCandidate=text;renderImportPreview(result);}
  catch(error){if(revision===state.importRevision)importError(`This file cannot be imported: ${error.message} No saved analyses have changed.`);}
}
async function mergeImport(){
  if(state.busy||!state.importPreview?.imported)return;
  state.mutating=true;setBusy(true);importError('');
  try{
    const result=state.importMode==='migration'?await state.store.migrate():await state.store.import(state.importCandidate);
    state.book=result.book;state.selected=result.entries[0]?.id??state.selected;state.dirty=false;closeImport();renderBook({focus:true});status(`${result.imported} ${result.imported===1?'analysis':'analyses'} added. ${result.skipped} exact duplicate${result.skipped===1?' was':'s were'} skipped. Existing saved analyses were preserved.`);await checkMigration();
  }catch(error){importError(`Nothing was imported: ${error.message} The existing saved casebook is unchanged.`);}
  finally{state.mutating=false;setBusy(false);}
}
async function checkMigration(){
  if(!state.store||!state.book)return;
  try{const result=await state.store.previewMigration();$('#legacy-notice').hidden=!(result.imported||(result.invalid??[]).length);}
  catch(error){$('#legacy-notice').hidden=false;$('#legacy-notice strong').textContent='Earlier saved scenarios need review.';$('#legacy-notice p').textContent=`${error.message} The original records have not been changed.`;}
}
function receiveStoreUpdate({book,error}){
  if(error){storageError(error);return;}if(!book)return;
  const old=selectedEntry();state.book=book;if(state.mutating)return;
  const current=selectedEntry();
  if(state.dirty){
    $('#casebook-count').textContent=String(book.entries.length);$('#casebook-capacity').textContent=`${CASEBOOK_LIMITS.entries-book.entries.length} spaces available`;renderCards();renderCompare();$('#external-change').hidden=false;
    if(!current){status('This analysis was removed in another view. Your unsaved notes remain visible; copy them before loading another saved analysis.','error');$('#save-notes').disabled=true;}
    return;
  }
  renderBook({detail:!old||!current||JSON.stringify(old)!==JSON.stringify(current)});
}
function bindEvents(){
  $('#entry-list').addEventListener('click',event=>{const button=event.target.closest('[data-select-entry]');if(button)void selectEntry(button.dataset.selectEntry);});
  $('#entry-list').addEventListener('change',event=>{
    const input=event.target.closest('[data-compare-entry]');if(!input)return;const id=input.dataset.compareEntry;
    if(input.checked){if(state.compare.length>=2){input.checked=false;status('Two cases are already selected. Clear one selection to choose a different case.');return;}state.compare.push(id);}else state.compare=state.compare.filter(value=>value!==id);
    renderCompare();
  });
  for(const id of ['casebook-search','company-filter','kind-filter'])$(`#${id}`).addEventListener(id==='casebook-search'?'input':'change',renderCards);
  $('#clear-filters').addEventListener('click',()=>{$('#casebook-search').value='';$('#company-filter').value='all';$('#kind-filter').value='all';renderCards();$('#casebook-search').focus();});
  $('#clear-comparison').addEventListener('click',()=>{state.compare=[];renderCards();renderCompare();});$('#compare-saved').addEventListener('click',compareSaved);
  $('#entry-notes-form').addEventListener('submit',event=>{event.preventDefault();void persistMetadata();});
  $('#entry-notes-form').addEventListener('input',event=>{if(event.target.matches('input,textarea')){event.target.removeAttribute('aria-invalid');notesError('');updateNoteState();}});
  $('#entry-notes-form').addEventListener('change',event=>{if(event.target.matches('input[type="checkbox"]'))updateNoteState();});
  $('#reload-entry').addEventListener('click',()=>{state.dirty=false;renderBook();});
  $('#discard-notes').addEventListener('click',()=>{if(state.busy)return;state.dirty=false;renderBook();status('Unsaved edits were discarded. The saved calculation and notes are unchanged.');});
  $('#entry-reopen').addEventListener('click',async event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0)return;if(state.busy){event.preventDefault();return;}if(state.dirty){event.preventDefault();if(await persistMetadata({announce:false}))location.assign(entryUrl(location.href,selectedEntry()));}});
  $('#copy-calculation').addEventListener('click',copyCalculation);$('#verify-entry').addEventListener('click',verifyEntry);$('#export-all').addEventListener('click',()=>exportBook());$('#export-entry').addEventListener('click',()=>exportBook(true));$('#export-brief').addEventListener('click',exportBrief);
  $('#delete-entry').addEventListener('click',deleteEntry);$('#undo-delete').addEventListener('click',undoDelete);
  $('#import-open').addEventListener('click',()=>openImport());$('#migration-open').addEventListener('click',()=>openImport('migration'));$('#import-file').addEventListener('change',previewFile);$('#import-merge').addEventListener('click',mergeImport);
  $('#import-close').addEventListener('click',closeImport);$('#import-cancel').addEventListener('click',closeImport);$('#import-dialog').addEventListener('cancel',event=>{event.preventDefault();if(!state.busy)closeImport();});
  window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue='';}});
  window.addEventListener('hashchange',()=>{const id=requestedEntry();if(id&&id!==state.selected)void selectEntry(id);});
}
async function initialize(){
  bindEvents();
  try{
    const response=await fetch(new URL('./data/research.json',import.meta.url),{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`The dated research register could not be loaded (HTTP ${response.status}).`);
    const research=await response.json();if(research.modelVersion!==MODEL_VERSION||research.asOf!==VALUATION_DATE||!Array.isArray(research.sources))throw new Error('The research register and financial model must use the same version and date.');
    state.research=research;state.store=createCasebookStore({research});state.store.subscribe(receiveStoreUpdate);
    $('#casebook-version').textContent=`Application ${APP_VERSION} · Financial engine ${MODEL_VERSION} · Research snapshot ${dateLabel(VALUATION_DATE)}`;
    state.book=await state.store.read();state.selected=requestedEntry();renderBook();await checkMigration();
  }catch(error){$('#casebook-loading').hidden=true;$('#casebook-empty').hidden=true;document.body.dataset.casebookState='unavailable';storageError(error);}
}
initialize();
