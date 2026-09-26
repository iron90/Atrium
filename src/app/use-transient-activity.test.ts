import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityMessage } from "../shared/activity";
import {
  ACTIVITY_BANNER_TTL_MS,
  useTransientActivityMessage,
} from "./use-transient-activity";

describe("useTransientActivityMessage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears a result message after the ttl", () => {
    const clear = vi.fn();
    renderHook(() =>
      useTransientActivityMessage({ type: "projectRefreshed" }, clear),
    );

    expect(clear).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(ACTIVITY_BANNER_TTL_MS + 1);
    });
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("keeps the in-progress scanning message on screen", () => {
    const clear = vi.fn();
    renderHook(() => useTransientActivityMessage({ type: "scanning" }, clear));

    act(() => {
      vi.advanceTimersByTime(ACTIVITY_BANNER_TTL_MS * 3);
    });
    expect(clear).not.toHaveBeenCalled();
  });

  it("resets the timer when a new message arrives", () => {
    const clear = vi.fn();
    const initial: { message: ActivityMessage } = {
      message: { type: "projectRefreshed" },
    };
    const { rerender } = renderHook(
      ({ message }: { message: ActivityMessage }) =>
        useTransientActivityMessage(message, clear),
      { initialProps: initial },
    );

    act(() => {
      vi.advanceTimersByTime(ACTIVITY_BANNER_TTL_MS - 1);
    });
    rerender({ message: { type: "workspaceUpdated", count: 3 } });
    act(() => {
      vi.advanceTimersByTime(ACTIVITY_BANNER_TTL_MS - 1);
    });
    expect(clear).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
