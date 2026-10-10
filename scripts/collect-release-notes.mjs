import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { versionFromTag } from "./stamp-release-version.mjs";

const SECTION =
  /<!--\s*atrium:notes:(en|zh)\s*-->([\s\S]*?)<!--\s*\/atrium:notes:\1\s*-->/g;

// Kept outside the note markers. GitHub renders it; the app ignores it.
export const MACOS_INSTALL_NOTE = [
  "macOS 首次打开若提示「已损坏」，在终端执行：",
  "",
  "xattr -rd com.apple.quarantine /Applications/Atrium.app",
  "",
  "On macOS, if the first launch says the app is damaged, run:",
  "",
  "xattr -rd com.apple.quarantine /Applications/Atrium.app",
].join("\n");

export function releaseNotesBody(tagMessage) {
  const notes = String(tagMessage ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  const found = new Set();
  for (const match of notes.matchAll(SECTION)) {
    if (match[2].trim()) found.add(match[1]);
  }
  for (const language of ["en", "zh"]) {
    if (!found.has(language)) {
      throw new Error(
        `Tag message must include a non-empty <!-- atrium:notes:${language} --> section. Create the tag with: node scripts/tag-release.mjs vX.Y.Z --en-file notes.en.txt --zh-file notes.zh.txt`,
      );
    }
  }
  if (notes.includes("xattr -rd com.apple.quarantine")) {
    return `${notes}\n`;
  }
  return `${notes}\n\n${MACOS_INSTALL_NOTE}\n`;
}

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
}

export function collectReleaseNotes(root, tag) {
  versionFromTag(tag);
  const ref = `refs/tags/${tag}`;
  const listed = git(root, ["tag", "--list", tag]).trim();
  if (!listed) {
    throw new Error(`Tag ${tag} does not exist.`);
  }
  const objectType = git(root, [
    "for-each-ref",
    ref,
    "--format=%(objecttype)",
  ]).trim();
  if (objectType !== "tag") {
    throw new Error(
      `Tag ${tag} is lightweight. Create an annotated tag with: node scripts/tag-release.mjs ${tag} --en-file notes.en.txt --zh-file notes.zh.txt`,
    );
  }
  const message = git(root, ["for-each-ref", ref, "--format=%(contents)"]);
  return releaseNotesBody(message);
}

const isDirectRun =
  process.argv[1] !== undefined &&
  normalize(fileURLToPath(import.meta.url)) ===
    normalize(resolve(process.argv[1]));

if (isDirectRun) {
  const tag = process.env.RELEASE_TAG || process.argv[2];
  if (!tag) {
    console.error("Set RELEASE_TAG or pass a tag like v1.2.3.");
    process.exit(1);
  }
  let body;
  try {
    body = collectReleaseNotes(process.cwd(), tag);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    const delimiter = `NOTES_${crypto.randomUUID().replaceAll("-", "")}`;
    appendFileSync(output, `body<<${delimiter}\n${body}${delimiter}\n`);
  }
  process.stdout.write(body);
}
