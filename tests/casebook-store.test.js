import test from 'node:test';
import assert from 'node:assert/strict';
import presets from '../data/presets.json' with {type:'json'};
import research from '../data/research.json' with {type:'json'};
import {MODEL_VERSION} from '../public/lib/model.js';
import {createScenarioEntry,createCasebook,serializeCasebook,decodeEntry} from '../public/lib/casebook.js';

const adapter=await import('../public/lib/casebook-store.js').catch(error=>{
  if(error.code==='ERR_MODULE_NOT_FOUND'&&error.url?.endsWith('/public/lib/casebook-store.js'))return {};
  throw error;
});
const KEY='frontier-ai-valuation-lab:casebook:v1',LEGACY='frontier-ai-valuation-lab:scenarios:v1';
const stamp='2026-10-19T09:00:00.000Z',later='2026-10-19T10:00:00.000Z';
const entry=(id='case-1',title='Captured case')=>createScenarioEntry({company:'Anthropic',scenario:'Base',assumptions:{...presets.Anthropic.Base},bridge:{cash:4,debt:1,otherClaims:0}},{id,title,createdAt:stamp,updatedAt:stamp},research);
class MemoryStorage{
  constructor(initial={}){this.values=new Map(Object.entries(initial));this.failReads=false;this.failWrites=false;this.writes=0;}
  getItem(key){if(this.failReads)throw new DOMException('Blocked','SecurityError');return this.values.get(key)??null;}
  setItem(key,value){if(this.failWrites)throw new DOMException('Full','QuotaExceededError');this.values.set(key,String(value));this.writes++;}
  removeItem(key){this.values.delete(key);}
}
function store(storage,options={}){
  assert.equal(typeof adapter.createCasebookStore,'function','createCasebookStore must provide the asynchronous persistence contract');
  return adapter.createCasebookStore({research,storage,locks:null,eventTarget:new EventTarget(),now:()=>later,...options});
}
const legacy=JSON.stringify({version:1,scenarios:[
  {id:'saved-before-casebook',name:'Earlier case',company:'Anthropic',scenario:'Base',assumptions:presets.Anthropic.Base,modelVersion:MODEL_VERSION,savedAt:stamp},
  {id:'bad-legacy',name:'Invalid old input',company:'OpenAI',scenario:'Base',assumptions:{...presets.OpenAI.Base,turns:-1},modelVersion:MODEL_VERSION,savedAt:stamp}
]});

test('an absent book reads as an empty current snapshot without writing or automatically migrating',async()=>{
  const storage=new MemoryStorage({[LEGACY]:legacy}),book=store(storage);
  assert.equal(adapter.CASEBOOK_STORAGE_KEY,KEY);assert.equal(adapter.LEGACY_STORAGE_KEY,LEGACY);
  const result=await book.read();
  assert.equal(result.entries.length,0);assert.equal(result.researchCutoff,research.researchCutoff);
  assert.equal(storage.writes,0);assert.equal(storage.getItem(LEGACY),legacy);
});

test('add re-reads persistent state and metadata updates cannot change a financial snapshot',async()=>{
  const storage=new MemoryStorage(),first=store(storage),second=store(storage);
  await first.read();await second.add(entry('other','Other analyst case'));
  await first.add(entry());
  assert.equal((await second.read()).entries.length,2);
  const updated=await first.update('case-1',{title:'Revised argument',notes:{rationale:'Check operating economics.',keyAssumption:'Margin',reviewTrigger:'Next quarter'},sourceIds:['S19','S04']});
  assert.equal(updated.entry.title,'Revised argument');assert.equal(updated.entry.updatedAt,later);
  assert.deepEqual(updated.entry.sourceIds,['S04','S19']);assert.equal(updated.entry.token,entry().token);assert.equal(updated.entry.createdAt,stamp);
  const before=storage.getItem(KEY);
  await assert.rejects(first.update('case-1',{token:entry('replacement').token}),/metadata|unsupported|snapshot/i);
  assert.equal(storage.getItem(KEY),before);
  updated.entry.notes.rationale='Mutated return value';
  assert.equal((await first.read()).entries.find(item=>item.id==='case-1').notes.rationale,'Check operating economics.');
});

