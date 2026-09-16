import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { emptySnapshot } from "./workspace-snapshot";
import { useWorkspaceScanLifecycle } from "./use-workspace-scan-lifecycle";

describe("workspace scan lifecycle", () => {
  it("does not rescan the workspace when only the language changes", async () => {
    const initialSnapshot = emptySnapshot("/workspace");
    const defaultWorkspacePath = vi.fn(async () => "/workspace");
    const scanWorkspacesFn = vi.fn(async () => initialSnapshot);
    const onError = vi.fn();
    const onMessage = vi.fn();
    const onApplySnapshot = vi.fn();
    const onSnapshotTimestamp = vi.fn();
    const preferences = {};
    const excludeNames: string[] = [];
    const initialProps: { language: "en" | "zh" } = { language: "en" };
    const { rerender } = renderHook(
      ({ language }: { language: "en" | "zh" }) =>
        useWorkspaceScanLifecycle({
          nativeRuntime: true,
          preferences,
          initialRootPath: "",
          initialWorkspacePaths: [],
          initialSnapshot,
          snapshot: initialSnapshot,
          excludeNames,
          language,
          onError,
          onMessage,
          onApplySnapshot,
          onSnapshotTimestamp,
          defaultWorkspacePath,
          scanWorkspacesFn,
        }),
      { initialProps },
    );

    await waitFor(() => expect(scanWorkspacesFn).toHaveBeenCalledTimes(1));

    rerender({ language: "zh" });
    await new Promise((resolve) => window.setTimeout(resolve, 20));

    expect(defaultWorkspacePath).toHaveBeenCalledTimes(1);
    expect(scanWorkspacesFn).toHaveBeenCalledTimes(1);
  });
});
