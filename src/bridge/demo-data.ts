import type {
  BuildProfile,
  Facet,
  IconConformance,
  IconConformanceStatus,
  ProtocolCapabilityStatus,
  ProjectConfigurationStatus,
  ProjectCommand,
  ProjectSnapshot,
  ProtocolStatus,
  WorkspaceSnapshot,
} from "./types";

const now = Date.now();

const configuredFacet = (
  key: string,
  label: string,
  evidence = ".atrium/manifest.toml",
): Facet => ({
  key,
  label,
  source: "configured",
  evidence: [evidence],
});

const buildProfile = (
  id: string,
  label: string,
  platform: Facet,
  channel: Facet,
  commands: Partial<
    Pick<BuildProfile, "runCommandId" | "checkCommandId" | "buildCommandId">
  >,
): BuildProfile => ({
  id,
  label,
  platform,
  channel,
  runCommandId: commands.runCommandId ?? null,
  checkCommandId: commands.checkCommandId ?? null,
  buildCommandId: commands.buildCommandId ?? null,
  source: ".atrium/manifest.toml#build_profiles",
  region: null,
  payment: null,
  artifacts: [],
  issues: [],
});

const command = (
  id: string,
  kind: ProjectCommand["kind"],
  label: string,
  displayCommand: string,
  source: string,
): ProjectCommand => ({
  id,
  kind,
  label,
  program: displayCommand.split(" ")[0],
  args: displayCommand.split(" ").slice(1),
  workingDirectory: "~/projects",
  displayCommand,
  source,
});

const protocolCapability = (
  id: string,
  status: ProtocolCapabilityStatus,
  issues: string[] = [],
) => ({
  id,
  status,
  evidence: [
    id === "identity"
      ? ".atrium/manifest.toml#identity"
      : `.atrium/manifest.toml#${id}`,
  ],
  issues,
});

const protocolStatus = (
  manifestStatus: ProjectConfigurationStatus,
  statuses: Partial<
    Record<
      "identity" | "context" | "build_profiles" | "cleanup",
      ProtocolCapabilityStatus
    >
  >,
): ProtocolStatus => ({
  manifestPath: ".atrium/manifest.toml",
  schema: manifestStatus === "missing" ? null : 1,
  manifestStatus,
  capabilities: [
    protocolCapability("identity", statuses.identity ?? "missing"),
    protocolCapability("context", statuses.context ?? "missing"),
    protocolCapability("build_profiles", statuses.build_profiles ?? "missing"),
    protocolCapability("cleanup", statuses.cleanup ?? "missing"),
  ],
});

const demoIconConformance = (
  status: IconConformanceStatus,
): IconConformance => ({
  status,
  manifestPath: ".atrium/manifest.toml",
  reportPath: ".atrium/reports/icon-conformance.md",
  declaredIcon: status === "compliant" ? "assets/icon.png" : null,
  resolvedIcon: status === "compliant" ? "assets/icon.png" : null,
});

const demoProjectDefaults: Pick<
  ProjectSnapshot,
  "tools" | "links" | "cleanup" | "storage" | "artifacts"
> = {
  tools: { terminal: null },
  links: [],
  cleanup: { cache: [], build: [] },
  storage: null,
  artifacts: null,
};

