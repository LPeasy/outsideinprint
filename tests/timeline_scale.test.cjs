const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { compileFunction } = require('node:vm');
const source = readFileSync(require('node:path').join(__dirname, '../assets/js/timeline-scale.js'), 'utf8');
const helpers = { exports: {} };
compileFunction(source, ['module'])(helpers);
const { parseDates, decimalDate, positionAt } = helpers.exports;
test('date precision, leap years and ranges retain calendar precision', () => {
  assert.deepEqual(parseDates('1784'), [1784]);
  assert.deepEqual(parseDates('1895–1907'), [1895, 1907]);
  assert.deepEqual(parseDates('2022 / 2026'), [2022, 2026]);
  assert.deepEqual(parseDates('February–March 2025'), [2025 + 31/365, 2025 + 59/365]);
  assert.deepEqual(parseDates('June 14, 2024'), [2024 + 165/366]);
  assert.deepEqual(parseDates('Nov. 11, 1918'), [1918 + 314/365]);
  assert.deepEqual(parseDates('February 30, 2024'), []);
  assert.deepEqual(parseDates('Undated'), []);
  assert.equal(decimalDate(2024, 1, 29), 2024 + 59/366);
});
test('years interpolate within original entry gaps without moving labels', () => {
  const points = [{date:1949,y:10},{date:1952,y:210},{date:1969,y:410}];
  assert.equal(positionAt(1949,points),10);
  assert.equal(positionAt(1952,points),210);
  assert.equal(positionAt(1969,points),410);
  assert.equal(positionAt(1950.5,points),110);
  assert.ok(Math.abs(positionAt(1960,points)-(210+8/17*200))<1e-8);
  assert.equal(positionAt(1900,points),10);
  assert.equal(positionAt(2000,points),410);
});
