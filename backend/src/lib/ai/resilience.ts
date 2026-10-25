export class TimeoutError extends Error {
  constructor() {
    super("timed out");
    this.name = "TimeoutError";
  }
}

export class CircuitOpenError extends Error {
  constructor() {
    super("circuit open");
    this.name = "CircuitOpenError";
  }
}

/**
 * Runs `fn` with an abort signal that fires after `ms` or when `parent` aborts. Rejects at the
 * deadline even if `fn` ignores the signal.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
  parent?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onAbort = () => controller.abort(parent?.reason);
  if (parent?.aborted) throw new TimeoutError();
  parent?.addEventListener("abort", onAbort, { once: true });
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(new TimeoutError());
      reject(new TimeoutError());
    }, ms);
    controller.signal.addEventListener("abort", () => reject(new TimeoutError()), { once: true });
  });
  try {
    return await Promise.race([fn(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", onAbort);
  }
}

/** Bounded concurrency within one process. Waiters give up when their signal aborts. */
export class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly max: number) {}

  get inFlight(): number {
    return this.active;
  }

  async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal);
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(signal?: AbortSignal): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const grant = () => {
        signal?.removeEventListener("abort", cancel);
        this.active++;
        resolve();
      };
      const cancel = () => {
        const i = this.waiters.indexOf(grant);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(new TimeoutError());
      };
      if (signal?.aborted) return cancel();
      signal?.addEventListener("abort", cancel, { once: true });
      this.waiters.push(grant);
    });
  }

  private release(): void {
    this.active--;
    this.waiters.shift()?.();
  }
}

/**
 * Opens after `threshold` consecutive failures and rejects calls for `cooldownMs`. Then it lets a
 * single trial call through: success closes it, failure opens it again.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | undefined;
  private trialInFlight = false;

  constructor(
    private readonly threshold: number,
    private readonly cooldownMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get state(): "closed" | "open" | "half_open" {
    if (this.openedAt === undefined) return "closed";
    return this.now() - this.openedAt >= this.cooldownMs ? "half_open" : "open";
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.state;
    if (state === "open" || (state === "half_open" && this.trialInFlight)) throw new CircuitOpenError();
    const trial = state === "half_open";
    if (trial) this.trialInFlight = true;
    try {
      const result = await fn();
      this.failures = 0;
      this.openedAt = undefined;
      return result;
    } catch (err) {
      this.failures++;
      if (trial || this.failures >= this.threshold) this.openedAt = this.now();
      throw err;
    } finally {
      if (trial) this.trialInFlight = false;
    }
  }
}
