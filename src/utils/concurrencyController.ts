/**
 * Generic promise pool with configurable concurrency, per-job timeout,
 * and error isolation. One rejected/failed job does not cancel others.
 */
export interface ConcurrencyOptions {
  /** Max number of promises running simultaneously. Default: 5 */
  concurrency?: number;
  /** Optional per-job timeout in ms. Jobs exceeding this are rejected. */
  timeoutMs?: number;
}

export interface ConcurrencyResult<T> {
  /** Results from successfully resolved jobs (in input order). */
  results: T[];
  /** Number of jobs that rejected or threw. */
  failed: number;
  /** Error objects for each failed job, in failed order. */
  errors: Error[];
}

export class ConcurrencyController {
  private readonly concurrency: number;
  private readonly timeoutMs?: number;

  constructor(options: ConcurrencyOptions = {}) {
    this.concurrency = Math.max(1, options.concurrency ?? 5);
    this.timeoutMs = options.timeoutMs;
  }

  /**
   * Runs an array of job factories with concurrency control.
   *
   * @param jobs - Array of async functions to execute.
   * @param onProgress - Optional callback called after each job completes.
   *   Receives (completed, total, failed) counts.
   * @returns Aggregated results with error isolation.
   */
  async run<T>(
    jobs: (() => Promise<T>)[],
    onProgress?: (completed: number, total: number, failed: number) => void,
  ): Promise<ConcurrencyResult<T>> {
    const results: T[] = [];
    const errors: Error[] = [];
    let completed = 0;
    let failed = 0;
    let nextIndex = 0;
    let aborted = false;

    return new Promise((resolve, reject) => {
      // If no jobs, return immediately
      if (jobs.length === 0) {
        resolve({ results, failed: 0, errors: [] });
        return;
      }

      const runNext = () => {
        // Guard against post-abort execution
        if (aborted) return;

        // Grab the next job index
        const index = nextIndex++;
        if (index >= jobs.length) {
          // All jobs dispatched — this worker exits
          return;
        }

        const jobPromise = jobs[index]();

        const timedPromise = this.timeoutMs
          ? Promise.race([
              jobPromise,
              new Promise<T>((_, rejectTimeout) => {
                setTimeout(
                  () => rejectTimeout(new Error(`Job timed out after ${this.timeoutMs}ms`)),
                  this.timeoutMs,
                );
              }),
            ])
          : jobPromise;

        timedPromise
          .then((result) => {
            results[index] = result;
            completed++;
            onProgress?.(completed, jobs.length, failed);
            // Dispatch next job
            runNext();
          })
          .catch((err: Error) => {
            failed++;
            errors.push(err);
            completed++;
            onProgress?.(completed, jobs.length, failed);
            // Continue with next job despite failure
            runNext();
          });
      };

      // Launch initial batch of workers
      const workerCount = Math.min(this.concurrency, jobs.length);
      for (let i = 0; i < workerCount; i++) {
        runNext();
      }

      // Poll for completion
      const checkDone = () => {
        if (completed >= jobs.length) {
          resolve({ results, failed, errors });
        } else if (!aborted) {
          setTimeout(checkDone, 50);
        }
      };
      setTimeout(checkDone, 50);
    });
  }
}
