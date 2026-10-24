/**
 * Login admission control (single process; state is in memory and resets on restart).
 *
 * `tryAdmit` is SYNCHRONOUS: it checks both budgets (per account key and per address) and, if both
 * have room, reserves a slot in each before returning. Because Node runs it to completion without
 * yielding, a burst of simultaneous requests cannot over-admit: the check and the reservation are
 * one atomic step, and they happen before the handler's first `await`.
 *
 * Slot accounting for an admitted attempt (see AttemptTicket):
 *  - password verified successfully  -> `succeed()`: both slots refunded and the account history cleared
 *  - password wrong                  -> slot stays consumed until the window passes (default outcome)
 *  - error AFTER verification began  -> slot stays consumed (it may have been a guess)
 *  - error BEFORE verification began -> `release()`: both slots refunded (no guess was evaluated)
 *  - client disconnect               -> the handler still runs to completion and settles as above
 *  - never settled explicitly        -> treated as a failure (slot stays consumed)
 * A window slides from each slot's admission time. In-flight attempts hold a slot, so concurrency
 * counts against the budget immediately.
 */
interface Slot {
  at: number;
}

export interface AttemptLimits {
  accountMax: number;
  ipMax: number;
  windowMs: number;
}

export const DEFAULT_ATTEMPT_LIMITS: AttemptLimits = {
  accountMax: 5,
  ipMax: 20,
  windowMs: 15 * 60 * 1000,
};

export class AttemptTicket {
  private settled = false;

  constructor(
    private readonly limiter: AttemptLimiter,
    private readonly accountKey: string,
    private readonly ip: string,
    private readonly accountSlot: Slot,
    private readonly ipSlot: Slot,
  ) {}

  /** Refund both slots: no password guess was evaluated. */
  release(): void {
    if (this.settled) return;
    this.settled = true;
    this.limiter.remove("account", this.accountKey, this.accountSlot);
    this.limiter.remove("ip", this.ip, this.ipSlot);
  }

  /** Correct credentials: refund the address slot and clear this account's history. */
  succeed(): void {
    if (this.settled) return;
    this.settled = true;
    this.limiter.remove("ip", this.ip, this.ipSlot);
    this.limiter.clear("account", this.accountKey);
  }

  /** Explicitly keep the slot consumed (the default if nothing else is called). */
  fail(): void {
    this.settled = true;
  }
}

export type Admission =
  { ok: true; ticket: AttemptTicket } | { ok: false; retryAfterSeconds: number };

export class AttemptLimiter {
  private readonly account = new Map<string, Slot[]>();
  private readonly ip = new Map<string, Slot[]>();

  constructor(
    private readonly limits: AttemptLimits = DEFAULT_ATTEMPT_LIMITS,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 10_000,
  ) {}

  private map(kind: "account" | "ip"): Map<string, Slot[]> {
    return kind === "account" ? this.account : this.ip;
  }

  private live(kind: "account" | "ip", key: string): Slot[] {
    const m = this.map(kind);
    const cutoff = this.now() - this.limits.windowMs;
    const kept = (m.get(key) ?? []).filter((s) => s.at > cutoff);
    if (kept.length) m.set(key, kept);
    else m.delete(key);
    return kept;
  }

  private waitSeconds(slots: Slot[], max: number): number {
    if (slots.length < max) return 0;
    const oldestCounted = slots[slots.length - max] as Slot;
    return Math.max(1, Math.ceil((oldestCounted.at + this.limits.windowMs - this.now()) / 1000));
  }

  /** Atomically reserves one slot in BOTH budgets, or reports how long until both have room. */
  tryAdmit(accountKey: string, ip: string): Admission {
    const accountSlots = this.live("account", accountKey);
    const ipSlots = this.live("ip", ip);
    const wait = Math.max(
      this.waitSeconds(accountSlots, this.limits.accountMax),
      this.waitSeconds(ipSlots, this.limits.ipMax),
    );
    if (wait > 0) return { ok: false, retryAfterSeconds: wait };

    const at = this.now();
    const accountSlot: Slot = { at };
    const ipSlot: Slot = { at };
    accountSlots.push(accountSlot);
    ipSlots.push(ipSlot);
    this.account.set(accountKey, accountSlots);
    this.ip.set(ip, ipSlots);
    this.bound(this.account);
    this.bound(this.ip);
    return { ok: true, ticket: new AttemptTicket(this, accountKey, ip, accountSlot, ipSlot) };
  }

  /** @internal used by AttemptTicket */
  remove(kind: "account" | "ip", key: string, slot: Slot): void {
    const m = this.map(kind);
    const rest = (m.get(key) ?? []).filter((s) => s !== slot);
    if (rest.length) m.set(key, rest);
    else m.delete(key);
  }

  /** @internal used by AttemptTicket */
  clear(kind: "account" | "ip", key: string): void {
    this.map(kind).delete(key);
  }

  private bound(m: Map<string, Slot[]>): void {
    if (m.size > this.maxKeys) {
      const first = m.keys().next().value;
      if (first !== undefined) m.delete(first);
    }
  }
}
