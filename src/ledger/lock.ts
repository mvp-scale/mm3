/**
 * A cross-process lock file (O_EXCL create). Held only around read-count-append, so many agents appending at
 * once get unique, ordered ids. The lock file's body is the owner's pid.
 * Breaking a stale lock: a lock whose recorded pid is not alive is stale once it is 2 s old (the grace keeps a
 * pid from another pid namespace, which reads as dead, from being stolen); a live pid is never stale; a file
 * with no parseable pid (not yet written) falls back to the age-only rule (older than staleMs). Breaking is
 * serialized by lock.break: the breaker re-reads the lock under it, so it can never remove a lock another run
 * has just taken. An orphaned lock.break (older than 2 s; a breaker holds it for microseconds) is removed.
 * A lock that is not a regular readable file (a folder) stops at once: waiting would never end.
 * A timeout throws LockError, which verbs catch; it lives here so ledger and budget can share it without a cycle.
 * So does StoreError: a filesystem failure under .mm3/ (not writable, a folder where a file should be),
 * turned into one clean line instead of a raw errno and a machine path.
 */
import { closeSync, fstatSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeSync, type Stats } from 'node:fs';
import path from 'node:path';

export class LockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LockError';
  }
}

export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreError';
  }
}

// Everything we write lives at <project>/.mm3/<name>, so its last two segments are its project-relative path.
const shownStore = (file: string): string => `${path.basename(path.dirname(file))}/${path.basename(file)}`;

/** An errno failure on a .mm3/ file as a StoreError; anything else is passed through untouched. */
export function storeError(e: unknown, file: string, action: 'read' | 'write'): unknown {
  const code = (e as NodeJS.ErrnoException | undefined)?.code;
  if (typeof code !== 'string') return e;
  return new StoreError(`✖ files: cannot ${action} ${shownStore(file)} (${code}) → make .mm3/ a writable folder, with log.jsonl and budget.json as files`);
}

/** A folder where a ledger file should be: POSIX fails the read with EISDIR on its own, Windows opens/stats it fine and reports size 0, so every path that sizes or opens the log says it the same way. */
export const folderInPlaceOfFile = (): NodeJS.ErrnoException => Object.assign(new Error('EISDIR: illegal operation on a directory, read'), { code: 'EISDIR' });

/** The log's stat, or undefined when there is no log yet. A folder is an EISDIR error (explicit check, not left to the platform). */
export function statLog(file: string): Stats | undefined {
  let st: Stats;
  try {
    st = statSync(file);
  } catch (e) {
    if (isAbsent(e)) return undefined;
    throw e;
  }
  if (st.isDirectory()) throw folderInPlaceOfFile();
  return st;
}

