import {
  CasebookError,CASEBOOK_LIMITS,createCasebook,normalizeCasebook,normalizeEntry,
  parseCasebook,serializeCasebook,mergeCasebooks,migrateLegacyScenarios
} from './casebook.js';

export const CASEBOOK_STORAGE_KEY='frontier-ai-valuation-lab:casebook:v1';
export const LEGACY_STORAGE_KEY='frontier-ai-valuation-lab:scenarios:v1';
const CHANGE_EVENT='frontier-casebook-change';
// This serializes same-document writers when Web Locks are unavailable. It is
// deliberately not described as a transaction between different browser tabs.
const localQueues=new WeakMap();
const fail=(message,code)=>{throw new CasebookError(message,code);};
const identity=entry=>{const {id,...content}=entry;return JSON.stringify(content);};

function dataRecord(value,allowed,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail(label+' must be a plain object.','validation');
  const result={};
  for(const key of Reflect.ownKeys(value)){
    if(typeof key!=='string'||!allowed.includes(key))fail('Only title, notes and source IDs can change; financial snapshot metadata has an unsupported field.','validation');
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor||!Object.hasOwn(descriptor,'value')||!descriptor.enumerable)fail(label+'.'+key+' must be an enumerable data property.','validation');
    result[key]=descriptor.value;
  }
  return result;
}
function metadataPatch(value){
  const result=dataRecord(value,['title','notes','sourceIds'],'Metadata patch');
  if(Object.hasOwn(result,'notes'))result.notes=dataRecord(result.notes,['rationale','keyAssumption','reviewTrigger'],'Notes');
  if(Object.hasOwn(result,'sourceIds')){
    const list=result.sourceIds;
    if(!Array.isArray(list)||Object.getPrototypeOf(list)!==Array.prototype||list.length>CASEBOOK_LIMITS.sources||Reflect.ownKeys(list).length!==list.length+1)fail('Source IDs must be a complete array of known references.','validation');
    const copy=[];
    for(let index=0;index<list.length;index++){
      const descriptor=Object.getOwnPropertyDescriptor(list,String(index));
      if(!descriptor||!Object.hasOwn(descriptor,'value')||!descriptor.enumerable)fail('Source IDs must be enumerable data properties.','validation');
      copy.push(descriptor.value);
    }
    result.sourceIds=copy;
  }
  return result;
}

/**
 * Explicit browser persistence. Reads never replace corrupt bytes with an empty
 * book; a successful write is reported only after localStorage accepts it.
 */
