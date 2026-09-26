import { describe, expect, it, vi } from "vitest";
import { withTimeout } from "./with-timeout";

describe("withTimeout", () => {
  it("resolves with the task value when it settles in time", async () => {
    await expect(
      withTimeout(Promise.resolve("done"), 1_000, "too slow"),
    ).resolves.toBe("done");
  });

  it("propagates the task error without waiting for the deadline", async () => {
    const failure = Promise.reject(new Error("boom"));
    await expect(withTimeout(failure, 10_000, "too slow")).rejects.toThrow(
      "boom",
    );
  });

  it("rejects with the timeout message when the task hangs", async () => {
    vi.useFakeTimers();
    const pending = new Promise<string>(() => undefined);
    const guarded = withTimeout(pending, 5_000, "too slow");
    const assertion = expect(guarded).rejects.toThrow("too slow");
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
    vi.useRealTimers();
  });

  it("does not keep the timer alive after the task settles", async () => {
    vi.useFakeTimers();
    const guarded = withTimeout(Promise.resolve("fast"), 5_000, "too slow");
    await guarded;
    await vi.advanceTimersByTimeAsync(10_000);
    vi.useRealTimers();
  });
});
