#!/usr/bin/env node
/**
 * Formula workbook, authored only with the Codex primary @oai/artifact-tool.
 * Run a temporary copy of this file and verify_workbook.mjs from an OS tmp
 * directory containing a node_modules symlink to the primary runtime modules.
 * Pass --root /absolute/repository/path. The repository stays dependency-free.
 * First generate independent fixtures from the repository root:
 * python scripts/reference_model.py --include-workbook-cases --output qa-local/workbook/expected-results.json
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Workbook, SpreadsheetFile, FileBlob } from '@oai/artifact-tool';
import { verifyWorkbook } from './verify_workbook.mjs';

const C = {
  ink: '#24302D', muted: '#69736C', rule: '#D4D9D1', paper: '#F7F7F1',
  forest: '#304A42', pale: '#EAF0E9', terra: '#B3654C', teal: '#247D73',
  blue: '#1753A0', green: '#217143', red: '#A22D31', redFill: '#FCE8E7',
  amber: '#FFF2CC', white: '#FFFFFF', black: '#202824',
};
const FONT = 'Arial';
const FMT = {
  money: '$#,##0.0;($#,##0.0);"-"',
  number: '#,##0.0;(#,##0.0);"-"',
  pct: '0.0%;(0.0%);"-"',
  turns: '0.00"x";(0.00"x");"-"',
  time: '0.0000', date: 'mm/dd/yy', diff: '0.00;(0.00);0.00',
};
const DRIVERS = [
  ['rev2026', '2026 revenue estimate', 'FY2026 estimate, not annualized run-rate. Basis is below.', FMT.money],
  ['g1', 'Revenue growth 2027–2030', 'Allowed range: 0–200%.', FMT.pct],
  ['g2', 'Revenue growth 2031–2033', 'Allowed range: 0–200%.', FMT.pct],
  ['g3', 'Revenue growth 2034–2036', '0–200%. Must be at least perpetual growth.', FMT.pct],
  ['m27', 'Economic EBIT margin 2027', 'Allowed range: −100% to 100%.', FMT.pct],
  ['m30', 'Economic EBIT margin 2030', 'Allowed range: −100% to 100%.', FMT.pct],
  ['m36', 'Economic EBIT margin 2036', 'Above 0% and at most 100%.', FMT.pct],
  ['turns', 'Sales / invested capital', 'Incremental revenue / net investment. 0.05–100x.', FMT.turns],
  ['wacc', 'Discount rate (WACC)', 'Above perpetual growth and at most 60%.', FMT.pct],
  ['tg', 'Perpetual growth', 'At least 0%; below both WACC and terminal ROIC.', FMT.pct],
  ['roic', 'Terminal ROIC', 'Above perpetual growth and at most 100%. See Sources S19.', FMT.pct],
  ['stub', 'Remaining-2026 FCFF', 'Only future 2026 cash flow, paid Dec 31. Within ±$10,000B.', FMT.money],
  ['tax', 'Tax on positive EBIT', '0% to below 100%. No NOL tax benefit is modeled.', FMT.pct],
];
const CASES = ['Bear', 'Base', 'Bull'];
const COMPANIES = ['Anthropic', 'OpenAI'];
export const LAYOUT = {
  selector: 'E5', selectorStatus: 'E6', selectedName: 'F5', date: 'I5',
  inputColumns: { Anthropic: 'E', OpenAI: 'F' },
  statusColumns: { Anthropic: 'I', OpenAI: 'J' },
  validCells: { Anthropic: 'E76', OpenAI: 'F76' },
  driverRows: Object.fromEntries(DRIVERS.map(([key], i) => [key, 10 + i * 5])),
  outputCells: {
    pv_explicit: 'F30', pvtv: 'F31', ev: 'F32', tv_share: 'F33',
    peak_funding_need: 'F34', cagr: 'F36', terminal_revenue: 'L30',
    terminal_nopat: 'L31', terminal_reinvestment_rate: 'L32',
    terminal_fcf: 'L34', tv: 'L35', terminal_fcf_change: 'L37',
    implied_incremental_roic: 'L38', pv_stub: 'D23', stub_t: 'D21', terminal_t: 'N21',
  },
  rowMetrics: { revenue: 10, growth: 11, margin: 12, ebit: 13, tax: 14,
    nopat: 15, reinvestment: 16, fcf: 18, t: 21, df: 22, pv: 23, cumulative: 24 },
};

function value(sheet, address, item) { sheet.getRange(address).values = [[item]]; }
function formula(sheet, address, expression) { sheet.getRange(address).formulas = [[expression]]; }
function cols(start, end) { return Array.from({ length: end - start + 1 }, (_, i) => String.fromCharCode(65 + start + i)); }
function header(sheet, address) {
  sheet.getRange(address).format = {
    fill: C.forest, font: { name: FONT, size: 10, bold: true, color: C.white },
    verticalAlignment: 'center', horizontalAlignment: 'center', rowHeight: 24,
    borders: { insideVertical: { style: 'thin', color: C.white } },
  };
}
function section(sheet, address, label) {
  value(sheet, address.split(':')[0], label);
  sheet.getRange(address).format = {
    fill: C.pale, font: { name: FONT, size: 10, color: C.ink, bold: true },
    rowHeight: 24, borders: { bottom: { style: 'thin', color: C.rule } },
  };
}
function baseSheet(sheet, lastCol, lastRow) {
  sheet.showGridLines = false;
  sheet.getRange(`A1:${lastCol}${lastRow}`).format = {
    font: { name: FONT, size: 10, color: C.black }, fill: C.white,
    verticalAlignment: 'center', rowHeight: 20,
  };
  sheet.getRange(`A1:B${lastRow}`).format.columnWidth = 2.2;
  sheet.getRange(`C1:${lastCol}1`).format.rowHeight = 9;
  sheet.getRange(`C2:${lastCol}2`).format.rowHeight = 29;
  sheet.getRange(`C2:${lastCol}2`).format.font = { name: FONT, size: 16, bold: true, color: C.ink };
  sheet.getRange(`C3:${lastCol}3`).format.font = { name: FONT, size: 10, color: C.muted, italic: true };
  sheet.getRange(`C3:${lastCol}3`).format.borders = { bottom: { style: 'thin', color: C.rule } };
  sheet.getRange(`C4:${lastCol}4`).format.rowHeight = 9;
}
function linkedCase(sheet) {
  value(sheet, 'C5', 'Case selected:');
  formula(sheet, 'E5', "='Assumptions'!F5");
  sheet.getRange('E5').format = {
    font: { name: FONT, size: 10, bold: true, color: C.green },
    horizontalAlignment: 'center', borders: { preset: 'outside', style: 'dotted', color: C.rule },
  };
}
function redWhen(sheet, address, expression) {
  sheet.getRange(address).conditionalFormats.addCustom(expression, {
    fill: C.redFill, font: { bold: true, color: C.red },
  });
}
function sourceNote(wb, sheet, cell, text) {
  wb.notes.add({ id: `${sheet.name}:${cell}`, target: { cell: { sheetName: sheet.name,
    sheetId: sheet.sheetId, address: cell } }, authorId: '', createdAt: '', body: { plainText: text } });
}
function selectedFormula(column, row) {
  const refs = CASES.map((_, i) => `${column}${row + i + 1}`);
  // Test the selected source cell directly before CHOOSE can coerce a blank to 0.
  const numeric = refs.map(ref => `ISNUMBER(${ref})`).join(',');
  return `=IF($E$6="Valid case",IF(CHOOSE($E$5,${numeric}),CHOOSE($E$5,${refs.join(',')}),"n.a."),"n.a.")`;
}
function inputStatus(column, key) {
  const address = `${column}${LAYOUT.driverRows[key]}`;
  const a = k => `${column}${LAYOUT.driverRows[k]}`;
  const checks = {
    rev2026: `${address}>0,${address}<=10000`,
    g1: `${address}>=0,${address}<=2`, g2: `${address}>=0,${address}<=2`,
    g3: `${address}>=0,${address}<=2,${address}>=${a('tg')}`,
    m27: `${address}>=-1,${address}<=1`, m30: `${address}>=-1,${address}<=1`,
    m36: `${address}>0,${address}<=1`, turns: `${address}>=0.05,${address}<=100`,
    wacc: `${address}>${a('tg')},${address}<=0.6`,
    tg: `${address}>=0,${address}<${a('wacc')},${address}<${a('roic')}`,
    roic: `${address}>${a('tg')},${address}<=1`,
    stub: `${address}>=-10000,${address}<=10000`, tax: `${address}>=0,${address}<1`,
  };
  const extra = key === 'tg' ? ['wacc', 'roic'] : ['wacc', 'roic', 'g3'].includes(key) ? ['tg'] : [];
  const isNumeric = [key, ...extra].map(k => `ISNUMBER(${a(k)})`).join(',');
  return `=IF(AND(${isNumeric}),IF(AND(${checks[key]}),"Valid","Invalid"),"Missing / text")`;
}

function buildAssumptions(wb, sheet, presets, research) {
  baseSheet(sheet, 'J', 88);
  sheet.tabColor = '#5D756B';
  const widths = { C: 36, D: 15, E: 15, F: 15, G: 3, H: 66, I: 17, J: 17 };
  for (const [col, width] of Object.entries(widths)) sheet.getRange(`${col}1:${col}88`).format.columnWidth = width;
  value(sheet, 'C2', 'Scenario assumptions');
  value(sheet, 'C3', 'USD billions. Blue case inputs are editable. Every future driver is an analyst assumption.');
  value(sheet, 'C5', 'Case selected (1 / 2 / 3):');
  value(sheet, 'E5', 2);
  sheet.getRange('E5').format = { fill: C.amber, font: { name: FONT, size: 10, color: C.blue, bold: true },
    horizontalAlignment: 'center', borders: { preset: 'outside', style: 'dotted', color: C.rule } };
  sheet.getRange('E5').dataValidation = { rule: { type: 'list', values: ['1', '2', '3'] } };
  formula(sheet, 'E6', '=IF(ISNUMBER(E5),IF(AND(E5>=1,E5<=3,MOD(E5,1)=0),"Valid case","Invalid case"),"Invalid case")');
  formula(sheet, 'F5', '=IF(E6="Valid case",CHOOSE(E5,"Bear","Base","Bull"),"Invalid case")');
  value(sheet, 'C6', '1 Bear   2 Base   3 Bull');
  value(sheet, 'H5', 'Valuation date (fixed)');
  formula(sheet, 'I5', '=DATE(2026,10,18)');
  sheet.getRange('I5').setNumberFormat(FMT.date);
  value(sheet, 'H6', 'Forecast ends December 31, 2036. Year-end cash flow timing.');
  sheet.getRange('C8:F8').values = [['Driver', 'Selection', 'Anthropic', 'OpenAI']];
  sheet.getRange('H8:J8').values = [['Meaning and permitted values', 'Anthropic input', 'OpenAI input']];
  header(sheet, 'C8:F8'); header(sheet, 'H8:J8');
  DRIVERS.forEach(([key, label, meaning, format], index) => {
    const row = 10 + index * 5;
    value(sheet, `C${row}`, label); value(sheet, `D${row}`, 'Active');
    value(sheet, `H${row}`, meaning);
    sheet.getRange(`C${row}:F${row}`).format.fill = C.pale;
    sheet.getRange(`C${row}:F${row}`).format.font.bold = true;
    sheet.getRange(`E${row}:F${row + 3}`).setNumberFormat(format);
    if ([FMT.pct, FMT.turns].includes(format)) sheet.getRange(`C${row}:F${row + 3}`).format.font.italic = true;
    for (const company of COMPANIES) {
      const col = LAYOUT.inputColumns[company], statusCol = LAYOUT.statusColumns[company];
      formula(sheet, `${col}${row}`, selectedFormula(col, row));
      sheet.getRange(`${col}${row + 1}:${col}${row + 3}`).values = CASES.map(scenario => [presets[company][scenario][key]]);
      sheet.getRange(`${col}${row + 1}:${col}${row + 3}`).format.font.color = C.blue;
      sheet.getRange(`${col}${row + 1}:${col}${row + 3}`).format.fill = '#F2F6FD';
      formula(sheet, `${statusCol}${row}`, inputStatus(col, key));
      redWhen(sheet, `${statusCol}${row}`, `${statusCol}${row}<>"Valid"`);
      redWhen(sheet, `${col}${row}`, `$${statusCol}$${row}<>"Valid"`);
      CASES.forEach((_, j) => redWhen(sheet, `${col}${row + j + 1}`,
        `AND($E$5=${j + 1},$${statusCol}$${row}<>"Valid")`));
    }
    sheet.getRange(`D${row + 1}:D${row + 3}`).values = CASES.map(name => [name]);
  });
  section(sheet, 'C75:F75', 'Active input validation');
  value(sheet, 'C76', 'All 13 inputs valid');
  for (const company of COMPANIES) {
    const statuses = DRIVERS.map(([key]) => `${LAYOUT.statusColumns[company]}${LAYOUT.driverRows[key]}="Valid"`).join(',');
    formula(sheet, LAYOUT.validCells[company], `=AND($E$6="Valid case",${statuses})`);
    redWhen(sheet, LAYOUT.validCells[company], `${LAYOUT.validCells[company]}=FALSE`);
  }
  value(sheet, 'H76', 'Invalid active inputs suppress that company’s operating valuation.');
  redWhen(sheet, 'E5:F6', '$E$6<>"Valid case"');
  section(sheet, 'C80:F80', 'Revenue basis and accounting');
  value(sheet, 'C82', 'Anthropic FY2026 estimate');
  value(sheet, 'H82', 'Base preset: Q1 4.7 + Q2 11.6 + Q3 16.8 + Q4 assumed 20.16 = 53.26.');
  value(sheet, 'C83', 'OpenAI FY2026 estimate');
  value(sheet, 'H83', 'Base preset $35B is illustrative. It is not a verified company forecast.');
  value(sheet, 'C84', 'Comparability');
  value(sheet, 'H84', 'Revenue recognition differs. A presentation change must also adjust costs.');
  value(sheet, 'C85', 'Investment convention');
  value(sheet, 'H85', 'Net reinvestment includes net capex and working capital. Do not add them again.');
  value(sheet, 'C86', 'Source for reported quarters');
  const source = research.sources.find(s => s.id === 'S18');
  value(sheet, 'H86', 'Reuters, October 14–15, 2026 (S18). Full URL is in Sources.');
  sheet.getRange('H86').format.font.color = C.green;
  sourceNote(wb, sheet, 'H86', source.url);
  sourceNote(wb, sheet, 'E12', `Illustrative V2 Base assumption. Reported quarters: ${source.url}. Q4 $20.16B is assumed, not reported.`);
  sourceNote(wb, sheet, 'F12', 'Illustrative V2 Base assumption retained at $35B. No verified company FY2026 forecast is attributed to this input.');
  sheet.freezePanes.freezeRows(8);
  sheet.freezePanes.freezeColumns(4);
}

function buildForecast(wb, sheet, company, research) {
  baseSheet(sheet, 'N', 61);
  sheet.tabColor = company === 'Anthropic' ? C.terra : C.teal;
  sheet.getRange('C1:C61').format.columnWidth = 37;
  sheet.getRange('D1:N61').format.columnWidth = 14;
  value(sheet, 'C2', `${company} forecast`);
  value(sheet, 'C3', 'USD billions. Economic EBIT, net reinvestment and year-end FCFF.');
  linkedCase(sheet);
  value(sheet, 'H5', 'Valuation date:');
  formula(sheet, 'J5', "='Assumptions'!I5"); sheet.getRange('J5').setNumberFormat(FMT.date);
  value(sheet, 'C6', 'Active assumptions:');
  formula(sheet, 'E6', `=IF('Assumptions'!${LAYOUT.validCells[company]},"Valid","Invalid")`);
  redWhen(sheet, 'E6', 'E6<>"Valid"');
  value(sheet, 'H6', 'Terminal year is fixed at 2036.');
  const ac = LAYOUT.inputColumns[company];
  const a = key => `'Assumptions'!$${ac}$${LAYOUT.driverRows[key]}`;
  const gate = expression => `=IF($E$6="Valid",${expression},"n.a.")`;
  sheet.getRange('C9:N9').values = [['Calendar year', '2026 stub', ...Array.from({ length: 10 }, (_, i) => 2027 + i)]];
  header(sheet, 'C9:N9');
  const labels = {
    10: 'Revenue', 11: 'Revenue growth', 12: 'Economic EBIT margin', 13: 'Economic EBIT',
    14: 'Tax on positive EBIT', 15: 'NOPAT', 16: 'Net reinvestment', 18: 'FCFF',
    20: 'Cash flow date', 21: 'Years from valuation date', 22: 'Discount factor',
    23: 'Present value of FCFF', 24: 'Cumulative undiscounted FCFF',
  };
  for (const [row, label] of Object.entries(labels)) value(sheet, `C${row}`, label);
  sheet.getRange('D10:N24').setNumberFormat(FMT.number);
  sheet.getRange('D10:N10').setNumberFormat(FMT.money);
  sheet.getRange('D18:N18').setNumberFormat(FMT.money);
  sheet.getRange('D23:N24').setNumberFormat(FMT.money);
  sheet.getRange('D20:N20').setNumberFormat(FMT.date);
  sheet.getRange('D21:N22').setNumberFormat(FMT.time);
  sheet.getRange('D11:N12').setNumberFormat(FMT.pct);
  sheet.getRange('C11:N12').format.font.italic = true;
  sheet.getRange('C21:N22').format.font.italic = true;
  for (const row of [15, 18, 23, 24]) sheet.getRange(`C${row}:N${row}`).format = {
    font: { name: FONT, size: 10, bold: true, color: C.black },
    borders: { top: { style: 'thin', color: C.rule } },
  };
  sheet.getRange('C18:N18').format.fill = C.pale;
  formula(sheet, 'D10', gate(a('rev2026')));
  for (const row of [11, 12, 13, 14, 15, 16]) value(sheet, `D${row}`, 'n.a.');
  formula(sheet, 'D18', gate(a('stub')));
  formula(sheet, 'D20', '=DATE(2026,12,31)');
  formula(sheet, 'D21', gate("(D20-'Assumptions'!$I$5)/365.25"));
  formula(sheet, 'D22', gate(`(1+${a('wacc')})^(-D21)`));
  formula(sheet, 'D23', gate('D18*D22')); formula(sheet, 'D24', gate('D18'));
  const yearColumns = cols(4, 13);
  const writeRow = (row, expressions) => { sheet.getRange(`E${row}:N${row}`).formulas = [expressions.map(gate)]; };
  writeRow(11, yearColumns.map((_, i) => a(i < 4 ? 'g1' : i < 7 ? 'g2' : 'g3')));
  writeRow(10, yearColumns.map((col, i) => `${String.fromCharCode(68 + i)}10*(1+${col}11)`));
  writeRow(12, yearColumns.map(col => `IF(${col}$9<=2030,${a('m27')}+(${a('m30')}-${a('m27')})*(${col}$9-2027)/3,${a('m30')}+(${a('m36')}-${a('m30')})*(${col}$9-2030)/6)`));
  writeRow(13, yearColumns.map(col => `${col}10*${col}12`));
  writeRow(14, yearColumns.map(col => `MAX(0,${col}13)*${a('tax')}`));
  writeRow(15, yearColumns.map(col => `${col}13-${col}14`));
  writeRow(16, yearColumns.map((col, i) => `(${col}10-${String.fromCharCode(68 + i)}10)/${a('turns')}`));
  writeRow(18, yearColumns.map(col => `${col}15-${col}16`));
  sheet.getRange('E20:N20').formulas = [yearColumns.map(col => `=DATE(${col}$9,12,31)`)];
  writeRow(21, yearColumns.map(col => `(${col}20-'Assumptions'!$I$5)/365.25`));
  writeRow(22, yearColumns.map(col => `(1+${a('wacc')})^(-${col}21)`));
  writeRow(23, yearColumns.map(col => `${col}18*${col}22`));
  writeRow(24, yearColumns.map((col, i) => `${String.fromCharCode(68 + i)}24+${col}18`));
  for (const address of ['D10', 'D18', 'D21:D22', 'E11:N12', 'E14:N14', 'E16:N16', 'E21:N22', 'J5']) {
    sheet.getRange(address).format.font.color = C.green;
  }
  section(sheet, 'C28:F28', 'Enterprise value build');
  section(sheet, 'H28:N28', 'Perpetuity and transition');
  const valuationLabels = { 30: 'PV explicit cash flows, including stub', 31: 'PV terminal value',
    32: 'Operating enterprise value', 33: 'Terminal value / enterprise value',
    34: 'Peak cumulative FCFF deficit', 36: 'Revenue CAGR, 2026–2036' };
  for (const [row, label] of Object.entries(valuationLabels)) value(sheet, `C${row}`, label);
  formula(sheet, 'F30', gate('SUM(D23:N23)'));
  formula(sheet, 'F31', gate('L36'));
  formula(sheet, 'F32', gate('SUM(F30:F31)'));
  formula(sheet, 'F33', gate('IF(F32>0,F31/F32,"n.a.")'));
  formula(sheet, 'F34', gate('-MIN(0,D24:N24)'));
  formula(sheet, 'F36', gate('(N10/D10)^(1/10)-1'));
  const terminalLabels = { 30: '2037 revenue', 31: '2037 NOPAT', 32: 'Reinvestment share (g / ROIC)',
    33: '2037 net reinvestment', 34: '2037 FCFF', 35: 'Terminal value at 12/31/2036',
    36: 'PV terminal value', 37: 'FCFF change from 2036', 38: 'Implied incremental ROIC' };
  for (const [row, label] of Object.entries(terminalLabels)) value(sheet, `H${row}`, label);
  formula(sheet, 'L30', gate(`N10*(1+${a('tg')})`));
  formula(sheet, 'L31', gate(`L30*${a('m36')}*(1-${a('tax')})`));
  formula(sheet, 'L32', gate(`${a('tg')}/${a('roic')}`));
  formula(sheet, 'L33', gate('L31*L32'));
  formula(sheet, 'L34', gate('L31-L33'));
  formula(sheet, 'L35', gate(`L34/(${a('wacc')}-${a('tg')})`));
  formula(sheet, 'L36', gate('L35*N22'));
  formula(sheet, 'L37', gate('IF(N18>0,L34/N18-1,"n.a.")'));
  formula(sheet, 'L38', gate(`${a('m36')}*(1-${a('tax')})*${a('turns')}`));
  sheet.getRange('F30:F36').setNumberFormat(FMT.money);
  sheet.getRange('L30:L38').setNumberFormat(FMT.money);
  for (const address of ['F33', 'F36', 'L32', 'L37:L38']) sheet.getRange(address).setNumberFormat(FMT.pct);
  for (const address of ['C33:F33', 'C36:F36', 'H32:L32', 'H37:L38']) sheet.getRange(address).format.font.italic = true;
  sheet.getRange('C32:F32').format = { fill: C.pale, font: { name: FONT, size: 12, color: C.ink, bold: true },
    rowHeight: 26, borders: { bottom: { style: 'double', color: C.forest } } };
  for (const address of ['L30:L32', 'L35', 'L38']) sheet.getRange(address).format.font.color = C.green;
  section(sheet, 'C40:F40', 'Model diagnostics');
  const diagnostic = [
    [42, 'Terminal share above 75%', 'IF(ISNUMBER(F33),IF(F33>0.75,"Review","Within threshold"),"n.a.")'],
    [43, 'Terminal FCFF change above ±25%', 'IF(ISNUMBER(L37),IF(ABS(L37)>0.25,"Review","Within threshold"),"n.a.")'],
    [44, 'ROIC transition above ±5 points', `IF(ABS(L38-${a('roic')})>0.05,"Review","Within threshold")`],
    [45, 'Terminal ROIC below WACC', `IF(${a('roic')}<${a('wacc')},"Review","No")`],
    [46, 'Nonpositive enterprise value', 'IF(F32<=0,"Review","No")'],
  ];
  for (const [row, label, expression] of diagnostic) {
    value(sheet, `C${row}`, label); formula(sheet, `F${row}`, gate(expression));
    redWhen(sheet, `F${row}`, `F${row}="Review"`);
  }
  value(sheet, 'H42', 'Diagnostics read the build. They never control business calculations.');
  value(sheet, 'H44', 'The FCFF deficit excludes opening liquidity, financing and intrayear timing.');
  value(sheet, 'H46', 'No current cash/debt bridge or equity preference waterfall is assumed.');
  if (company === 'Anthropic') {
    section(sheet, 'C50:F50', 'FY2026 estimate bridge');
    const items = [[52, 'Reported Q1:26 revenue', "='Sources'!E11"],
      [53, 'Reported Q2:26 revenue', "='Sources'!E12"],
      [54, 'Reported Q3:26 revenue', "='Sources'!E13"],
      [55, 'Reported nine-month revenue', '=SUM(F52:F54)'],
      [56, 'Implied Q4 estimate', gate('D10-F55')],
      [57, 'Active FY2026 revenue estimate', gate('SUM(F55:F56)')]];
    for (const [row, label, expression] of items) { value(sheet, `C${row}`, label); formula(sheet, `F${row}`, expression); }
    sheet.getRange('F52:F57').setNumberFormat(FMT.money);
    sheet.getRange('F52:F54').format.font.color = C.green;
    value(sheet, 'H52', 'Reported quarters: Reuters, October 14–15, 2026. Source S18.');
    value(sheet, 'H54', 'Q4 is an analyst estimate implied by the editable FY2026 assumption.');
    value(sheet, 'H56', 'The default Base Q4 estimate is $20.16B. No FY2026 actual is claimed.');
  } else {
    section(sheet, 'C50:F50', 'Revenue basis');
    value(sheet, 'C52', 'FY2026 analyst estimate'); formula(sheet, 'F52', gate('D10'));
    sheet.getRange('F52').setNumberFormat(FMT.money);
    value(sheet, 'H52', 'Base $35B is a retained illustrative assumption, not a verified forecast.');
    value(sheet, 'H54', 'September annualized revenue was reported near $50B. Source S05.');
    value(sheet, 'H56', 'Annualized pace is not full-year revenue or contracted recurring revenue.');
  }
  sheet.freezePanes.freezeRows(9);
  sheet.freezePanes.freezeColumns(3);
}

function buildSources(wb, sheet, research) {
  baseSheet(sheet, 'I', 49);
  const widths = { C: 9, D: 40, E: 48, F: 28, G: 3, H: 88, I: 3 };
  for (const [col, width] of Object.entries(widths)) sheet.getRange(`${col}1:${col}49`).format.columnWidth = width;
  value(sheet, 'C2', 'Source data and evidence');
  value(sheet, 'C3', 'Research cutoff October 18, 2026, 09:22 PDT. Source dates and observation periods differ.');
  linkedCase(sheet);
  sheet.getRange('C6:F6').values = [['Source', 'Reference input', 'Value (USD B)', 'Observation period']];
  value(sheet, 'H6', 'Definition (full source URLs are in the register below)');
  header(sheet, 'C6:F6'); header(sheet, 'H6');
  const facts = [
    ['S01', 'Anthropic completed equity valuation', 965, new Date('2026-05-28T00:00:00Z'), 'Post-money Series H equity. Not enterprise value or current net cash.'],
    ['S02', 'OpenAI completed equity valuation', 852, new Date('2026-03-31T00:00:00Z'), 'Post-money completed financing. The $122B is committed capital.'],
    ['S03', 'OpenAI proposed equity valuation', 1400, new Date('2026-09-29T00:00:00Z'), 'Pre-money ask in early discussions. No closing is established.'],
    ['S05', 'OpenAI September annualized pace', 50, 'September 2026', 'Reported almost $50B/year. Not actual FY2026 revenue.'],
    ['S18', 'Anthropic Q1:26 revenue', 4.7, 'Quarter ended 03/31/26', 'Reported actual period. Part of the illustrative FY estimate bridge.'],
    ['S18', 'Anthropic Q2:26 revenue', 11.6, 'Quarter ended 06/30/26', 'Later reported comparator. Earlier coverage used $11.5B.'],
    ['S18', 'Anthropic Q3:26 revenue', 16.8, 'Quarter ended 09/30/26', 'Reported actual period. Adjusted profit is not GAAP EBIT or FCFF.'],
    ['S07', 'Anthropic 2025 revenue', 4.6, 'FY2025', 'Approximately $4.6B, from Reuters review of a confidential prospectus.'],
    ['S08', 'OpenAI 2025 revenue', 13.07, 'FY2025', 'Reported leaked statements described as audited, not reviewed directly here.'],
    ['S13', 'Anthropic capacity obligations', 518, 'Mainly next 7–10 years', 'At least $518B of mixed service, lease and capacity commitments. Not direct debt.'],
  ];
  for (let i = 0; i < facts.length; i++) {
    const [id, name, amount, period, definition] = facts[i], row = 7 + i;
    sheet.getRange(`C${row}:F${row}`).values = [[id, name, amount, period]];
    value(sheet, `H${row}`, definition);
    const source = research.sources.find(s => s.id === id);
    sourceNote(wb, sheet, `D${row}`, `${id}: ${source.url}`);
  }
  sheet.getRange('E7:E16').setNumberFormat(FMT.money);
  sheet.getRange('F7:F9').setNumberFormat(FMT.date);
  sheet.getRange('F7:F16').format.horizontalAlignment = 'center';
  value(sheet, 'D19', 'Current balance sheet and share data');
  value(sheet, 'H19', 'Current excess cash, debt, lease balances, preferred rights and diluted share count: unknown.');
  value(sheet, 'D20', 'Model policy');
  value(sheet, 'H20', 'Forecast inputs are analyst scenarios. There are no assigned scenario probabilities.');
  section(sheet, 'C23:F23', 'Source register');
  sheet.getRange('C25:F25').values = [['ID', 'Publisher and publication date', 'Title', 'Evidence category']];
  value(sheet, 'H25', 'Use, limitations and full source URL');
  header(sheet, 'C25:F25'); header(sheet, 'H25');
  for (let i = 0; i < research.sources.length; i++) {
    const source = research.sources[i], row = 26 + i;
    sheet.getRange(`C${row}:F${row}`).values = [[source.id, `${source.publisher}\n${source.date}`, source.title, source.type]];
    const note = `${source.use} ${source.limit}\nURL: ${source.url}`;
    value(sheet, `H${row}`, note);
    sheet.getRange(`C${row}:H${row}`).format.rowHeight = Math.max(56, 14 * (Math.ceil(note.length / 90) + 1) + 8);
    sheet.getRange(`D${row}:F${row}`).format.wrapText = true;
    sheet.getRange(`H${row}`).format.wrapText = true;
    if (i % 2 === 1) { sheet.getRange(`C${row}:F${row}`).format.fill = '#F5F7F3'; sheet.getRange(`H${row}`).format.fill = '#F5F7F3'; }
  }
  sheet.freezePanes.freezeRows(6);
}

function buildSummary(wb, sheet, appUrl) {
  baseSheet(sheet, 'O', 51);
  sheet.tabColor = C.forest;
  const widths = { C: 37, D: 5, E: 17, F: 17, G: 4, H: 12, I: 12, J: 12, K: 12, L: 12, M: 12, N: 12, O: 3 };
  for (const [col, width] of Object.entries(widths)) sheet.getRange(`${col}1:${col}51`).format.columnWidth = width;
  value(sheet, 'C2', 'Frontier AI Valuation Lab');
  value(sheet, 'C3', 'Anthropic and OpenAI. Scenario enterprise value in USD billions.');
  linkedCase(sheet); value(sheet, 'H5', 'As of:');
  formula(sheet, 'I5', "='Assumptions'!I5"); sheet.getRange('I5').setNumberFormat(FMT.date);
  sheet.getRange('C9:F9').values = [['Operating valuation', null, 'Anthropic', 'OpenAI']];
  header(sheet, 'C9:F9');
  const metrics = [
    [10, 'Enterprise value', 'F32', FMT.money], [11, 'PV explicit cash flow, including stub', 'F30', FMT.money],
    [12, 'PV terminal value', 'F31', FMT.money], [13, 'Terminal value / enterprise value', 'F33', FMT.pct],
    [14, 'Peak cumulative FCFF deficit', 'F34', FMT.money], [15, '2036 revenue', 'N10', FMT.money],
    [16, '2036 FCFF', 'N18', FMT.money], [17, '2037 terminal FCFF', 'L34', FMT.money],
    [18, 'Revenue CAGR, 2026–2036', 'F36', FMT.pct], [19, 'Terminal FCFF change', 'L37', FMT.pct],
    [20, 'Active assumptions', 'E6', '@'],
  ];
  for (const [row, label, cell, format] of metrics) {
    value(sheet, `C${row}`, label);
    sheet.getRange(`E${row}:F${row}`).formulas = [[`='Anthropic'!${cell}`, `='OpenAI'!${cell}`]];
    sheet.getRange(`E${row}:F${row}`).setNumberFormat(format);
    if (format === FMT.pct) sheet.getRange(`C${row}:F${row}`).format.font.italic = true;
  }
  sheet.getRange('C10:F10').format = { fill: C.pale, font: { name: FONT, size: 14, bold: true, color: C.ink }, rowHeight: 30 };
  redWhen(sheet, 'E10:E20', '$E$20<>"Valid"'); redWhen(sheet, 'F10:F20', '$F$20<>"Valid"');
  section(sheet, 'C23:F23', 'Completed financing context');
  value(sheet, 'C25', 'Post-money equity valuation');
  sheet.getRange('E25:F25').formulas = [["='Sources'!E7", "='Sources'!E8"]];
  sheet.getRange('E25:F25').setNumberFormat(FMT.money);
  value(sheet, 'C26', 'Financing observation date');
  sheet.getRange('E26:F26').formulas = [["='Sources'!F7", "='Sources'!F8"]];
  sheet.getRange('E26:F26').setNumberFormat(FMT.date);
  value(sheet, 'C29', 'A matching current equity bridge is unavailable. Financing equity marks are not operating EV.');
  value(sheet, 'C30', 'Peak FCFF deficit excludes opening liquidity and intrayear cash needs.');
  value(sheet, 'C31', 'Choose one shared case and edit its blue values on Assumptions. Invalid inputs suppress outputs.');
  if (appUrl) value(sheet, 'C32', `Sensitivity and reverse DCF: ${appUrl}`);
  else value(sheet, 'C32', 'Sensitivity and reverse DCF: use the live app linked in the project README.');
  sheet.getRange('C32').format.font.color = C.green;
  value(sheet, 'C33', 'The advanced solver can return multiple growth solutions. This workbook does not approximate that solver.');
  section(sheet, 'C35:F35', 'Future free cash flow by year');
  sheet.getRange('C37:F37').values = [['Year', null, 'Anthropic', 'OpenAI']];
  header(sheet, 'C37:F37');
  for (let i = 0; i < 11; i++) {
    const row = 38 + i, col = String.fromCharCode(68 + i);
    value(sheet, `C${row}`, i === 0 ? '2026 stub' : String(2026 + i));
    sheet.getRange(`E${row}:F${row}`).formulas = [[`='Anthropic'!${col}18`, `='OpenAI'!${col}18`]];
  }
  sheet.getRange('E38:F48').setNumberFormat(FMT.money);
  const chart = sheet.charts.add('line', [sheet.getRange('C37:C48'), sheet.getRange('E37:E48'), sheet.getRange('F37:F48')]);
  chart.title = 'Future FCFF (USD billions)';
  chart.titleTextStyle.typeface = FONT; chart.titleTextStyle.fontSize = 13;
  chart.legend = { position: 'top', textStyle: { typeface: FONT, fontSize: 11 } };
  chart.xAxis = { axisType: 'textAxis', textStyle: { typeface: FONT, fontSize: 10 } };
  chart.yAxis = { numberFormatCode: '$#,##0;($#,##0);"-"', numberFormatSourceLinked: false,
    textStyle: { typeface: FONT, fontSize: 10 } };
  chart.series.items[0].fill = C.terra;
  chart.series.items[0].line = { fill: C.terra, style: 'solid', width: 2 };
  chart.series.items[1].fill = C.teal;
  chart.series.items[1].line = { fill: C.teal, style: 'solid', width: 2 };
  chart.setPosition('H9', 'O28');
}

export async function createWorkbook({ root, appUrl = '' }) {
  const presets = JSON.parse(await fs.readFile(path.join(root, 'data/presets.json'), 'utf8'));
  const research = JSON.parse(await fs.readFile(path.join(root, 'data/research.json'), 'utf8'));
  const wb = Workbook.create();
  const sheets = Object.fromEntries(['Summary', 'Assumptions', 'Anthropic', 'OpenAI', 'Sources'].map(name => [name, wb.worksheets.add(name)]));
  buildSources(wb, sheets.Sources, research);
  buildAssumptions(wb, sheets.Assumptions, presets, research);
  buildForecast(wb, sheets.Anthropic, 'Anthropic', research);
  buildForecast(wb, sheets.OpenAI, 'OpenAI', research);
  buildSummary(wb, sheets.Summary, appUrl);
  wb.recalculate();
  return { wb, sheets, presets, research, layout: LAYOUT };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
  const root = path.resolve(option('--root', process.cwd()));
  const output = path.resolve(option('--output', path.join(root, 'public/downloads/Frontier_AI_Valuation_Model.xlsx')));
  const qaDir = path.resolve(option('--qa', path.join(root, 'qa-local/workbook')));
  await fs.mkdir(path.dirname(output), { recursive: true }); await fs.mkdir(qaDir, { recursive: true });
  const context = await createWorkbook({ root, appUrl: option('--app-url', '') });
  console.log('Workbook authored; starting independent formula QA.');
  const report = await verifyWorkbook(context, { root, qaDir });
  console.log('Workbook formulas and input gates passed; rendering five sheets.');
  context.wb.recalculate();
  const views = [
    ['Summary', 'C2:O33', 'summary'], ['Summary', 'C35:F48', 'summary-cash-flow'],
    ['Assumptions', 'C2:J38', 'assumptions-growth'], ['Assumptions', 'C39:J77', 'assumptions-capital'],
    ['Assumptions', 'C80:J87', 'assumptions-basis'],
    ['Anthropic', 'C2:N38', 'anthropic-build'], ['Anthropic', 'C40:N58', 'anthropic-diagnostics'],
    ['OpenAI', 'C2:N38', 'openai-build'], ['OpenAI', 'C40:N57', 'openai-diagnostics'],
    ['Sources', 'C2:H20', 'source-inputs'], ['Sources', 'C23:H35', 'source-register-1'],
    ['Sources', 'C36:H45', 'source-register-2'],
  ];
  for (const [sheetName, range, filename] of views) {
    const preview = await context.wb.render({ sheetName, range, scale: 1.4, format: 'png' });
    await fs.writeFile(path.join(qaDir, `${filename}.png`), new Uint8Array(await preview.arrayBuffer()));
  }
  const inspection = await context.wb.inspect({ kind: 'table', range: 'Summary!C9:F20', include: 'values,formulas', tableMaxRows: 15, tableMaxCols: 4, maxChars: 12000 });
  await fs.writeFile(path.join(qaDir, 'summary-inspection.ndjson'), inspection.ndjson);
  const scan = await context.wb.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',
    options: { useRegex: true, maxResults: 300 }, summary: 'Final formula error scan' });
  await fs.writeFile(path.join(qaDir, 'formula-error-scan.ndjson'), scan.ndjson);
  const file = await SpreadsheetFile.exportXlsx(context.wb); await file.save(output);
  try { await fs.rename(`${output}.inspect.ndjson`, path.join(qaDir, 'export-inspection.ndjson')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const reopened = await SpreadsheetFile.importXlsx(await FileBlob.load(output));
  reopened.recalculate();
  const reimported = Object.fromEntries(COMPANIES.map(company => [company, reopened.worksheets.getItem(company).getRange('F32').values[0][0]]));
  for (const company of COMPANIES) {
    const expected = report.presetResults[`${company}/Base`].ev;
    if (typeof reimported[company] !== 'number' || Math.abs(reimported[company] - expected) > Math.max(1e-7, Math.abs(expected) * 1e-10)) throw new Error(`XLSX reopen mismatch: ${company}`);
  }
  await fs.writeFile(path.join(qaDir, 'verification.json'), JSON.stringify({ ...report, exported: output, reopenedEV: reimported,
    renderer: 'Artifact Tool', nativeExcelVerified: false, renderViews: views.map(v => v[2]) }, null, 2) + '\n');
  console.log(JSON.stringify({ output, status: 'verified', scenarios: 6, invalidInputCases: report.invalidInputCases,
    reopenedEV: reimported, qaDir }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
