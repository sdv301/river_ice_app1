export function generateWaterLevelHistory(settlementName: string, currentDateStr: string, days: number = 7) {
    const history = [];
    const baseSeed = settlementName.length * 10;
    const currentDate = new Date(currentDateStr);
    
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(currentDate);
        d.setDate(d.getDate() - i);
        const hash = baseSeed + d.getDate();
        const level = 250 + (hash * 7 % 300);
        history.push({
            date: d.toISOString(),
            level: level
        });
    }
    return history;
}
