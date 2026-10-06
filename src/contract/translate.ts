/**
 * From a validated request to what the classifier is asked (contract "How it becomes TypeSafe calls"):
 * question ids ("goal", "1".."N", "<item id>#<n>"), the filled-in text, the state each call reads, and the
 * answer key that makes an answer reusable (the same question on the same evidence). Ids are map keys the
 * model never sees, so they stay as written; everything sent is redacted.
 */
import { createHash } from 'node:crypto';
import type { ClassifierQuestion } from '../classifier/port.ts';
import { DEFAULT_CONFIG } from '../config/defaults.ts';
import { redact } from '../ledger/redact.ts';
import { fillBlanks, type Item } from './layers.ts';
import type { Category, Question } from './types.ts';

export interface AskedQuestion {
  id: string;
  /** null for the goal. */
  n: number | null;
  kind: Question['kind'];
  /** Filled in, not yet redacted. */
  text: string;
  item?: string;
  levels?: string[];
  options?: string[];
}

function asked(q: Question, id: string, text: string, item?: string): AskedQuestion {
  return {
    id,
    n: q.n,
    kind: q.kind,
    text,
    ...(item !== undefined ? { item } : {}),
    ...(q.kind === 'scale' ? { levels: q.levels } : {}),
    ...(q.kind === 'choice' ? { options: q.options } : {}),
  };
}

const byNumber = (categories: readonly Category[]): Question[] => categories.flatMap((c) => c.questions).sort((a, b) => a.n - b.n);

export const goalQuestion = (goal: string): AskedQuestion => ({ id: 'goal', n: null, kind: 'yesno', text: goal });

/** One subject: "1".."N" (with a prefix for replay's two states). */
export function subjectQuestions(categories: readonly Category[], prefix = ''): AskedQuestion[] {
  return byNumber(categories).map((q) => asked(q, `${prefix}${q.n}`, q.text));
}

/** A sweep item: "<item id>#<n>", its {blanks} filled from the item. */
export function itemQuestions(item: Item, categories: readonly Category[]): AskedQuestion[] {
  return byNumber(categories).map((q) => asked(q, `${item.id}#${q.n}`, fillBlanks(q.text, item.fill), item.id));
}

export function toClassifierQuestion(q: AskedQuestion): ClassifierQuestion {
  const ask = redact(q.text);
  const item = q.item === undefined ? {} : { item: redact(q.item) };
  if (q.kind === 'yesno') return { type: 'noul', id: q.id, ask, ...item };
  if (q.kind === 'scale') return { type: 'score', id: q.id, ask, levels: q.levels ?? [], ...item };
  return { type: 'choice', id: q.id, ask, options: Object.fromEntries((q.options ?? []).map((o) => [o, o])), ...item };
}

/** Same question, same evidence → same key (32 hex chars). */
export function answerKey(evidence: string, q: AskedQuestion): string {
  return createHash('sha256')
    .update(JSON.stringify([evidence, q.kind, q.text, q.levels ?? q.options ?? null]))
    .digest('hex')
    .slice(0, 32);
}

/** The evidence of a one-subject run: its code files, in path order. */
export function subjectEvidence(files: Record<string, string>): string {
  return JSON.stringify(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

export const ITEM_LIMITS: Readonly<typeof DEFAULT_CONFIG.evidence> = DEFAULT_CONFIG.evidence;

/** state.items for one call: item id → redacted text, capped per item and in total, with a note for each cut. */
export function itemsState(items: readonly Item[], notes: string[], limits: Pick<typeof ITEM_LIMITS, 'perItemChars' | 'totalChars'> = ITEM_LIMITS): Record<string, string> {
  const out: Record<string, string> = {};
  let total = 0;
  for (const it of items) {
    const id = redact(it.id);
    let text = redact(it.text);
    if (text.length > limits.perItemChars) {
      text = text.slice(0, limits.perItemChars);
      notes.push(`${id} truncated to ${limits.perItemChars} chars`);
    }
    const room = limits.totalChars - total;
    if (room <= 0) {
      out[id] = '';
      notes.push(`${id} not shown: evidence limit reached`);
      continue;
    }
    if (text.length > room) {
      text = text.slice(0, room);
      notes.push(`${id} truncated: evidence limit reached`);
    }
    total += text.length;
    out[id] = text;
  }
  return out;
}