export const demoSnapshot = (rootPath: string): WorkspaceSnapshot => ({
  rootPath,
  scannedAt: now,
  warnings: [],
  projects: [
    {
      ...demoProjectDefaults,
      id: `${rootPath}/SampleForge`,
      name: "SampleForge",
      path: `${rootPath}/SampleForge`,
      description: "Generate realistic mock data for development and testing.",
      icon: null,
      iconConformance: demoIconConformance("compliant"),
      protocol: protocolStatus("configured", {
        identity: "configured",
        context: "configured",
        build_profiles: "configured",
      }),
      platforms: [configuredFacet("macos", "macOS")],
      channels: [configuredFacet("github-releases", "GitHub Releases")],
      buildProfiles: [
        buildProfile(
          "macos-github-releases",
          "macOS · GitHub Releases",
          configuredFacet("macos", "macOS"),
          configuredFacet("github-releases", "GitHub Releases"),
          { runCommandId: "npm:dev", buildCommandId: "npm:build" },
        ),
      ],
      configuration: {
        status: "configured",
        manifestPath: ".atrium/manifest.toml",
        issues: [],
      },
      commands: [
        command(
          "npm:dev",
          "run",
          "Run",
          "npm run dev",
          "package.json#scripts.dev",
        ),
        command(
          "npm:test",
          "check",
          "Check",
          "npm run test",
          "package.json#scripts.test",
        ),
        command(
          "npm:build",
          "build",
          "Build",
          "npm run build",
          "package.json#scripts.build",
        ),
      ],
      tools: { terminal: null },
      links: [
        {
          id: "preview",
          label: "Local preview",
          url: "http://127.0.0.1:3000",
          kind: "preview",
        },
      ],
      repo: {
        branch: "main",
        isClean: true,
        worktreeChanges: 0,
        remote: "github.com/atrium-demo/SampleForge",
        ahead: 0,
        behind: 0,
        lastCommit: {
          sha: "a3f9c2e1",
          shortSha: "a3f9c2e",
          author: "Alex",
          timestamp: now - 2 * 60 * 60 * 1000,
          subject: "feat: add preset loader",
        },
        recentCommits: [
          {
            sha: "a3f9c2e1",
            shortSha: "a3f9c2e",
            author: "Alex",
            timestamp: now - 2 * 60 * 60 * 1000,
            subject: "feat: add preset loader",
          },
          {
            sha: "7bd1e4a0",
            shortSha: "7bd1e4a",
            author: "Alex",
            timestamp: now - 24 * 60 * 60 * 1000,
            subject: "refactor: simplify schema",
          },
          {
            sha: "c9d2b118",
            shortSha: "c9d2b11",
            author: "Alex",
            timestamp: now - 2 * 24 * 60 * 60 * 1000,
            subject: "docs: update usage examples",
          },
        ],
        references: [
          { name: "main", kind: "branch", sha: "a3f9c2e" },
          { name: "v0.1.0", kind: "tag", sha: "7bd1e4a" },
        ],
      },
      scannedAt: now,
    },
    {
      ...demoProjectDefaults,
      id: `${rootPath}/TackNote`,
      name: "TackNote",
      path: `${rootPath}/TackNote`,
      description: "A focused desktop capture and annotation tool.",
      icon: null,
      iconConformance: demoIconConformance("compliant"),
      protocol: protocolStatus("configured", {
        identity: "configured",
        context: "configured",
        build_profiles: "configured",
      }),
      platforms: [configuredFacet("windows", "Windows")],
      channels: [configuredFacet("website", "Website")],
      buildProfiles: [
        buildProfile(
          "windows-website",
          "Windows · Website",
          configuredFacet("windows", "Windows"),
          configuredFacet("website", "Website"),
          { runCommandId: "npm:dev", buildCommandId: "npm:build" },
        ),
      ],
      configuration: {
        status: "configured",
        manifestPath: ".atrium/manifest.toml",
        issues: [],
      },
      commands: [
        command(
          "npm:dev",
          "run",
          "Run",
          "npm run dev",
          "package.json#scripts.dev",
        ),
        command(
          "npm:check",
          "check",
          "Check",
          "npm run check",
          "package.json#scripts.check",
        ),
        command(
          "npm:build",
          "build",
          "Build",
          "npm run build",
          "package.json#scripts.build",
        ),
      ],
      repo: {
        branch: "main",
        isClean: false,
        worktreeChanges: 3,
        remote: "github.com/atrium-demo/TackNote",
        ahead: null,
        behind: null,
        lastCommit: {
          sha: "5f1b8a9a",
          shortSha: "5f1b8a9",
          author: "Alex",
          timestamp: now - 5 * 60 * 60 * 1000,
          subject: "fix: preserve overlay focus",
        },
        recentCommits: [
          {
            sha: "5f1b8a9a",
            shortSha: "5f1b8a9",
            author: "Alex",
            timestamp: now - 5 * 60 * 60 * 1000,
            subject: "fix: preserve overlay focus",
          },
          {
            sha: "a72e90c2",
            shortSha: "a72e90c",
            author: "Alex",
            timestamp: now - 2 * 24 * 60 * 60 * 1000,
            subject: "test: cover selection lifecycle",
          },
        ],
        references: [],
      },
      scannedAt: now,
    },
    {
      ...demoProjectDefaults,
      id: `${rootPath}/SnapCutout`,
      name: "SnapCutout",
      path: `${rootPath}/SnapCutout`,
      description: "Local image cutout tools powered by on-device models.",
      icon: null,
      iconConformance: demoIconConformance("compliant"),
      protocol: protocolStatus("configured", {
        identity: "configured",
        context: "configured",
        build_profiles: "configured",
      }),
      platforms: [
        configuredFacet("macos", "macOS"),
        configuredFacet("windows", "Windows"),
      ],
      channels: [
        configuredFacet("apple-app-store", "App Store"),
        configuredFacet("website", "Website"),
      ],
      buildProfiles: [
        buildProfile(
          "macos-app-store",
          "macOS · App Store",
          configuredFacet("macos", "macOS"),
          configuredFacet("apple-app-store", "App Store"),
          {
            runCommandId: "npm:dev",
            buildCommandId: "npm:build:macos:appstore",
          },
        ),
        buildProfile(
          "macos-website",
          "macOS · Website",
          configuredFacet("macos", "macOS"),
          configuredFacet("website", "Website"),
          { runCommandId: "npm:dev", buildCommandId: "npm:build:macos" },
        ),
        buildProfile(
          "windows-website",
          "Windows · Website",
          configuredFacet("windows", "Windows"),
          configuredFacet("website", "Website"),
          { runCommandId: "npm:dev", buildCommandId: "npm:build:windows" },
        ),
      ],
      configuration: {
        status: "configured",
        manifestPath: ".atrium/manifest.toml",
        issues: [],
      },
      commands: [
        command(
          "npm:dev",
          "run",
          "Run",
          "npm run dev",
          "package.json#scripts.dev",
        ),
        command(
          "npm:check",
          "check",
          "Check",
          "npm run check",
          "package.json#scripts.check",
        ),
        command(
          "npm:build",
          "build",
          "Build",
          "npm run build",
          "package.json#scripts.build",
        ),
        command(
          "npm:build:windows",
          "other",
          "build:windows",
          "npm run build:windows",
          "package.json#scripts.build:windows",
        ),
        command(
          "npm:build:macos",
          "other",
          "build:macos",
          "npm run build:macos",
          "package.json#scripts.build:macos",
        ),
        command(
          "npm:build:macos:appstore",
          "other",
          "build:macos:appstore",
          "npm run build:macos:appstore",
          "package.json#scripts.build:macos:appstore",
        ),
      ],
      repo: {
        branch: "main",
        isClean: true,
        worktreeChanges: 0,
        remote: "github.com/atrium-demo/SnapCutout",
        ahead: 0,
        behind: 1,
        lastCommit: {
          sha: "b4c0d8e2",
          shortSha: "b4c0d8e",
          author: "Alex",
          timestamp: now - 24 * 60 * 60 * 1000,
          subject: "perf: reduce model startup time",
        },
        recentCommits: [
          {
            sha: "b4c0d8e2",
            shortSha: "b4c0d8e",
            author: "Alex",
            timestamp: now - 24 * 60 * 60 * 1000,
            subject: "perf: reduce model startup time",
          },
        ],
        references: [],
      },
      scannedAt: now,
    },
    {
      ...demoProjectDefaults,
      id: `${rootPath}/CalmCadence`,
      name: "Cognitive Rhythm",
      path: `${rootPath}/CalmCadence`,
      description:
        "A quiet mobile experience for attention and energy rhythms.",
      icon: null,
      iconConformance: demoIconConformance("missing"),
      protocol: protocolStatus("missing", {}),
      platforms: [
        configuredFacet("ios", "iOS"),
        configuredFacet("android", "Android"),
      ],
      channels: [],
      buildProfiles: [],
      configuration: {
        status: "missing",
        manifestPath: ".atrium/manifest.toml",
        issues: [".atrium/manifest.toml is not present."],
      },
      commands: [
        command(
          "flutter:test",
          "check",
          "Check",
          "flutter test",
          "pubspec.yaml",
        ),
        command(
          "flutter:build",
          "build",
          "Build",
          "flutter build",
          "pubspec.yaml",
        ),
      ],
      repo: null,
      scannedAt: now,
    },
    {
      ...demoProjectDefaults,
      id: `${rootPath}/WebDock`,
      name: "WebDock Desktop",
      path: `${rootPath}/WebDock`,
      description:
        "A local desktop workspace for frequently used web applications.",
      icon: null,
      iconConformance: demoIconConformance("compliant"),
      protocol: protocolStatus("configured", {
        identity: "configured",
        context: "configured",
        build_profiles: "configured",
      }),
      platforms: [
        configuredFacet("macos", "macOS"),
        configuredFacet("windows", "Windows"),
        configuredFacet("linux", "Linux"),
      ],
      channels: [configuredFacet("github-releases", "GitHub Releases")],
      buildProfiles: [
        buildProfile(
          "desktop-github-releases",
          "macOS · GitHub Releases",
          configuredFacet("macos", "macOS"),
          configuredFacet("github-releases", "GitHub Releases"),
          { runCommandId: "npm:dev", buildCommandId: "npm:build" },
        ),
      ],
      configuration: {
        status: "configured",
        manifestPath: ".atrium/manifest.toml",
        issues: [],
      },
      commands: [
        command(
          "npm:dev",
          "run",
          "Run",
          "npm run dev",
          "package.json#scripts.dev",
        ),
        command(
          "npm:check",
          "check",
          "Check",
          "npm run check",
          "package.json#scripts.check",
        ),
        command(
          "npm:build",
          "build",
          "Build",
          "npm run build",
          "package.json#scripts.build",
        ),
      ],
      repo: {
        branch: "main",
        isClean: true,
        worktreeChanges: 0,
        remote: "github.com/atrium-demo/WebDock",
        ahead: 0,
        behind: 0,
        lastCommit: {
          sha: "2d42c6a4",
          shortSha: "2d42c6a",
          author: "Alex",
          timestamp: now - 3 * 24 * 60 * 60 * 1000,
          subject: "docs: align release evidence",
        },
        recentCommits: [
          {
            sha: "2d42c6a4",
            shortSha: "2d42c6a",
            author: "Alex",
            timestamp: now - 3 * 24 * 60 * 60 * 1000,
            subject: "docs: align release evidence",
          },
        ],
        references: [],
      },
      scannedAt: now,
    },
    {
      ...demoProjectDefaults,
      id: `${rootPath}/WebsiteServer`,
      name: "Website Server",
      path: `${rootPath}/WebsiteServer`,
      description: "The future personal website and content surface.",
      icon: null,
      iconConformance: demoIconConformance("missing"),
      protocol: protocolStatus("missing", {}),
      platforms: [configuredFacet("web", "Web")],
      channels: [],
      buildProfiles: [],
      configuration: {
        status: "missing",
        manifestPath: ".atrium/manifest.toml",
        issues: [".atrium/manifest.toml is not present."],
      },
      commands: [
        command(
          "npm:dev",
          "run",
          "Run",
          "npm run dev",
          "package.json#scripts.dev",
        ),
      ],
      repo: null,
      scannedAt: now,
    },
  ],
});
