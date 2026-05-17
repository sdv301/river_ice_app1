/**
 * Цвет и статус населённого пункта / поста — только от уровня воды
 * относительно критической отметки (ОЯ / НЯ), без ледохода и заторов.
 *
 * ratio >= 0.7 → ОЯ (danger)
 * ratio >= 0.5 → НЯ (warning)
 * иначе       → норма
 */
export type WaterRiskLevel = 'normal' | 'warning' | 'danger';

export function waterRiskLevelFromLevels(
  currentLevel: number | null,
  criticalLevel: number | null | undefined,
): WaterRiskLevel {
  if (
    currentLevel === null ||
    criticalLevel === null ||
    criticalLevel === undefined ||
    !Number.isFinite(criticalLevel) ||
    criticalLevel <= 0 ||
    !Number.isFinite(currentLevel)
  ) {
    return 'normal';
  }
  const ratio = currentLevel / criticalLevel;
  if (ratio >= 0.7) return 'danger';
  if (ratio >= 0.5) return 'warning';
  return 'normal';
}

/** 0 = норма, 2 = НЯ, 3 = ОЯ — для существующей шкалы MapEditor. */
export function waterRiskScoreFromLevels(
  currentLevel: number | null,
  criticalLevel: number | null | undefined,
): number {
  const level = waterRiskLevelFromLevels(currentLevel, criticalLevel);
  if (level === 'danger') return 3;
  if (level === 'warning') return 2;
  return 0;
}
