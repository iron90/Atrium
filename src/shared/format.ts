import type { Language } from "../i18n";

export const fill = (value: string, key: string, replacement: string): string =>
  value.replace(`{${key}}`, replacement);

export const formatTime = (timestamp: number, language: Language): string =>
  new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));

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
