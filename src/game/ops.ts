import type { GateOp } from './types';

/** Apply a gate operator to the crowd count. Count stays a non-negative integer. */
export function applyOp(count: number, op: GateOp): number {
  'worklet';
  switch (op.kind) {
    case 'add':
      return count + op.value;
    case 'sub':
      return Math.max(0, count - op.value);
    case 'mul':
      return Math.floor(count * op.value);
    case 'div':
      // Division rounds up and never wipes the crowd on its own.
      return Math.max(1, Math.ceil(count / op.value));
  }
}

export function opLabel(op: GateOp): string {
  'worklet';
  switch (op.kind) {
    case 'add':
      return `+${op.value}`;
    case 'sub':
      return `-${op.value}`;
    case 'mul':
      return `x${op.value}`;
    case 'div':
      return `÷${op.value}`;
  }
}

/** Good gates (teal) grow the crowd; bad gates (red) shrink it. */
export function isGoodOp(op: GateOp): boolean {
  'worklet';
  return op.kind === 'add' || op.kind === 'mul';
}
