import { describe, expect, it } from "vitest";
import {
  collectFilterOptions,
  filterAndSortProjects,
  reorderProjectMeta,
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
    description: null,
    icon: null,
    protocol: {
      manifestPath: ".atrium/manifest.toml",
      schema: null,
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
  schema: 1,
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
        sort: "manual",
        showHidden: false,
      },
    );
    expect(visible).toEqual([]);
  });

  it("filters hidden projects and applies manual metadata ordering", () => {
    const projects = [project("alpha"), project("beta"), project("gamma")];
    const projectMeta: Record<string, ProjectMeta> = {
      alpha: { favorite: false, hidden: false, order: 2 },
      beta: { favorite: false, hidden: true, order: 0 },
      gamma: { favorite: false, hidden: false, order: 1 },
    };

    const visible = filterAndSortProjects(projects, projectMeta, {
      search: "",
      platform: "all",
      channel: "all",
      sort: "manual",
      showHidden: false,
    });
    const all = filterAndSortProjects(projects, projectMeta, {
      search: "",
      platform: "all",
      channel: "all",
      sort: "manual",
      showHidden: true,
    });

    expect(visible.map(({ id }) => id)).toEqual(["gamma", "alpha"]);
    expect(all.map(({ id }) => id)).toEqual(["beta", "gamma", "alpha"]);
  });

  it("reorders only the supplied visible ids and preserves other projects", () => {
    const projects = [project("alpha"), project("beta"), project("gamma")];
    const projectMeta: Record<string, ProjectMeta> = {
      alpha: { favorite: false, hidden: false, order: 0 },
      beta: { favorite: false, hidden: true, order: 1 },
      gamma: { favorite: false, hidden: false, order: 2 },
    };

    const result = reorderProjectMeta(projects, projectMeta, [
      "gamma",
      "alpha",
    ]);

    expect(result?.gamma.order).toBe(0);
    expect(result?.beta.order).toBe(1);
    expect(result?.alpha.order).toBe(2);
    expect(
      reorderProjectMeta(projects, projectMeta, ["unknown", "alpha"]),
    ).toBe(null);
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

    for (const sort of ["modified", "storage", "name"] as const) {
      const result = filterAndSortProjects(projects, {}, { ...filters, sort });
      expect(result.map(({ id }) => id)).toEqual(["alpha", "zeta"]);
    }
  });

  it("keeps filtered manual reorders stable when metadata orders collide", () => {
    const metadata: Record<string, ProjectMeta> = {
      alpha: { favorite: false, hidden: false, order: 0 },
      beta: { favorite: false, hidden: true, order: 0 },
      zeta: { favorite: false, hidden: false, order: 0 },
    };
    const orderedVisibleIds = ["zeta", "alpha"];
    const first = reorderProjectMeta(
      [project("zeta"), project("beta"), project("alpha")],
      metadata,
      orderedVisibleIds,
    );
    const second = reorderProjectMeta(
      [project("alpha"), project("beta"), project("zeta")],
      metadata,
      orderedVisibleIds,
    );

    expect(
      first &&
        Object.entries(first).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
    ).toEqual(
      second &&
        Object.entries(second).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
    );
  });
});
