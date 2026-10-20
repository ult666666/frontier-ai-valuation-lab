import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createCapitalExample} from '../public/lib/capital-example.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const presets=JSON.parse(readFileSync(path.join(root,'data/presets.json'),'utf8'));
const script="import importlib.util,sys;from pathlib import Path;s=importlib.util.spec_from_file_location('delivery',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);m.check_capital_metadata(Path(sys.argv[2]));print('verified')";
function inspect(text){
  const dir=mkdtempSync(path.join(tmpdir(),'frontier-capital-package-test-')),file=path.join(dir,'decision.json');
  try{
    writeFileSync(file,text);const before=readFileSync(file);
    const result=spawnSync('python3',['-B','-c',script,path.join(root,'scripts/deliver_desktop.py'),file],{cwd:root,encoding:'utf8'});
    assert.deepEqual(readFileSync(file),before,'Read-only package verification changed the decision record.');
    return result;
  }finally{rmSync(dir,{recursive:true,force:true});}
}

test('desktop verification recomputes and accepts the complete worked capital decision without writing it',()=>{
  const result=inspect(JSON.stringify(createCapitalExample(presets)));
  assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'verified');
});

test('desktop verification rejects forged capital output even when the inputs and versions are valid',()=>{
  const record=createCapitalExample(presets);record.analysis.matrix[0].existingCohortAllocation+=1;
  const result=inspect(JSON.stringify(record));assert.notEqual(result.status,0);assert.match(result.stderr,/analysis|recomputed|differ/i);
});

test('desktop capital verification rejects incompatible versions and duplicate JSON fields',()=>{
  const original=JSON.stringify(createCapitalExample(presets));
  const incompatible=JSON.parse(original);incompatible.capitalVersion='999.0.0';
  for(const text of [JSON.stringify(incompatible),original.replace('"schema":1','"schema":1,"schema":1')]){
    const result=inspect(text);assert.notEqual(result.status,0);assert.match(result.stderr,/different|duplicate|incompatible/i);
  }
});
