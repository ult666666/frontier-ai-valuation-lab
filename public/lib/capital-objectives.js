import {createCapitalRecord,normalizeCapitalRecord} from './capital-record.js';

/** Illustrative prompts, not suggested financing terms or company requirements. */
export const CAPITAL_OBJECTIVE_OPTIONS=Object.freeze([
  {id:'25-88',label:'Baseline pair',capitalTarget:25,retentionFloor:.88},
  {id:'25-90',label:'Tighten retention',capitalTarget:25,retentionFloor:.9},
  {id:'30-90',label:'Raise more capital',capitalTarget:30,retentionFloor:.9},
  {id:'30-88',label:'Relax retention',capitalTarget:30,retentionFloor:.88}
].map(Object.freeze));

/** A detached preview from valid current inputs; never trust stored analysis. */
export function previewCapitalObjectives(record,choiceId){
  const choice=CAPITAL_OBJECTIVE_OPTIONS.find(option=>option.id===choiceId);
  if(!choice)throw new Error('Choose an available illustrative objective pair.');
  // Validate before replacing either objective: a preview must not repair an
  // invalid draft or discard an invalid plan, scenario, selection or note.
  const current=normalizeCapitalRecord(record);
  current.snapshot.policy.capitalTarget=choice.capitalTarget;
  current.snapshot.policy.retentionFloor=choice.retentionFloor;
  return createCapitalRecord(current.snapshot,current.decision);
}
