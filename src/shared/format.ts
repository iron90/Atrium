import type { Language } from "../i18n";

const NOTE_SECTION =
  /<!--\s*atrium:notes:(en|zh)\s*-->([\s\S]*?)<!--\s*\/atrium:notes:\1\s*-->/g;

export const fill = (value: string, key: string, replacement: string): string =>
  value.replace(`{${key}}`, replacement);

export const formatTime = (timestamp: number, language: Language): string =>
  new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));

// Marked release bodies keep each language inside an HTML comment. The app
// shows only that section, so the macOS install command outside the markers
// stays on the GitHub release page. Older bodies put Chinese before a dash
// line and English after it; a body with neither form is shown whole.
export const localizedReleaseNotes = (
  notes: string,
  language: Language = "en",
): string => {
  const normalized = notes.replace(/\r\n/g, "\n");
  const sections = new Map<string, string>();
  for (const match of normalized.matchAll(NOTE_SECTION)) {
    const text = match[2].trim();
    if (text) sections.set(match[1], text);
  }
  if (sections.size > 0) {
    return sections.get(language) ?? sections.get("en") ?? "";
  }
  const parts = normalized.split(/\n[ \t]*-{3,}[ \t]*(?:\n|$)/);
  if (parts.length < 2) return normalized.trim();
  if (language === "zh") return parts[0].trim();
  return parts.slice(1).join("\n---\n").trim();
};

export type ReleaseNoteBlock =
  { type: "paragraph"; text: string } | { type: "command"; text: string };

const looksLikeCommand = (value: string): boolean => {
  const shaped = /^[a-z][\w.-]*(?:\s+\S+)+$/i.test(value);
  return shaped && (/(?:^|\s)-\w/.test(value) || /[\\/]/.test(value));
};

// A shell command after the last colon is pulled onto its own line so a long
// path does not wrap inside the sentence.
const splitCommand = (paragraph: string): ReleaseNoteBlock[] => {
  const colon = Math.max(
    paragraph.lastIndexOf(":"),
    paragraph.lastIndexOf("："),
  );
  if (colon <= 0) return [{ type: "paragraph", text: paragraph }];
  const tail = paragraph.slice(colon + 1).trim();
  if (!looksLikeCommand(tail)) return [{ type: "paragraph", text: paragraph }];
  return [
    { type: "paragraph", text: paragraph.slice(0, colon + 1).trim() },
    { type: "command", text: tail },
  ];
};

export const releaseNoteBlocks = (
  notes: string,
  language: Language = "en",
): ReleaseNoteBlock[] =>
  localizedReleaseNotes(notes, language)
    .split(/\n{2,}/)
    .flatMap((paragraph) => {
      const trimmed = paragraph.trim();
      return trimmed ? splitCommand(trimmed) : [];
    });

export const formatRelative = (
  timestamp: number,
  language: Language,
): string => {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 60) {
    return language === "zh" ? `${minutes} 分钟前` : `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return language === "zh" ? `${hours} 小时前` : `${hours} hr ago`;
  }
  const days = Math.round(hours / 24);
  return language === "zh" ? `${days} 天前` : `${days} days ago`;
};

export const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** unitIndex;
  const formatted =
    unitIndex === 0 || value >= 100
      ? Math.round(value).toString()
      : value.toFixed(1);
  return `${formatted} ${units[unitIndex]}`;
};
