import { describe, expect, it } from 'vitest';

import { computeSlotCellKeys } from '../slotLocking.js';

function sharesAnyCell(a: string[], b: string[]): boolean {
  const setA = new Set(a);
  return b.some((key) => setA.has(key));
}

describe('computeSlotCellKeys', () => {
  it('throws if end is not after start', () => {
    const t = new Date('2026-06-15T09:00:00.000Z');
    expect(() => computeSlotCellKeys(t, t)).toThrow();
    expect(() => computeSlotCellKeys(t, new Date(t.getTime() - 1000))).toThrow();
  });

  it('produces the expected number of cells for an exact multiple of the cell size', () => {
    const start = new Date('2026-06-15T09:00:00.000Z');
    const end = new Date('2026-06-15T10:00:00.000Z'); // 60 minutes
    const keys = computeSlotCellKeys(start, end, 15);
    expect(keys).toHaveLength(4); // 09:00,09:15,09:30,09:45 cells
  });

  it('rounds up a partial trailing cell (touches it even if only 1ms into it)', () => {
    const start = new Date('2026-06-15T09:00:00.000Z');
    const end = new Date('2026-06-15T09:16:00.000Z'); // 16 minutes, into the 2nd 15-min cell
    const keys = computeSlotCellKeys(start, end, 15);
    expect(keys).toHaveLength(2);
  });

  it('does not claim a cell it only touches at the exact boundary (exclusive end)', () => {
    const start = new Date('2026-06-15T09:00:00.000Z');
    const end = new Date('2026-06-15T09:15:00.000Z'); // exactly one cell width
    const keys = computeSlotCellKeys(start, end, 15);
    expect(keys).toHaveLength(1);
  });

  it('CORE PROPERTY: two overlapping intervals always share at least one cell', () => {
    const a = computeSlotCellKeys(
      new Date('2026-06-15T09:00:00.000Z'),
      new Date('2026-06-15T10:00:00.000Z'),
      15,
    );
    const b = computeSlotCellKeys(
      new Date('2026-06-15T09:45:00.000Z'), // overlaps the last 15 min of `a`
      new Date('2026-06-15T10:30:00.000Z'),
      15,
    );
    expect(sharesAnyCell(a, b)).toBe(true);
  });

  it('CORE PROPERTY: overlap of just 1 minute still shares a cell', () => {
    const a = computeSlotCellKeys(
      new Date('2026-06-15T09:00:00.000Z'),
      new Date('2026-06-15T10:00:00.000Z'),
      15,
    );
    const b = computeSlotCellKeys(
      new Date('2026-06-15T09:59:00.000Z'),
      new Date('2026-06-15T11:00:00.000Z'),
      15,
    );
    expect(sharesAnyCell(a, b)).toBe(true);
  });

  it('CORE PROPERTY: touching (not overlapping) intervals share NO cell', () => {
    const a = computeSlotCellKeys(
      new Date('2026-06-15T09:00:00.000Z'),
      new Date('2026-06-15T10:00:00.000Z'),
      15,
    );
    const b = computeSlotCellKeys(
      new Date('2026-06-15T10:00:00.000Z'), // starts exactly when `a` ends
      new Date('2026-06-15T11:00:00.000Z'),
      15,
    );
    expect(sharesAnyCell(a, b)).toBe(false);
  });

  it('CORE PROPERTY: a booking fully contained inside another shares a cell', () => {
    const outer = computeSlotCellKeys(
      new Date('2026-06-15T09:00:00.000Z'),
      new Date('2026-06-15T12:00:00.000Z'),
      15,
    );
    const inner = computeSlotCellKeys(
      new Date('2026-06-15T10:00:00.000Z'),
      new Date('2026-06-15T10:15:00.000Z'),
      15,
    );
    expect(sharesAnyCell(outer, inner)).toBe(true);
  });

  it('produces consistent, deterministic keys for the same input', () => {
    const start = new Date('2026-06-15T09:00:00.000Z');
    const end = new Date('2026-06-15T10:00:00.000Z');
    expect(computeSlotCellKeys(start, end, 15)).toEqual(computeSlotCellKeys(start, end, 15));
  });
});
