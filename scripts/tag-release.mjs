import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { versionFromTag } from "./stamp-release-version.mjs";

export function formatTagMessage(english, chinese) {
  const en = typeof english === "string" ? english.trim() : "";
  const zh = typeof chinese === "string" ? chinese.trim() : "";
  if (!en || !zh) {
    throw new Error(
      "A release tag needs both an English summary and a Chinese summary.",
    );
  }
  return [
    "<!-- atrium:notes:en -->",
    en,
    "<!-- /atrium:notes:en -->",
    "",
    "<!-- atrium:notes:zh -->",
    zh,
    "<!-- /atrium:notes:zh -->",
    "",
  ].join("\n");
}

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
}

export function createReleaseTag(root, tag, english, chinese) {
  versionFromTag(tag);
  const message = formatTagMessage(english, chinese);
  const existing = git(root, ["tag", "--list", tag]).trim();
  if (existing) {
    throw new Error(
      `Tag ${tag} already exists. Delete it first if you mean to replace it.`,
    );
  }
  const directory = mkdtempSync(join(tmpdir(), "atrium-tag-"));
  const messagePath = join(directory, "message.txt");
  try {
    writeFileSync(messagePath, message);
    git(root, ["tag", "-a", tag, "-F", messagePath]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  return message;
}

function optionValue(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return "";
  return argv[index + 1] ?? "";
}

const isDirectRun =
  process.argv[1] !== undefined &&
  normalize(fileURLToPath(import.meta.url)) ===
    normalize(resolve(process.argv[1]));

if (isDirectRun) {
  const tag = process.argv[2];
  const englishPath = optionValue(process.argv, "--en-file");
  const chinesePath = optionValue(process.argv, "--zh-file");
  if (!tag || !englishPath || !chinesePath) {
    console.error(
      "Usage: node scripts/tag-release.mjs v1.2.3 --en-file notes.en.txt --zh-file notes.zh.txt",
    );
    process.exit(1);
  }
  try {
    createReleaseTag(
      process.cwd(),
      tag,
      readFileSync(englishPath, "utf8"),
      readFileSync(chinesePath, "utf8"),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