test('metadata accessors are rejected without being executed',async()=>{
  const storage=new MemoryStorage(),book=store(storage);await book.add(entry());
  let reads=0;const patch={};Object.defineProperty(patch,'title',{enumerable:true,get(){reads++;return 'Unexpected';}});
  await assert.rejects(book.update('case-1',patch),/data property|accessor/i);assert.equal(reads,0);
  const nested={notes:{rationale:'',keyAssumption:'',reviewTrigger:''}};
  Object.defineProperty(nested.notes,'rationale',{enumerable:true,get(){reads++;return 'Unexpected';}});
  await assert.rejects(book.update('case-1',nested),/data property|accessor/i);assert.equal(reads,0);
});

test('corrupt stored JSON blocks every mutation and retains the original bytes',async()=>{
  const raw='{not valid JSON',storage=new MemoryStorage({[KEY]:raw}),book=store(storage);
  for(const action of [
    ()=>book.read(),()=>book.add(entry()),()=>book.update('case-1',{title:'New'}),
    ()=>book.remove('case-1'),()=>book.import(createCasebook([entry()],research)),()=>book.migrate()
  ])await assert.rejects(action(),/saved|stored|read|corrupt/i);
  assert.equal(storage.getItem(KEY),raw);assert.equal(storage.writes,0);
});

test('storage denial and quota failures do not replace or falsely report saved work',async()=>{
  const storage=new MemoryStorage(),book=store(storage);await book.add(entry());
  const before=storage.getItem(KEY);storage.failWrites=true;
  for(const action of [
    ()=>book.add(entry('second','Second case')),()=>book.update('case-1',{title:'Cannot save'}),
    ()=>book.remove('case-1'),()=>book.import(createCasebook([entry('imported','Imported argument')],research))
  ])await assert.rejects(action(),/save|storage|quota|write/i);
  assert.equal(storage.getItem(KEY),before);
  storage.failReads=true;
  await assert.rejects(book.read(),/storage|read|available/i);
  await assert.rejects(book.add(entry('third')),/storage|read|available/i);
  storage.failReads=false;assert.equal(storage.getItem(KEY),before);
});

test('strict import preview is read-only and actual import preserves ID conflicts and repeatability',async()=>{
  const storage=new MemoryStorage(),book=store(storage,{makeId:()=> 'conflict-copy'});
  await book.add(entry());
  const incoming=createCasebook([entry('case-1','A different argument')],research),text=serializeCasebook(incoming,research),before=storage.getItem(KEY),writes=storage.writes;
  const preview=await book.previewImport(text);
  assert.equal(preview.imported,1);assert.equal(preview.conflicts,1);assert.equal(storage.getItem(KEY),before);assert.equal(storage.writes,writes);
  const imported=await book.import(text);
  assert.equal(imported.entries[0].id,'conflict-copy');assert.equal(imported.book.entries.length,2);
  const repeated=await book.import(text);
  assert.equal(repeated.imported,0);assert.equal(repeated.skipped,1);assert.equal(repeated.book.entries.length,2);
  const saved=storage.getItem(KEY);
  await assert.rejects(book.import(text.replace('"schema": 1','"schema": 999')),/schema|format/i);
  assert.equal(storage.getItem(KEY),saved);
});

test('the actual import rechecks capacity after a preview instead of evicting a newer saved entry',async()=>{
  const storage=new MemoryStorage(),book=store(storage);
  await book.import(createCasebook(Array.from({length:23},(_,index)=>entry('saved-'+index,'Saved '+index)),research));
  const pending=createCasebook([entry('pending')],research);
  assert.equal((await book.previewImport(pending)).imported,1);
  await book.add(entry('newer','Saved after preview'));
  const before=storage.getItem(KEY);
  await assert.rejects(book.import(pending),/24|full|capacity/i);
  assert.equal(storage.getItem(KEY),before);assert.equal((await book.read()).entries.length,24);
});

test('remove returns the exact snapshot for undo and add preserves an intervening ID conflict',async()=>{
  const storage=new MemoryStorage(),book=store(storage,{makeId:()=> 'restored-copy'});
  await book.add(entry());const removed=await book.remove('case-1');
  assert.deepEqual(removed.entry,entry());assert.equal(removed.book.entries.length,0);
  await book.add(entry('case-1','A newly saved argument'));
  const undone=await book.add(removed.entry);
  assert.equal(undone.entry.id,'restored-copy');assert.equal(undone.entry.title,'Captured case');
  assert.equal(undone.book.entries.length,2);
  await assert.rejects(book.remove('absent'),/found|exist/i);
});

