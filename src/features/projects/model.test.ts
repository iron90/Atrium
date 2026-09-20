import { describe, expect, it } from "vitest";
import {
  collectFilterOptions,
  filterAndSortProjects,
  type ProjectMeta,
} from "./project-list-model";
import { mergeWorkspaceSnapshots } from "./workspace-snapshot";
import type { Facet, ProjectSnapshot } from "../../bridge";

const project = (
  id: string,
  overrides: Partial<ProjectSnapshot> = {},
): ProjectSnapshot =>
  ({
    id,
    name: id,
    path: `/workspace/${id}`,
    modifiedAt: null,
    description: null,
    icon: null,
    protocol: {
      manifestPath: ".atrium/manifest.toml",
      schema: null,
      needsUpdate: false,
      manifestStatus: "missing",
      capabilities: [],
    },
    repo: null,
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
    guidance: { revision: null, needsUpdate: true, needsSync: true },
    scannedAt: 1,
    ...overrides,
  }) as ProjectSnapshot;

const facet = (key: string, label = key): Facet => ({
  key,
  label,
  source: "configured",
  evidence: [".atrium/manifest.toml"],
});

const trustedContext = {
  manifestPath: ".atrium/manifest.toml",
  schema: 2,
  needsUpdate: false,
  manifestStatus: "configured" as const,
  capabilities: [
    {
      id: "identity",
      status: "configured" as const,
      evidence: [".atrium/manifest.toml#identity"],
      issues: [],
    },
    {
      id: "context",
      status: "configured" as const,
      evidence: [".atrium/manifest.toml#context"],
      issues: [],
    },
  ],
};

describe("project domain model", () => {
  it("merges workspace snapshots by stable project id", () => {
    const first = project("shared", { name: "old" });
    const second = project("shared", { name: "new" });
    const firstScannedAt = Date.now() + 100_000;
    const secondScannedAt = firstScannedAt + 10;
    const result = mergeWorkspaceSnapshots(
      [
        {
          rootPath: "/one",
          scannedAt: firstScannedAt,
          projects: [first],
          warnings: ["first warning"],
        },
        {
          rootPath: "/two",
          scannedAt: secondScannedAt,
          projects: [second],
          warnings: ["second warning"],
        },
      ],
      "/fallback",
    );

    expect(result.projects).toEqual([second]);
    expect(result.rootPath).toBe("/one · /two");
    expect(result.scannedAt).toBe(secondScannedAt);
    expect(result.warnings).toEqual(["first warning", "second warning"]);
  });

  it("collects unique and sorted platform and channel facets", () => {
    const projects = [
      project("one", {
        protocol: trustedContext,
        platforms: [facet("windows", "Windows"), facet("macos", "macOS")],
        channels: [facet("store", "Store")],
      }),
      project("two", {
        protocol: trustedContext,
        platforms: [facet("windows", "Windows")],
        channels: [facet("local", "Local")],
      }),
    ];

    const result = collectFilterOptions(projects);

    expect(result.platforms.map(({ key }) => key)).toEqual([
      "macos",
      "windows",
    ]);
    expect(result.channels.map(({ key }) => key)).toEqual(["local", "store"]);
  });

  it("does not expose untrusted context to filters", () => {
    const projects = [
      project("trusted", {
        protocol: trustedContext,
        platforms: [facet("windows", "Windows")],
        channels: [facet("store", "Store")],
      }),
      project("untrusted", {
        platforms: [facet("ios", "iOS")],
        channels: [facet("testflight", "TestFlight")],
      }),
    ];

    const options = collectFilterOptions(projects);
    expect(options.platforms.map(({ key }) => key)).toEqual(["windows"]);
    expect(options.channels.map(({ key }) => key)).toEqual(["store"]);

    const visible = filterAndSortProjects(
      projects,
      {},
      {
        search: "",
        platform: "ios",
        channel: "all",
        sort: "name",
        showHidden: false,
      },
    );
    expect(visible).toEqual([]);
  });

  it("filters hidden projects and sorts by name", () => {
    const projects = [project("alpha"), project("beta"), project("gamma")];
    const projectMeta: Record<string, ProjectMeta> = {
      alpha: { favorite: false, hidden: false },
      beta: { favorite: false, hidden: true },
      gamma: { favorite: false, hidden: false },
    };

    const visible = filterAndSortProjects(projects, projectMeta, {
      search: "",
      platform: "all",
      channel: "all",
      sort: "name",
      showHidden: false,
    });
    const all = filterAndSortProjects(projects, projectMeta, {
      search: "",
      platform: "all",
      channel: "all",
      sort: "name",
      showHidden: true,
    });

    expect(visible.map(({ id }) => id)).toEqual(["alpha", "gamma"]);
    expect(all.map(({ id }) => id)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("uses stable identity tie-breakers for equal sort values", () => {
    const projects = [
      project("zeta", { name: "Same name" }),
      project("alpha", { name: "Same name" }),
    ];
    const filters = {
      search: "",
      platform: "all",
      channel: "all",
      showHidden: false,
    };

    for (const sort of ["modified", "recent", "storage", "name"] as const) {
      const result = filterAndSortProjects(projects, {}, { ...filters, sort });
      expect(result.map(({ id }) => id)).toEqual(["alpha", "zeta"]);
    }
  });

  it("sorts projects by most recent filesystem modification", () => {
    const projects = [
      project("alpha", { modifiedAt: 100 }),
      project("beta", { modifiedAt: 300 }),
      project("gamma", { modifiedAt: null }),
    ];

    const result = filterAndSortProjects(
      projects,
      {},
      {
        search: "",
        platform: "all",
        channel: "all",
        sort: "recent",
        showHidden: false,
      },
    );

    expect(result.map(({ id }) => id)).toEqual(["beta", "alpha", "gamma"]);
  });
});
