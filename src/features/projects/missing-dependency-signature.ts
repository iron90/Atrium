/**
 * Best-effort guess at whether a failed command stopped on a missing
 * dependency.
 *
 * This is deliberately a guess and is never treated as evidence: the same
 * lines appear when a project's own code imports something it chose not to
 * ship, and a wrong guess must not become a declared reason. It only shapes a
 * hint the user can dismiss; it never runs anything and never changes what
 * the manifest says.
 */
const MISSING_DEPENDENCY_SIGNATURES: readonly RegExp[] = [
  /cannot find (module|package) ['"][^'"]+['"]/i,
  /module not found/i,
  /modulenotfounderror/i,
  /no module named /i,
  /command not found/i,
  /is not recognized as an internal or external command/i,
  /no such file or directory: .*\/(node_modules|venv|\.venv)\//i,
  /failed to fetch/i,
  /couldn't find any (versions|package)/i,
  /unable to find (a|any) package/i,
  /package `[^`]+` not found/i,
  /does not appear to be installed/i,
];

export const looksLikeMissingDependency = (output: string): boolean =>
  MISSING_DEPENDENCY_SIGNATURES.some((signature) => signature.test(output));
