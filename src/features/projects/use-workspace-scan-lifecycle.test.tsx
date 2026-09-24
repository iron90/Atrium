import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceSnapshot } from "../../bridge";
import { emptySnapshot } from "./workspace-snapshot";
import { scanWorkspaces as realScanWorkspaces } from "./workspace-scan";
import { useWorkspaceScanLifecycle } from "./use-workspace-scan-lifecycle";

const noop = () => undefined;

type ScanArgs = Parameters<typeof realScanWorkspaces>[0];

function renderInitialScan(
  excludeNames: string[] = [],
  language: "en" | "zh" = "en",
) {
  const initialSnapshot = emptySnapshot("/workspace");
  const defaultWorkspacePath = vi.fn(async () => "/workspace");
  const scanWorkspacesFn = vi.fn(
    async (args: ScanArgs): Promise<WorkspaceSnapshot> => {
      void args;
      return initialSnapshot;
    },
  );
  const onError = vi.fn();
  const onMessage = vi.fn();
  const onApplySnapshot = vi.fn();
  const onSnapshotTimestamp = vi.fn();
  const preferences = {};
  const { rerender, result } = renderHook(
    ({
      nextExcludeNames,
      nextLanguage,
    }: {
      nextExcludeNames: string[];
      nextLanguage: "en" | "zh";
    }) =>
      useWorkspaceScanLifecycle({
        nativeRuntime: true,
        preferences,
        initialRootPath: "",
        initialWorkspacePaths: [],
        initialSnapshot,
        snapshot: initialSnapshot,
        excludeNames: nextExcludeNames,
        language: nextLanguage,
        onError,
        onMessage,
        onApplySnapshot,
        onSnapshotTimestamp,
        defaultWorkspacePath,
        scanWorkspacesFn,
      }),
    { initialProps: { nextExcludeNames: excludeNames, nextLanguage: language } },
  );
  return {
    defaultWorkspacePath,
    scanWorkspacesFn,
    rerender,
    result,
  };
}

describe("workspace scan lifecycle", () => {
  it("does not rescan the workspace when only the language changes", async () => {
    const { defaultWorkspacePath, scanWorkspacesFn, rerender } =
      renderInitialScan();

    await waitFor(() => expect(scanWorkspacesFn).toHaveBeenCalledTimes(1));

    rerender({
      nextExcludeNames: [],
      nextLanguage: "zh",
    });
    await new Promise((resolve) => window.setTimeout(resolve, 20));

    expect(defaultWorkspacePath).toHaveBeenCalledTimes(1);
    expect(scanWorkspacesFn).toHaveBeenCalledTimes(1);
  });

  it("does not rescan the workspace while exclude names are being edited", async () => {
    const { defaultWorkspacePath, scanWorkspacesFn, rerender } =
      renderInitialScan();

    await waitFor(() => expect(scanWorkspacesFn).toHaveBeenCalledTimes(1));

    for (const next of [["n"], ["no"], ["nod"], ["node"]]) {
      rerender({ nextExcludeNames: next, nextLanguage: "en" });
    }
    await new Promise((resolve) => window.setTimeout(resolve, 20));

    expect(defaultWorkspacePath).toHaveBeenCalledTimes(1);
    expect(scanWorkspacesFn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(scanWorkspacesFn).mock.calls[0][0]?.excludeNames).toEqual(
      [],
    );
  });

  it("clears the scanning flag even when another request preempts the gate", async () => {
    const initialSnapshot = emptySnapshot("/workspace");
    const pending: Array<(value: typeof initialSnapshot) => void> = [];
    const scanWorkspacesFn = vi.fn(
      () =>
        new Promise<typeof initialSnapshot>((resolve) => {
          pending.push(resolve);
        }),
    );
    const defaultWorkspacePath = vi.fn(async () => "/workspace");
    const { result } = renderHook(() =>
      useWorkspaceScanLifecycle({
        nativeRuntime: true,
        preferences: {},
        initialRootPath: "/workspace",
        initialWorkspacePaths: ["/workspace"],
        initialSnapshot,
        snapshot: initialSnapshot,
        excludeNames: [],
        language: "en",
        onError: noop,
        onMessage: noop,
        onApplySnapshot: noop,
        onSnapshotTimestamp: noop,
        defaultWorkspacePath,
        scanWorkspacesFn,
      }),
    );

    await waitFor(() => expect(scanWorkspacesFn).toHaveBeenCalledTimes(1));

    const firstManual = result.current.scanWorkspace();
    await waitFor(() => expect(result.current.isScanning).toBe(true));

    const secondManual = result.current.scanWorkspace();
    await waitFor(() => expect(scanWorkspacesFn).toHaveBeenCalledTimes(3));

    for (const resolve of pending.splice(0)) resolve(initialSnapshot);
    await Promise.all([firstManual, secondManual]);

    await waitFor(() => expect(result.current.isScanning).toBe(false));
  });

  it("reports automatic refresh failures through onError", async () => {
    vi.useFakeTimers();
    try {
      const initialSnapshot = emptySnapshot("/workspace");
      let call = 0;
      const scanWorkspacesFn = vi.fn(
        async (args: ScanArgs): Promise<WorkspaceSnapshot> => {
          void args;
          call += 1;
          if (call === 1) return initialSnapshot;
          throw new Error("refresh exploded");
        },
      );
      const onError = vi.fn();
      const onMessage = vi.fn();
      const defaultWorkspacePath = vi.fn(async () => "/workspace");

      renderHook(() =>
        useWorkspaceScanLifecycle({
          nativeRuntime: true,
          preferences: {},
          initialRootPath: "/workspace",
          initialWorkspacePaths: ["/workspace"],
          initialSnapshot,
          snapshot: initialSnapshot,
          excludeNames: [],
          language: "en",
          onError,
          onMessage,
          onApplySnapshot: noop,
          onSnapshotTimestamp: noop,
          defaultWorkspacePath,
          scanWorkspacesFn,
        }),
      );

      await vi.advanceTimersByTimeAsync(0);
      expect(scanWorkspacesFn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(10_000);

      expect(onError).toHaveBeenCalledWith("refresh exploded");
      expect(onMessage).toHaveBeenCalledWith({
        type: "localized",
        key: "refreshFailed",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
