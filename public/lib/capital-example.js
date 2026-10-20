import {createCapitalRecord} from './capital-record.js';

/** One deterministic illustration; no sample is persisted in a visitor's browser. */
export function createCapitalExample(presets,company='Anthropic'){
  if(!['Anthropic','OpenAI'].includes(company))throw new Error('Choose Anthropic or OpenAI for the worked decision.');
  if(!presets||typeof presets!=='object'||!presets[company])throw new Error('Complete current operating presets are required for the worked decision.');
  const snapshot={
    company,
    scenarios:['Bear','Base','Bull'].map(label=>({id:label.toLowerCase(),label,assumptions:presets[company][label],continuationYears:null})),
    plans:[
      {id:'a',label:'Smaller round',basis:'pre',quote:250,primaryCapital:25},
      {id:'b',label:'More capital',basis:'pre',quote:300,primaryCapital:35},
      {id:'c',label:'Higher retention',basis:'pre',quote:300,primaryCapital:20}
    ],
    policy:{capitalTarget:25,retentionFloor:.88,modelCoverageFloor:1,holderStake:.1},
    bridge:{cash:20,debt:5,otherClaims:0}
  };
  const decision={
    selectedPlanId:'a',
    rationale:'Illustrative analyst choice: prefer Smaller round because it meets the $25B capital objective and the 88% retained-stake floor with less issuance than More capital. The declared comparison rule is shown separately and must be read alongside the objectives. This is a worked decision, not a real company financing recommendation.',
    tradeoff:'More capital raises an additional $10B and allocates more signed modeled residual to existing holders when pre-money modeled equity is below the $635B switching point. Smaller round allocates more above that point. New cash is retained; no operating growth benefit or investment return is inferred.',
    reviewTrigger:'Revisit the choice if the capital objective rises above $25B, the retained-stake requirement changes, or the quoted terms change. Recalculate the scenario comparison when dated operating evidence or the explicit equity bridge changes; the $635B switching point belongs to these two offers only.',
    informationNeeded:'Confirm unrestricted pre-close cash, current debt and uncovered claims, participating economic rights, transaction costs, use of proceeds, and the basis of the operating forecasts. Seek evidence of achievable financing terms. The assumed quotes and model-conditioned pricing envelope do not establish capital availability.'
  };
  return createCapitalRecord(snapshot,decision);
}
