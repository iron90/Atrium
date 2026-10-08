// `std::fs::canonicalize` on Windows returns the `\\?\` verbatim prefix.
// It is meaningful to Win32 and useless in the interface. Strip it only when
// the path is a normal drive or UNC path that legacy APIs can still open.
const VERBATIM_PREFIX = "\\\\?\\";
const VERBATIM_UNC_PREFIX = "\\\\?\\UNC\\";
const LEGACY_MAX_LENGTH = 260;
const RESERVED_NAMES = new Set([
  "AUX",
  "NUL",
  "PRN",
  "CON",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

const needsVerbatimForm = (path: string): boolean =>
  path.split(/[\\/]/).some((segment) => {
    if (!segment || segment.endsWith(" ") || segment.endsWith("."))
      return Boolean(segment);
    const stem = segment.includes(".")
      ? segment.slice(0, segment.lastIndexOf("."))
      : segment;
    const trimmed = stem.replace(/[ .]+$/, "");
    return (
      trimmed.length > 0 &&
      trimmed.length <= 4 &&
      RESERVED_NAMES.has(trimmed.toUpperCase())
    );
  });

export const normalizeWindowsPath = (path: string): string => {
  if (path.length > LEGACY_MAX_LENGTH || needsVerbatimForm(path)) return path;

  if (path.startsWith(VERBATIM_UNC_PREFIX)) {
    return `\\\\${path.slice(VERBATIM_UNC_PREFIX.length)}`;
  }

  if (path.startsWith(VERBATIM_PREFIX)) {
    const simplified = path.slice(VERBATIM_PREFIX.length);
    if (/^[A-Za-z]:[\\/]/.test(simplified)) return simplified;
  }

  return path;
};
