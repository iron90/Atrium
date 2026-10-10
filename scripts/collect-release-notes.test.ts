import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectReleaseNotes,
  releaseNotesBody,
} from "./collect-release-notes.mjs";
import { createReleaseTag, formatTagMessage } from "./tag-release.mjs";

const git = (root: string, args: string[], date?: string) => {
  execFileSync("git", args, {
    cwd: root,
    stdio: "ignore",
    env: date
      ? {
          ...process.env,
          GIT_AUTHOR_DATE: date,
          GIT_COMMITTER_DATE: date,
        }
      : process.env,
  });
};

const marked = formatTagMessage(
  "Settings on macOS now includes Update now.",
  "macOS 的设置页现在也会显示「立即更新」。",
);

describe("releaseNotesBody", () => {
  it("groups each language with its install note and puts English first", () => {
    const body = releaseNotesBody(marked);
    const english = body.indexOf("## English");
    const englishLaunch = body.indexOf("### After a browser download");
    const chinese = body.indexOf("## 中文");
    const chineseLaunch = body.indexOf("### 从浏览器下载后");

    expect(english).toBeGreaterThanOrEqual(0);
    expect(english).toBeLessThan(body.indexOf("Settings on macOS"));
    expect(body.indexOf("Settings on macOS")).toBeLessThan(englishLaunch);
    expect(englishLaunch).toBeLessThan(chinese);
    expect(chinese).toBeLessThan(body.indexOf("设置页现在也会显示"));
    expect(body.indexOf("设置页现在也会显示")).toBeLessThan(chineseLaunch);
    expect(body.match(/xattr -rd com\.apple\.quarantine/g)).toHaveLength(2);
  });

  it("does not repeat an install command that was already in the tag message", () => {
    const body = releaseNotesBody(
      `${marked}\n\nxattr -rd com.apple.quarantine /Applications/Atrium.app\n`,
    );
    expect(body.match(/xattr -rd com\.apple\.quarantine/g)).toHaveLength(2);
  });

  it("rejects a message that omits a language", () => {
    expect(() =>
      releaseNotesBody(
        "<!-- atrium:notes:en -->\nEnglish only.\n<!-- /atrium:notes:en -->",
      ),
    ).toThrow(/atrium:notes:zh/);
  });
});

describe("collectReleaseNotes", () => {
  it("reads the annotated tag message and ignores commit subjects", () => {
    const root = mkdtempSync(join(tmpdir(), "atrium-notes-"));
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "notes@example.com"]);
    git(root, ["config", "user.name", "Notes"]);
    writeFileSync(join(root, "file.txt"), "one\n");
    git(root, ["add", "file.txt"]);
    git(root, ["commit", "-m", "feat: first"], "2026-01-01T00:00:00Z");
    createReleaseTag(
      root,
      "v0.1.0",
      "The first public build.",
      "第一个公开发布的版本。",
    );
    writeFileSync(join(root, "file.txt"), "two\n");
    git(root, ["add", "file.txt"]);
    git(root, ["commit", "-m", "fix: second"], "2026-01-02T00:00:00Z");

    const body = collectReleaseNotes(root, "v0.1.0");

    expect(body).toContain("The first public build.");
    expect(body).toContain("第一个公开发布的版本。");
    expect(body).toContain("xattr -rd com.apple.quarantine");
    expect(body).not.toContain("feat: first");
    expect(body).not.toContain("fix: second");
  });

  it("recovers the annotated message when checkout left a lightweight tag", () => {
    const origin = mkdtempSync(join(tmpdir(), "atrium-notes-origin-"));
    git(origin, ["init", "-b", "main"]);
    git(origin, ["config", "user.email", "notes@example.com"]);
    git(origin, ["config", "user.name", "Notes"]);
    writeFileSync(join(origin, "file.txt"), "one\n");
    git(origin, ["add", "file.txt"]);
    git(origin, ["commit", "-m", "feat: first"], "2026-01-01T00:00:00Z");
    createReleaseTag(
      origin,
      "v0.1.0",
      "The first public build.",
      "第一个公开发布的版本。",
    );

    const clone = mkdtempSync(join(tmpdir(), "atrium-notes-clone-"));
    git(clone, ["clone", origin, "."]);
    git(clone, ["tag", "-d", "v0.1.0"]);
    git(clone, ["tag", "v0.1.0"]);

    const body = collectReleaseNotes(clone, "v0.1.0");

    expect(body).toContain("The first public build.");
    expect(body).toContain("第一个公开发布的版本。");
    expect(body).not.toContain("feat: first");
  });

  it("rejects a lightweight tag", () => {
    const root = mkdtempSync(join(tmpdir(), "atrium-notes-"));
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "notes@example.com"]);
    git(root, ["config", "user.name", "Notes"]);
    writeFileSync(join(root, "file.txt"), "one\n");
    git(root, ["add", "file.txt"]);
    git(root, ["commit", "-m", "feat: first"], "2026-01-01T00:00:00Z");
    git(root, ["tag", "v0.1.0"]);

    expect(() => collectReleaseNotes(root, "v0.1.0")).toThrow(/lightweight/);
  });
});
