/**
 * Sort API slots for the Alexandria grid: row A–D, column 1–6 (slot_no like A1, B2).
 * Falls back to string order for other formats (e.g. A-101).
 */
export function sortSlotsForAlexandriaGrid(slots) {
  if (!Array.isArray(slots)) return [];
  return [...slots].sort((a, b) => {
    const na = String(a.slot_no ?? '');
    const nb = String(b.slot_no ?? '');
    const mA = na.match(/^([A-Za-z])(\d+)$/);
    const mB = nb.match(/^([A-Za-z])(\d+)$/);
    if (mA && mB) {
      const rowCmp = mA[1].toUpperCase().localeCompare(mB[1].toUpperCase());
      if (rowCmp !== 0) return rowCmp;
      return parseInt(mA[2], 10) - parseInt(mB[2], 10);
    }
    return na.localeCompare(nb, undefined, { numeric: true });
  });
}
