import { bridge } from "../../bridge";
import type { WorkspaceSnapshot } from "../../bridge";
import { translate, type Language } from "../../i18n";
import { emptySnapshot, mergeWorkspaceSnapshots } from "./workspace-snapshot";

export type WorkspaceScanner = (
  rootPath: string,
  excludedNames: string[],
) => Promise<WorkspaceSnapshot>;

export const normalizeWorkspacePaths = (paths: string[]): string[] =>
  Array.from(
    new Set(
      paths.map((path) => path.trim().replace(/\\/g, "/")).filter(Boolean),
    ),
  );

export const hasWorkspaceOverlap = (paths: string[]): boolean => {
  const normalized = normalizeWorkspacePaths(paths).map(pathForComparison);
  return normalized.some((left, index) =>
    normalized.some(
      (right, rightIndex) =>
        index !== rightIndex &&
        (isNestedPath(left, right) || isNestedPath(right, left)),
    ),
  );
};

const pathForComparison = (path: string): string => {
  const withoutTrailingSeparators = path.replace(/\/+$/, "");
  return withoutTrailingSeparators || (path.startsWith("/") ? "/" : "");
};

const isNestedPath = (parent: string, candidate: string): boolean =>
  candidate.startsWith(parent === "/" ? "/" : `${parent}/`);

export async function scanWorkspaces({
  paths,
  excludeNames,
  language,
  scanWorkspace = bridge.scanWorkspace,
}: {
  paths: string[];
  excludeNames: string[];
  language: Language;
  scanWorkspace?: WorkspaceScanner;
}): Promise<WorkspaceSnapshot> {
  const normalized = normalizeWorkspacePaths(paths);
  if (!normalized.length) return emptySnapshot("");

  const results = await Promise.allSettled(
    normalized.map((path) => scanWorkspace(path, excludeNames)),
  );
  const snapshots = results
    .filter(
      (result): result is PromiseFulfilledResult<WorkspaceSnapshot> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value);
  if (!snapshots.length) {
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    throw failure?.reason ?? new Error("No workspace could be scanned");
  }

  const scan = mergeWorkspaceSnapshots(snapshots, normalized[0] ?? "");
  const rejected = results
    .map((result, index) =>
      result.status === "rejected"
        ? `Workspace ${normalized[index] ?? ""}: ${String(result.reason)}`
        : null,
    )
    .filter((warning): warning is string => Boolean(warning));
  return {
    ...scan,
    warnings: [
      ...scan.warnings,
      ...rejected,
      ...(hasWorkspaceOverlap(normalized)
        ? [translate(language, "workspaceOverlap")]
        : []),
    ],
  };
}
