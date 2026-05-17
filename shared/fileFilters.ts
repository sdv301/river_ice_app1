/** Classify Yandex/internal-data files for ice vs water-level processing. */

/** Operational hydro bulletin (levels + phenomena), not ice edge geometry. */
export function isHydrologyBulletinFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.includes('гидролог') && (lower.includes('сведен') || lower.includes('карт'));
}

export function isIceFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (!/\.(xlsx|xls|csv)$/.test(lower)) return false;
  if (lower.includes('инструк') || lower.includes('шаблон')) return false;
  if (isHydrologyBulletinFile(fileName)) return false;
  if (lower.includes('уровн') && !lower.includes('карт')) return false;
  if (lower.includes('гидролог') && lower.includes('уровн')) return false;
  return (
    lower.includes('карт') ||
    lower.includes('кромк') ||
    lower.includes('ледоход') ||
    lower.includes('ледов') ||
    lower.includes('ice') ||
    lower.includes('сведени') && lower.includes('лена')
  );
}

export function isWaterFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (!/\.(xlsx|xls|csv)$/.test(lower)) return false;
  if (lower.includes('инструк') || lower.includes('шаблон')) return false;
  if (isHydrologyBulletinFile(fileName)) return true;
  if (isIceFile(fileName) && !lower.includes('уровн')) return false;
  return (
    lower.includes('уровн') ||
    lower.includes('гидролог') ||
    lower.includes('water') ||
    lower.includes('level')
  );
}
