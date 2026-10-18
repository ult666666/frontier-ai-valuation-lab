/** Formula-level workbook QA against the independent Python reference. */
import fs from 'node:fs/promises';
import path from 'node:path';

const COMPANIES = ['Anthropic', 'OpenAI'];
const CASES = ['Bear', 'Base', 'Bull'];
const FORMULA_ERROR = /^#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!|SPILL!|CALC!)/;

function assert(condition, message) { if (!condition) throw new Error(message); }
function near(actual, expected, context) {
  if (expected === null) {
    assert(actual === 'n.a.', `${context}: expected n.a., got ${JSON.stringify(actual)}`);
  } else {
    assert(typeof actual === 'number' && Number.isFinite(actual), `${context}: nonnumeric ${JSON.stringify(actual)}`);
    assert(Math.abs(actual - expected) <= Math.max(1e-7, Math.abs(expected) * 1e-10),
      `${context}: ${actual} differs from independent ${expected}`);
  }
}
const snapshots = new Map();
function cell(sheet, address) {
  // One block read per sheet per mutation, instead of one runtime query per cell.
  if (!snapshots.has(sheet)) snapshots.set(sheet, sheet.getRange('A1:O90').values);
  const match = /^([A-Z]+)(\d+)$/.exec(address);
  const column = [...match[1]].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0) - 1;
  return snapshots.get(sheet)[Number(match[2]) - 1][column];
}
function set(sheet, address, item) { snapshots.clear(); sheet.getRange(address).values = [[item]]; }