test('explicit legacy migration reports invalid cases, never changes the old key, and does not restore overwritten notes',async()=>{
  const storage=new MemoryStorage({[LEGACY]:legacy}),book=store(storage);
  const preview=await book.previewMigration();assert.equal(preview.imported,1);assert.equal(preview.invalid.length,1);assert.equal(preview.total,2);assert.equal(storage.getItem(KEY),null);
  const migrated=await book.migrate(),id=migrated.entries[0].id;
  assert.equal(migrated.imported,1);assert.equal(decodeEntry(migrated.entries[0]).bridge,null);assert.equal(storage.getItem(LEGACY),legacy);
  await book.update(id,{notes:{rationale:'Notes added after migration.',keyAssumption:'',reviewTrigger:''}});
  const repeated=await book.migrate();
  assert.equal(repeated.imported,0);assert.equal(repeated.skipped,1);assert.equal(repeated.book.entries.length,1);
  assert.equal(repeated.book.entries[0].notes.rationale,'Notes added after migration.');assert.equal(storage.getItem(LEGACY),legacy);
});

test('legacy migration stays idempotent after an ID conflict and subsequent metadata edits',async()=>{
  let allocated=0;
  const storage=new MemoryStorage({[LEGACY]:legacy}),book=store(storage,{makeId:()=>`legacy-copy-${++allocated}`});
  const existing=entry('legacy:saved-before-casebook','An unrelated pre-existing record');
  await book.add(existing);
  const migrated=await book.migrate();
  assert.equal(migrated.conflicts,1);assert.equal(migrated.imported,1);
  const id=migrated.entries[0].id;
  assert.notEqual(id,existing.id);assert.equal(decodeEntry(migrated.entries[0]).bridge,null);
  await book.update(id,{title:'The migrated argument, revised',notes:{rationale:'Keep the revised reasoning.',keyAssumption:'Revenue path',reviewTrigger:'Next disclosure'}});
  const before=storage.getItem(KEY),writes=storage.writes;
  const preview=await book.previewMigration(),repeated=await book.migrate();
  for(const result of [preview,repeated]){
    assert.equal(result.imported,0);assert.equal(result.skipped,1);assert.equal(result.book.entries.length,2);
    assert.deepEqual(result.book.entries.find(item=>item.id===existing.id),existing);
    assert.equal(result.book.entries.find(item=>item.id===id).notes.rationale,'Keep the revised reasoning.');
  }
  assert.equal(storage.getItem(KEY),before);assert.equal(storage.writes,writes);assert.equal(storage.getItem(LEGACY),legacy);
});

test('same-page subscribers receive persisted updates and unsubscribe stops subsequent notifications',async()=>{
  const storage=new MemoryStorage(),events=new EventTarget(),first=store(storage,{eventTarget:events}),second=store(storage,{eventTarget:events});
  const messages=[],received=new Promise(resolve=>second.subscribe(message=>{messages.push(message);resolve(message);}));
  await first.add(entry());const message=await received;
  assert.equal(message.error,null);assert.equal(message.book.entries[0].id,'case-1');
  let count=0;const unsubscribe=second.subscribe(()=>{count++;});unsubscribe();
  await first.add(entry('two','Second case'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(count,0);assert.ok(messages.length>=2);
  first.close();second.close();
});

test('external storage changes report corruption without emitting a fake empty book',async()=>{
  const storage=new MemoryStorage(),events=new EventTarget(),book=store(storage,{eventTarget:events});
  await book.add(entry());
  const received=new Promise(resolve=>book.subscribe(resolve));
  storage.setItem(KEY,'broken');
  const event=new Event('storage');Object.defineProperties(event,{key:{value:KEY},storageArea:{value:storage}});events.dispatchEvent(event);
  const message=await received;
  assert.equal(message.book,null);assert.ok(message.error instanceof Error);assert.match(message.error.message,/stored|saved|read/i);
  assert.equal(storage.getItem(KEY),'broken');book.close();
});

test('available Web Locks serialize complete read-modify-write operations for concurrent views',async()=>{
  const storage=new MemoryStorage(),events=new EventTarget(),requested=[];let tail=Promise.resolve();
  const locks={request(name,callback){requested.push(name);const next=tail.then(callback);tail=next.catch(()=>{});return next;}};
  const first=store(storage,{eventTarget:events,locks}),second=store(storage,{eventTarget:events,locks});
  await Promise.all([first.add(entry('first','First view')),second.add(entry('second','Second view'))]);
  assert.equal((await first.read()).entries.length,2);assert.deepEqual(requested,[KEY,KEY]);
  first.close();second.close();
});
