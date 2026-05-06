export const ALEX_ROWS = ['A', 'B', 'C', 'D'];
export const ALEX_COLS = [1, 2, 3, 4, 5, 6];

export function orderedSlotNos() {
  const out = [];
  for (const r of ALEX_ROWS) {
    for (const c of ALEX_COLS) out.push(`${r}${c}`);
  }
  return out;
}

export function slotStateLabel(state) {
  const s = Number(state);
  if (s === 0) return 'Available';
  if (s === 2) return 'Reserved';
  return 'Occupied';
}