export async function verifyWorkbook(context, { root, qaDir }) {
  const { wb, sheets, presets, layout } = context;
  const aSheet = sheets.Assumptions;
  const inputAddress = (company, key, caseIndex = 2) => `${layout.inputColumns[company]}${layout.driverRows[key] + caseIndex}`;
  const putCase = (company, inputs) => {
    for (const [key, amount] of Object.entries(inputs)) set(aSheet, inputAddress(company, key), amount);
  };
  const select = n => { set(aSheet, layout.selector, n); wb.recalculate(); };
  const fixture = { rev2026: 100, g1: .04, g2: .04, g3: .04, m27: .2,
    m30: .2, m36: .2, turns: 2.5, wacc: .1, tg: .03, roic: .2, stub: -3, tax: .25 };
  const changedCases = [
    ['Hand-derived fixture', fixture],
    ['Zero perpetual growth, zero tax, positive stub', { ...presets.Anthropic.Base, tg: 0, tax: 0, stub: 2 }],
    ['Nonpositive EV retained', { ...presets.Anthropic.Base, turns: .05 }],
    ['Terminal ROIC below WACC', { ...presets.Anthropic.Base, roic: .08 }],
    ['Changed late growth and margin', { ...presets.Anthropic.Base, g3: .08, m36: .31 }],
    ['All growth zero', { ...presets.Anthropic.Base, g1: 0, g2: 0, g3: 0, tg: 0 }],
  ];
  const namedInputs = COMPANIES.flatMap(company => CASES.map(scenario => [`${company}/${scenario}`, presets[company][scenario]]));
  const reference = JSON.parse(await fs.readFile(path.join(qaDir, 'expected-results.json'), 'utf8'));
  assert(reference.valuationDate === '2026-10-18', 'Independent reference date differs.');
  for (const company of COMPANIES) for (const scenario of CASES) for (const key of Object.keys(layout.driverRows)) {
    assert(reference.inputs?.[company]?.[scenario]?.[key] === presets[company][scenario][key],
      'Independent reference inputs are stale; rerun reference_model.py --include-workbook-cases.');
  }
  const expectedMap = Object.fromEntries(namedInputs.map(([name]) => {
    const [company, scenario] = name.split('/');
    return [name, reference.results[company][scenario]];
  }));
  for (const [name, inputs] of changedCases) {
    const extra = reference.additionalCases?.[name];
    assert(extra, `Missing independent fixture ${name}; rerun reference_model.py --include-workbook-cases.`);
    for (const [key, amount] of Object.entries(inputs)) assert(extra.inputs[key] === amount, `Stale edited fixture ${name}.${key}`);
    expectedMap[name] = extra.result;
  }
  const presetResults = {};
  let numericComparisons = 0;
  const compareBuild = (company, result, label) => {
    assert(cell(sheets[company], 'E6') === 'Valid', `${label}: active input validation failed`);
    assert(cell(aSheet, layout.validCells[company]) === true, `${label}: Assumptions validity is false`);
    for (const [metric, address] of Object.entries(layout.outputCells)) {
      near(cell(sheets[company], address), result[metric], `${label}.${metric}`);
      numericComparisons++;
    }
    result.rows.forEach((row, index) => {
      const column = String.fromCharCode(69 + index);
      near(cell(sheets[company], `${column}9`), row.year, `${label}.${row.year}.year`);
      numericComparisons++;
      for (const [metric, rowNumber] of Object.entries(layout.rowMetrics)) {
        near(cell(sheets[company], `${column}${rowNumber}`), row[metric], `${label}.${row.year}.${metric}`);
        numericComparisons++;
      }
    });
    near(cell(sheets.Summary, `${company === 'Anthropic' ? 'E' : 'F'}10`), result.ev, `${label}.summaryEV`);
    numericComparisons++;
  };
  const sourceSnapshot = JSON.stringify(sheets.Sources.getRange('C7:I16').values);

  // Every year and each terminal/output field is checked for all six presets.
  for (let caseIndex = 1; caseIndex <= 3; caseIndex++) {
    select(caseIndex);
    for (const company of COMPANIES) {
      const key = `${company}/${CASES[caseIndex - 1]}`;
      const result = expectedMap[key];
      compareBuild(company, result, key);
      presetResults[key] = Object.fromEntries(Object.keys(layout.outputCells).map(metric => [metric, result[metric]]));
    }
    assert(JSON.stringify(sheets.Sources.getRange('C7:I16').values) === sourceSnapshot, 'Case selection altered source facts.');
  }
  console.log('Workbook QA: six preset forecasts match independent Python.');

  // Independently calculated edited cases cover zero/negative cash flow and transitions.
  select(2);
  for (const [name, inputs] of changedCases) {
    putCase('Anthropic', inputs); wb.recalculate();
    compareBuild('Anthropic', expectedMap[name], name);
  }
  near(expectedMap['Hand-derived fixture'].ev, 200.31471864537804, 'Manual fixture EV');
  near(expectedMap['Hand-derived fixture'].terminal_fcf, 19.439308071690157, 'Manual fixture terminal FCFF');
  assert(expectedMap['Nonpositive EV retained'].ev < 0, 'Negative-EV test was not negative.');
  putCase('Anthropic', presets.Anthropic.Base); wb.recalculate();
  console.log('Workbook QA: six edited cases match independent Python.');

  let invalidInputCases = 0;
  const invalidCases = [];
  function assertBlocked(company, label) {
    assert(cell(aSheet, layout.validCells[company]) === false, `${label}: owning validation did not fail`);
    assert(cell(sheets[company], 'E6') === 'Invalid', `${label}: build status not invalid`);
    for (const [metric, address] of Object.entries(layout.outputCells)) {
      assert(cell(sheets[company], address) === 'n.a.', `${label}: ${metric} was not suppressed`);
    }
    for (const rowNumber of Object.values(layout.rowMetrics)) {
      for (let i = 0; i < 10; i++) {
        const address = `${String.fromCharCode(69 + i)}${rowNumber}`;
        assert(cell(sheets[company], address) === 'n.a.', `${label}: forecast ${address} was not suppressed`);
      }
    }
    const summaryColumn = company === 'Anthropic' ? 'E' : 'F';
    for (let row = 10; row <= 19; row++) assert(cell(sheets.Summary, `${summaryColumn}${row}`) === 'n.a.', `${label}: Summary row ${row} leaked output`);
    for (let row = 38; row <= 48; row++) assert(cell(sheets.Summary, `${summaryColumn}${row}`) === 'n.a.', `${label}: chart row ${row} leaked output`);
  }
  function invalidInput(company, key, badValue, label) {
    const address = inputAddress(company, key);
    set(aSheet, address, badValue); wb.recalculate();
    const name = `${company}: ${key} ${label}`;
    assertBlocked(company, name);
    const other = company === 'Anthropic' ? 'OpenAI' : 'Anthropic';
    near(cell(sheets[other], 'F32'), expectedMap[`${other}/Base`].ev, `${name}: other company stays valid`);
    invalidInputCases++; invalidCases.push(name);
    set(aSheet, address, presets[company].Base[key]); wb.recalculate();
  }
  const numericInvalids = [
    ['rev2026', 0], ['rev2026', 10001],
    ['g1', -.01], ['g1', 2.01], ['g2', -.01], ['g2', 2.01],
    ['g3', -.01], ['g3', 2.01], ['g3', .02],
    ['m27', -1.01], ['m27', 1.01], ['m30', -1.01], ['m30', 1.01],
    ['m36', 0], ['m36', 1.01],
    ['turns', -2.5], ['turns', .049], ['turns', 100.01],
    ['wacc', .03], ['wacc', .6001], ['tg', -.01], ['tg', .125],
    ['roic', .03], ['roic', 1.01], ['stub', -10001], ['stub', 10001],
    ['tax', -.01], ['tax', 1],
  ];
  for (const company of COMPANIES) {
    for (const key of Object.keys(layout.driverRows)) {
      for (const [label, badValue] of [['blank', null], ['text', 'bad input'], ['boolean', true], ['numeric text', '0.2']]) {
        invalidInput(company, key, badValue, label);
      }
    }
    for (const [key, amount] of numericInvalids) invalidInput(company, key, amount, `out of range (${amount})`);
    console.log(`Workbook QA: ${company} input-domain checks passed.`);
  }

  // Selecting a previously unselected missing case must fail immediately.
  const bearRevenue = inputAddress('Anthropic', 'rev2026', 1);
  set(aSheet, bearRevenue, null); wb.recalculate();
  near(cell(sheets.Anthropic, 'F32'), expectedMap['Anthropic/Base'].ev, 'Unselected blank case isolation');
  select(1); assertBlocked('Anthropic', 'Selected Bear blank');
  invalidInputCases++; invalidCases.push('Selected Bear blank, after unaffected Base');
  set(aSheet, bearRevenue, presets.Anthropic.Bear.rev2026); select(2);

  // The shared selector owns both company cases, including missing/text selectors.
  for (const invalidSelection of [0, 4, 1.5, null, 'Base', true, '2']) {
    select(invalidSelection);
    for (const company of COMPANIES) assertBlocked(company, `Case selector ${JSON.stringify(invalidSelection)}`);
    invalidInputCases++; invalidCases.push(`Invalid shared selector ${JSON.stringify(invalidSelection)}`);
  }
  select(2);

  // The V2 negative-turns failure is captured visually; diagnostic text cannot bypass it.
  const diagnosticFormula = sheets.Anthropic.getRange('F42').formulas[0][0];
  set(aSheet, inputAddress('Anthropic', 'turns'), -2.5);
  set(sheets.Anthropic, 'F42', 'PASS'); wb.recalculate();
  assertBlocked('Anthropic', 'Negative turns with overwritten diagnostic');
  const invalidPreview = await wb.render({ sheetName: 'Assumptions', range: 'C40:J49', scale: 1.4, format: 'png' });
  await fs.writeFile(path.join(qaDir, 'invalid-capital-turns.png'), new Uint8Array(await invalidPreview.arrayBuffer()));
  const invalidSummary = await wb.render({ sheetName: 'Summary', range: 'C5:F20', scale: 1.4, format: 'png' });
  await fs.writeFile(path.join(qaDir, 'invalid-summary.png'), new Uint8Array(await invalidSummary.arrayBuffer()));
  set(aSheet, inputAddress('Anthropic', 'turns'), presets.Anthropic.Base.turns);
  sheets.Anthropic.getRange('F42').formulas = [[diagnosticFormula]];
  wb.recalculate();
  invalidInputCases++; invalidCases.push('Negative capital turns stay blocked with diagnostic overwritten to PASS');

  // Final default state and formula-error scan, without converting formulas to values.
  for (const company of COMPANIES) compareBuild(company, expectedMap[`${company}/Base`], `Final ${company}/Base`);
  assert(cell(aSheet, layout.selector) === 2, 'Default case was not restored.');
  assert(JSON.stringify(sheets.Sources.getRange('C7:I16').values) === sourceSnapshot, 'Verification altered source facts.');
  let formulas = 0, populatedCells = 0;
  for (const [name, sheet] of Object.entries(sheets)) {
    const used = sheet.getUsedRange();
    for (const row of used.values) for (const v of row) {
      if (v !== null && v !== undefined && v !== '') populatedCells++;
      if (typeof v === 'string') {
        assert(!FORMULA_ERROR.test(v), `${name}: formula error ${v}`);
        assert(!/not implemented|unsupported function/i.test(v), `${name}: unsupported formula cache ${v}`);
      }
    }
    for (const row of used.formulas) for (const f of row) {
      if (typeof f === 'string' && f.startsWith('=')) {
        formulas++;
        assert(!/\bAudit\b|\bXIRR\b|\bGOALSEEK\b|\bLAMBDA\b|\bLET\(/i.test(f), `${name}: unsupported or diagnostic dependency ${f}`);
      }
    }
  }
  await fs.writeFile(path.join(qaDir, 'invalid-input-cases.json'), JSON.stringify(invalidCases, null, 2) + '\n');
  return {
    status: 'passed', valuationDate: '2026-10-18', units: 'USD billions',
    presetResults, presetCases: 6, independentEditedCases: changedCases.length,
    numericComparisons, invalidInputCases, formulas, populatedCells,
    checks: [
      'All forecast and terminal fields match independent Python calculations in six presets.',
      'Six additional edited cases cover a hand-derived fixture, zero inputs, negative EV and terminal transitions.',
      'All 13 inputs reject blanks, text, booleans and numeric text for each company.',
      'Numeric bounds and WACC > g, ROIC > g, and late growth >= g are enforced at owning inputs.',
      'Invalid input suppresses that company\'s build, summary and chart values; valid other-company outputs remain live.',
      'Unselected missing case remains isolated until selected; invalid shared selector blocks both companies.',
      'Overwritten diagnostic PASS cannot bypass invalid negative capital turns.',
      'Base restored; source facts unchanged; formula values contain no Excel error tokens.',
    ],
    limitations: [
      'Recalculation and renders use Artifact Tool; native Microsoft Excel is not available in this runtime.',
      'Advanced sensitivity and reverse DCF are provided by the live app; this workbook includes no approximate solver.',
      'Current capital-structure data are unknown, so no automatic equity bridge or per-share value is supplied.',
    ],
  };
}
