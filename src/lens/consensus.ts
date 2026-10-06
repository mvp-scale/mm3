/**
 * Consensus over the yes/no slots only (primitives are never averaged in). Each slot becomes a concern
 * probability (reverse-keyed slots flip), then:
 *   WEAK   answers sit near the middle (mean |2c − 1| below weakBelow)
 *   STRONG most slots point the same way (agreement ≥ strongAt) and reversed slots agree with forward ones
 *   SPLIT  otherwise
 * Thresholds are starting values; outcomes in the ledger tune them later.
 */
import { DEFAULT_CONFIG } from '../config/defaults.ts';

export const THRESHOLDS: Readonly<typeof DEFAULT_CONFIG.lens> = DEFAULT_CONFIG.lens;

export type Consensus = 'STRONG' | 'SPLIT' | 'WEAK';

export interface SlotAnswer {
  pos: number;
  reverse: boolean;
  /** Probability of "yes". */
  p: number;
}

export interface ConsensusResult {
  consensus: Consensus;
  verdict: 'concern' | 'clear';
  agreement: number;
  decisiveness: number;
  concernSlots: number[];
  clearSlots: number[];
  reversed: number[];
  reverseConsistent: boolean;
}

const majority = (flags: readonly boolean[]): boolean => flags.filter(Boolean).length * 2 >= flags.length;

export function computeConsensus(slots: readonly SlotAnswer[], thresholds: Readonly<typeof DEFAULT_CONFIG.lens> = THRESHOLDS): ConsensusResult {
  if (!slots.length) throw new RangeError('consensus needs at least one slot');
  const concern = slots.map((s) => (s.reverse ? 1 - s.p : s.p));
  const flags = concern.map((c) => c >= thresholds.concernAt);
  const frac = flags.filter(Boolean).length / slots.length;
  const agreement = Math.max(frac, 1 - frac);
  const decisiveness = concern.reduce((sum, c) => sum + Math.abs(2 * c - 1), 0) / slots.length;
  const forward = flags.filter((_, i) => !slots[i]!.reverse);
  const reverse = flags.filter((_, i) => slots[i]!.reverse);
  const reverseConsistent = !forward.length || !reverse.length || majority(forward) === majority(reverse);
  const consensus: Consensus =
    decisiveness < thresholds.weakBelow ? 'WEAK' : agreement >= thresholds.strongAt && reverseConsistent ? 'STRONG' : 'SPLIT';
  return {
    consensus,
    verdict: frac >= 0.5 ? 'concern' : 'clear',
    agreement,
    decisiveness,
    concernSlots: slots.filter((_, i) => flags[i]).map((s) => s.pos),
    clearSlots: slots.filter((_, i) => !flags[i]).map((s) => s.pos),
    reversed: slots.filter((s) => s.reverse).map((s) => s.pos),
    reverseConsistent,
  };
}
