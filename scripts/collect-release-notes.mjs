import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { versionFromTag } from "./stamp-release-version.mjs";

function tagParts(tag) {
  try {
    return versionFromTag(tag).split(".").map(Number);
  } catch {
    return null;
  }
}

function compareParts(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function previousReleaseTag(tags, current) {
  const currentParts = tagParts(current);
  if (!currentParts) {
    throw new Error(`Tag "${current}" must look like v1.2.3.`);
  }
  let best = null;
  let bestParts = null;
  for (const tag of tags) {
    const parts = tagParts(tag);
    if (!parts || compareParts(parts, currentParts) >= 0) continue;
    if (!bestParts || compareParts(parts, bestParts) > 0) {
      best = tag;
      bestParts = parts;
    }
  }
  return best;
}

export function releaseNotesBody(subjects) {
  const changes = subjects.map((subject) => subject.trim()).filter(Boolean);
  const summary =
    changes.length > 0 ? changes.join("\n\n") : "No changes recorded.";
  return `${summary}\n`;
}

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
}

export function collectReleaseNotes(root, tag) {
  versionFromTag(tag);
  const tags = git(root, ["tag", "--list", "v*", "--merged", tag])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const previous = previousReleaseTag(tags, tag);
  const range = previous ? `${previous}..${tag}` : tag;
  const subjects = git(root, ["log", "--no-merges", "--format=%s", range])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return releaseNotesBody(subjects);
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
  const body = collectReleaseNotes(process.cwd(), tag);
  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    const delimiter = `NOTES_${crypto.randomUUID().replaceAll("-", "")}`;
    appendFileSync(output, `body<<${delimiter}\n${body}${delimiter}\n`);
  }
  process.stdout.write(body);
}