export function createCasebookStore({research,storage,locks,eventTarget=globalThis.window??null,now=()=>new Date().toISOString(),makeId}={}){
  const listeners=new Set();
  let selectedLocks=locks;
  if(selectedLocks===undefined){
    try{selectedLocks=globalThis.navigator?.locks??null;}catch{selectedLocks=null;}
  }
  function persistentStorage(){
    let selected;
    try{selected=storage===undefined?globalThis.localStorage:storage;}
    catch{fail('Browser storage is unavailable. Export the casebook to keep a portable copy.','storage-unavailable');}
    if(!selected||typeof selected.getItem!=='function'||typeof selected.setItem!=='function')fail('Browser storage is unavailable. Export the casebook to keep a portable copy.','storage-unavailable');
    return selected;
  }
  function storedText(selected,key){
    try{return selected.getItem(key);}
    catch{fail('Saved work could not be read because this browser blocked storage access.','storage-unavailable');}
  }
  function readBook(selected=persistentStorage()){
    const raw=storedText(selected,CASEBOOK_STORAGE_KEY);
    if(raw===null)return createCasebook([],research);
    try{return parseCasebook(raw,research);}
    catch(error){fail('The saved casebook could not be read: '+error.message+' Its stored data has been retained.','storage-corrupt');}
  }
  function announce(reason){
    if(!listeners.size)return;
    Promise.resolve().then(()=>{
      if(!listeners.size)return;
      let book=null,error=null;
      try{book=readBook();}catch(cause){error=cause;}
      for(const listener of [...listeners]){
        try{
          // A subscriber cannot mutate the next subscriber's view or saved bytes.
          const result=listener({book:book===null?null:JSON.parse(JSON.stringify(book)),error,reason});
          if(result&&typeof result.then==='function')result.catch(()=>{});
        }catch{/* A view callback cannot undo an already completed write. */}
      }
    });
  }
  function publish(reason,selected){
    if(eventTarget&&typeof eventTarget.dispatchEvent==='function'){
      const event=new Event(CHANGE_EVENT);
      Object.defineProperty(event,'detail',{value:{key:CASEBOOK_STORAGE_KEY,storage:selected,reason}});
      try{eventTarget.dispatchEvent(event);return;}catch{/* Local notification remains available. */}
    }
    announce(reason);
  }
  function samePageChange(event){
    if(event.detail?.key!==CASEBOOK_STORAGE_KEY)return;
    try{if(event.detail.storage!==persistentStorage())return;}catch{announce('storage');return;}
    announce(event.detail.reason??'change');
  }
  function otherPageChange(event){
    if(event.key!==null&&event.key!==CASEBOOK_STORAGE_KEY)return;
    try{if(event.storageArea&&event.storageArea!==persistentStorage())return;}catch{announce('storage');return;}
    announce('storage');
  }
  if(eventTarget&&typeof eventTarget.addEventListener==='function'){
    eventTarget.addEventListener(CHANGE_EVENT,samePageChange);
    eventTarget.addEventListener('storage',otherPageChange);
  }
  async function mutate(reason,operation){
    const selected=persistentStorage();
    const apply=()=>{
      const current=readBook(selected),result=operation(current,selected);
      const serialized=serializeCasebook(result.book,research);
      if(serialized!==serializeCasebook(current,research)){
        try{selected.setItem(CASEBOOK_STORAGE_KEY,serialized);}
        catch{fail('This browser could not save the casebook. Storage may be full or blocked; previously saved data has been retained.','storage-write');}
        publish(reason,selected);
      }
      return result;
    };
    if(typeof selectedLocks?.request==='function')return selectedLocks.request(CASEBOOK_STORAGE_KEY,apply);
    const previous=localQueues.get(selected)??Promise.resolve();
    const pending=previous.then(apply,apply);
    localQueues.set(selected,pending.then(()=>{},()=>{}));
    return pending;
  }
  function incomingBook(value){return typeof value==='string'?parseCasebook(value,research):normalizeCasebook(value,research);}
  function migration(current,selected){
    const legacy=migrateLegacyScenarios(storedText(selected,LEGACY_STORAGE_KEY),research);
    // A migrated snapshot retains its token and created date when metadata is
    // edited, including when an ID conflict required a fresh ID. Re-running
    // migration must not reintroduce the original empty notes as another record.
    const previouslyMigrated=legacy.book.entries.filter(entry=>current.entries.some(saved=>
      saved.kind===entry.kind&&saved.token===entry.token&&(saved.id===entry.id||saved.createdAt===entry.createdAt)
    ));
    const priorIds=new Set(previouslyMigrated.map(entry=>entry.id));
    const candidates=createCasebook(legacy.book.entries.filter(entry=>!priorIds.has(entry.id)),research);
    const merged=mergeCasebooks(current,candidates,research,{makeId});
    return {...merged,skipped:merged.skipped+previouslyMigrated.length,invalid:legacy.invalid,total:legacy.total};
  }
  return {
    async read(){return readBook();},
    async add(value){
      const captured=normalizeEntry(value,research),incoming=createCasebook([captured],research);
      return mutate('add',current=>{
        const result=mergeCasebooks(current,incoming,research,{makeId});
        const entry=result.entries[0]??result.book.entries.find(item=>identity(item)===identity(captured));
        return {book:result.book,entry:normalizeEntry(entry,research)};
      });
    },
    async update(id,value){
      const patch=metadataPatch(value);
      return mutate('update',current=>{
        const original=current.entries.find(entry=>entry.id===id);
        if(!original)fail('The saved entry was not found. Reload the casebook before editing it.','not-found');
        const observed=now(),updatedAt=observed>original.updatedAt?observed:original.updatedAt;
        const entry=normalizeEntry({...original,...patch,updatedAt},research);
        const book=createCasebook(current.entries.map(item=>item.id===id?entry:item),research);
        return {book,entry:normalizeEntry(entry,research)};
      });
    },
    async remove(id){
      return mutate('remove',current=>{
        const entry=current.entries.find(item=>item.id===id);
        if(!entry)fail('The saved entry was not found. It may already have been removed in another view.','not-found');
        return {book:createCasebook(current.entries.filter(item=>item.id!==id),research),entry:normalizeEntry(entry,research)};
      });
    },
    async previewImport(value){
      const incoming=incomingBook(value);
      return mergeCasebooks(readBook(),incoming,research,{makeId});
    },
    async import(value){
      const incoming=incomingBook(value);
      return mutate('import',current=>mergeCasebooks(current,incoming,research,{makeId}));
    },
    async previewMigration(){
      const selected=persistentStorage();
      return migration(readBook(selected),selected);
    },
    async migrate(){return mutate('migrate',migration);},
    subscribe(listener){
      if(typeof listener!=='function')fail('A casebook subscriber must be a function.','validation');
      listeners.add(listener);
      return ()=>listeners.delete(listener);
    },
    close(){
      listeners.clear();
      eventTarget?.removeEventListener?.(CHANGE_EVENT,samePageChange);
      eventTarget?.removeEventListener?.('storage',otherPageChange);
    }
  };
}
