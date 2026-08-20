/**
 * Cells are a fixed partition of the timeline into `cellMinutes`-wide
 * buckets, indexed from the Unix epoch. Two time intervals that overlap
 * ALWAYS share at least one cell in common, as long as every cell an
 * interval even partially touches is included (not just the cell
 * containing its start) — that's the property this function guarantees,
 * and it's what makes the SlotLock unique-index mechanism a correct
 * double-booking guard regardless of exact start-time alignment. See
 * slotLock.model.ts for the full explanation.
 */
const DEFAULT_CELL_MINUTES = 15;

export function computeSlotCellKeys(
  start: Date,
  end: Date,
  cellMinutes: number = DEFAULT_CELL_MINUTES,
): string[] {
  if (end.getTime() <= start.getTime()) {
    throw new RangeError('computeSlotCellKeys: end must be after start.');
  }

  const cellMs = cellMinutes * 60_000;
  const startCell = Math.floor(start.getTime() / cellMs);
  // `end` is exclusive — subtract 1ms so an interval ending exactly on a
  // cell boundary doesn't claim the next cell it never actually touches.
  const endCell = Math.floor((end.getTime() - 1) / cellMs);

  const keys: string[] = [];
  for (let cell = startCell; cell <= endCell; cell += 1) {
    keys.push(String(cell));
  }
  return keys;
}