/** Runs fn, rethrowing an errno failure as a StoreError that names the file. */
export function onStore<T>(file: string, action: 'read' | 'write', fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    throw storeError(e, file, action);
  }
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // ESRCH: no such process → dead. EPERM (or anything else): a process is there but we can't signal it → alive.
    return (e as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

const DEAD_PID_GRACE_MS = 2000;
const ORPHAN_BREAK_MS = 2000;

const errno = (e: unknown): string | undefined => (e as NodeJS.ErrnoException | undefined)?.code;

/** True when a failed read means "no such file" (missing, or a parent that is not a folder): the one failure callers treat as an empty answer. */
export const isAbsent = (e: unknown): boolean => errno(e) === 'ENOENT' || errno(e) === 'ENOTDIR';
/** Windows reports a lock another run is deleting or still opening (delete-pending, sharing violation) as EPERM/EBUSY/EACCES, where POSIX says EEXIST or ENOENT: contention, not a failure. */
const winBusy = (e: unknown): boolean => process.platform === 'win32' && ['EPERM', 'EBUSY', 'EACCES'].includes(errno(e) ?? '');
const notALock = (lockPath: string): StoreError => new StoreError(`✖ files: ${shownStore(lockPath)} is not a lock file → remove it`);

function isFolder(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** The lock's pid text and age, or undefined when it is gone. Anything but a readable regular file is a StoreError. */
function readLock(lockPath: string): { body: string; ageMs: number } | undefined {
  let fd: number | undefined;
  try {
    fd = openSync(lockPath, 'r'); // open once, then look at that same file: no check-then-use gap
    const st = fstatSync(fd);
    if (!st.isFile()) throw notALock(lockPath);
    return { body: readFileSync(fd, 'utf8'), ageMs: Date.now() - st.mtimeMs };
  } catch (e) {
    if (e instanceof StoreError) throw e;
    if (errno(e) === 'ENOENT') return undefined;
    if (winBusy(e) && !isFolder(lockPath)) return { body: '', ageMs: 0 }; // being deleted or written right now: not stale, wait
    throw notALock(lockPath);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function isStale(lock: { body: string; ageMs: number }, staleMs: number): boolean {
  const pid = Number.parseInt(lock.body.trim(), 10);
  if (Number.isInteger(pid) && pid > 0) return lock.ageMs >= DEAD_PID_GRACE_MS && !isAlive(pid);
  return lock.ageMs > staleMs; // no parseable pid: age-only rule
}

/**
 * Removes the lock if it is stale, deciding under lock.break. True when the lock is gone (removed, or already
 * released), so the caller retries the create at once; false when it must wait.
 */
function tryBreak(lockPath: string, staleMs: number): boolean {
  const breakPath = `${lockPath}.break`;
  const first = readLock(lockPath);
  if (!first) return true;
  if (!isStale(first, staleMs)) return false;
  try {
    closeSync(openSync(breakPath, 'wx'));
  } catch (e) {
    if (errno(e) !== 'EEXIST') {
      if (winBusy(e)) return false; // another breaker is deleting its lock.break right now
      throw storeError(e, breakPath, 'write');
    }
    try {
      if (Date.now() - statSync(breakPath).mtimeMs > ORPHAN_BREAK_MS) unlinkSync(breakPath); // a breaker died mid-break
    } catch {
      /* gone already */
    }
    return false;
  }
  try {
    const now = readLock(lockPath); // re-read under lock.break: it may have been replaced since
    if (!now) return true;
    if (!isStale(now, staleMs)) return false;
    try {
      unlinkSync(lockPath);
    } catch (e) {
      if (winBusy(e)) return false; // the owner is releasing it right now: let the caller retry
      if (errno(e) !== 'ENOENT') throw storeError(e, lockPath, 'write');
    }
    return true;
  } finally {
    try {
      unlinkSync(breakPath);
    } catch {
      /* already removed */
    }
  }
}

export function withLock<T>(lockPath: string, fn: () => T, opts: { timeoutMs?: number; staleMs?: number } = {}): T {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const staleMs = opts.staleMs ?? 30_000;
  onStore(lockPath, 'write', () => mkdirSync(path.dirname(lockPath), { recursive: true }));
  const start = Date.now();
  for (;;) {
    try {
      const fd = openSync(lockPath, 'wx');
      try {
        writeSync(fd, `${process.pid}\n`);
        closeSync(fd);
      } catch (e) {
        // Created but not written (disk full): remove it, or it would block every run until it ages out.
        try {
          closeSync(fd);
        } catch {
          /* already closed */
        }
        unlinkSync(lockPath);
        throw storeError(e, lockPath, 'write');
      }
      break;
    } catch (e) {
      if (e instanceof StoreError) throw e;
      const contended = errno(e) === 'EEXIST' || winBusy(e); // a folder at the lock path is caught by readLock inside tryBreak
      if (!contended) throw storeError(e, lockPath, 'write');
      if (tryBreak(lockPath, staleMs)) continue;
      if (Date.now() - start > timeoutMs) {
        throw new LockError(`✖ lock: ${shownStore(lockPath)} is locked → wait for the other run, or delete the lock file if no run is active`);
      }
      sleepSync(25);
    }
  }
  try {
    return fn();
  } finally {
    releaseLock(lockPath);
  }
}

/** Removes our lock file. On Windows a rival reading it at that instant makes the delete fail with EPERM/EBUSY: retry briefly, or the lock would stay until it ages out. */
function releaseLock(lockPath: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      unlinkSync(lockPath);
      return;
    } catch (e) {
      if (!winBusy(e) || attempt >= 40) return; // already removed (or, after ~1 s, left for the stale rule)
      sleepSync(25);
    }
  }
}
