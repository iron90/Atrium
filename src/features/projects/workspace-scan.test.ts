import { describe, expect, it, vi } from "vitest";
import type { WorkspaceSnapshot } from "../../bridge";
import {
  hasWorkspaceOverlap,
  normalizeWorkspacePaths,
  scanWorkspaces,
} from "./workspace-scan";

const snapshot = (rootPath: string, projectId: string): WorkspaceSnapshot => ({
  rootPath,
  scannedAt: 1,
  projects: [
    {
      id: projectId,
      name: projectId,
      path: `${rootPath}/${projectId}`,
      description: null,
      icon: null,
      iconConformance: {
        status: "missing",
        manifestPath: ".atrium/manifest.toml",
        reportPath: ".atrium/reports/icon-conformance.md",
        declaredIcon: null,
        resolvedIcon: null,
      },
      protocol: {
        manifestPath: ".atrium/manifest.toml",
        schema: null,
        manifestStatus: "missing",
        capabilities: [],
      },
      repo: null,
      tools: { terminal: null },
      links: [],
      platforms: [],
      channels: [],
      buildProfiles: [],
      configuration: {
        status: "missing",
        manifestPath: ".atrium/manifest.toml",
        issues: [],
      },
      commands: [],
      cleanup: { cache: [], build: [] },
      storage: null,
      artifacts: null,
      scannedAt: 1,
    },
  ],
  warnings: [],
});

describe("workspace scanning service", () => {
  it("normalizes paths and detects nested workspace roots", () => {
    expect(normalizeWorkspacePaths([" /one ", "/one", "", "/two"])).toEqual([
      "/one",
      "/two",
    ]);
    expect(hasWorkspaceOverlap(["/one", "/one/nested"])).toBe(true);
    expect(hasWorkspaceOverlap(["C:\\Work", "C:\\Work\\nested"])).toBe(true);
    expect(hasWorkspaceOverlap(["/one/", "/one/nested"])).toBe(true);
    expect(hasWorkspaceOverlap(["/one", "/two"])).toBe(false);
  });

  it("merges successful scans and reports partial failures deterministically", async () => {
    const scanner = vi.fn(async (rootPath: string) => {
      if (rootPath === "/broken") throw new Error("permission denied");
      return snapshot(rootPath, rootPath.slice(1));
    });

    const result = await scanWorkspaces({
      paths: [" /one ", "/broken", "/one/nested"],
      excludeNames: ["node_modules"],
      language: "en",
      scanWorkspace: scanner,
    });

    expect(scanner).toHaveBeenCalledTimes(3);
    expect(scanner).toHaveBeenCalledWith("/one", ["node_modules"]);
    expect(result.projects.map((project) => project.id)).toEqual([
      "one",
      "one/nested",
    ]);
    expect(result.warnings).toEqual([
      "Workspace /broken: Error: permission denied",
      "Overlapping workspaces are merged by project path.",
    ]);
  });
});
