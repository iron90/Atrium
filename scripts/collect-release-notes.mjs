import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { versionFromTag } from "./stamp-release-version.mjs";

const SECTION =
  /<!--\s*atrium:notes:(en|zh)\s*-->([\s\S]*?)<!--\s*\/atrium:notes:\1\s*-->/g;

const XATTR_COMMAND = "xattr -rd com.apple.quarantine /Applications/Atrium.app";

function markedSection(notes, language) {
  const pattern = new RegExp(
    `<!--\\s*atrium:notes:${language}\\s*-->[\\s\\S]*?<!--\\s*\\/atrium:notes:${language}\\s*-->`,
  );
  const match = notes.match(pattern);
  return match ? match[0].trim() : "";
}

// English block first, then Chinese. Each block keeps the update text inside
// its marker and the first-launch command outside it, so GitHub shows them
// together while the app still reads only the marker.
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
  return [
    "## English",
    "",
    "### Updates",
    "",
    markedSection(notes, "en"),
    "",
    "### First launch",
    "",
    "On macOS, if the first launch says the app is damaged, run:",
    "",
    "```sh",
    XATTR_COMMAND,
    "```",
    "",
    "## 中文",
    "",
    "### 更新说明",
    "",
    markedSection(notes, "zh"),
    "",
    "### 首次打开",
    "",
    "macOS 首次打开若提示「已损坏」，在终端执行：",
    "",
    "```sh",
    XATTR_COMMAND,
    "```",
    "",
  ].join("\n");
}

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
}

function tagObjectType(root, ref) {
  return git(root, ["for-each-ref", ref, "--format=%(objecttype)"]).trim();
}

// actions/checkout leaves a lightweight tag at the same name, which hides the
// annotated message. Replace that local ref with the tag from origin.
function refreshAnnotatedTag(root, ref) {
  try {
    execFileSync("git", ["fetch", "--force", "origin", `${ref}:${ref}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return;
  }
}

export function collectReleaseNotes(root, tag) {
  versionFromTag(tag);
  const ref = `refs/tags/${tag}`;
  let listed = git(root, ["tag", "--list", tag]).trim();
  if (!listed) {
    refreshAnnotatedTag(root, ref);
    listed = git(root, ["tag", "--list", tag]).trim();
  }
  if (!listed) {
    throw new Error(`Tag ${tag} does not exist.`);
  }
  let objectType = tagObjectType(root, ref);
  if (objectType !== "tag") {
    refreshAnnotatedTag(root, ref);
    objectType = tagObjectType(root, ref);
  }
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
