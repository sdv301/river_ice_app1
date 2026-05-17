/**
 * Проверка порогов ОЯ/НЯ по уровню воды.
 * npx tsx scripts/verify-water-risk.ts
 */
import assert from 'node:assert/strict';
import {
  waterRiskLevelFromLevels,
  waterRiskScoreFromLevels,
} from '../src/utils/waterLevelRisk.ts';

const critical = 1000;

assert.equal(waterRiskLevelFromLevels(400, critical), 'normal');
assert.equal(waterRiskScoreFromLevels(400, critical), 0);

assert.equal(waterRiskLevelFromLevels(500, critical), 'warning');
assert.equal(waterRiskScoreFromLevels(500, critical), 2);

assert.equal(waterRiskLevelFromLevels(700, critical), 'danger');
assert.equal(waterRiskScoreFromLevels(700, critical), 3);

assert.equal(waterRiskLevelFromLevels(1100, critical), 'danger');
assert.equal(waterRiskLevelFromLevels(null, critical), 'normal');
assert.equal(waterRiskLevelFromLevels(500, null), 'normal');

console.log('verify-water-risk: все пороги ОЯ/НЯ сходятся (только уровень / критическая отметка).');
