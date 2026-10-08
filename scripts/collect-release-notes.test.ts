import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectReleaseNotes,
  previousReleaseTag,
  releaseNotesBody,
} from "./collect-release-notes.mjs";

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

describe("previousReleaseTag", () => {
  it("picks the nearest older release tag", () => {
    expect(
      previousReleaseTag(
        ["v0.3.1", "v0.10.0", "v0.3.3", "v0.3.2", "v0.3.2-rc.1", "notes"],
        "v0.3.3",
      ),
    ).toBe("v0.3.2");
  });

  it("returns nothing when the tag is the first release", () => {
    expect(previousReleaseTag(["v0.1.0"], "v0.1.0")).toBeNull();
  });
});

describe("releaseNotesBody", () => {
  it("lists commit subjects without an install note", () => {
    expect(
      releaseNotesBody([
        "fix: suppress the console",
        "  ",
        "style: format the path",
      ]),
    ).toBe("fix: suppress the console\n\nstyle: format the path\n");
  });

  it("records an empty range", () => {
    expect(releaseNotesBody([])).toBe("No changes recorded.\n");
  });
});

describe("collectReleaseNotes", () => {
  it("reads subjects after the previous tag and skips merge commits", () => {
    const root = mkdtempSync(join(tmpdir(), "atrium-notes-"));
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "notes@example.com"]);
    git(root, ["config", "user.name", "Notes"]);
    writeFileSync(join(root, "file.txt"), "one\n");
    git(root, ["add", "file.txt"]);
    git(root, ["commit", "-m", "feat: first"], "2026-01-01T00:00:00Z");
    git(root, ["tag", "v0.1.0"]);
    writeFileSync(join(root, "file.txt"), "two\n");
    git(root, ["add", "file.txt"]);
    git(root, ["commit", "-m", "fix: second"], "2026-01-02T00:00:00Z");
    git(root, ["tag", "v0.2.0"]);
    writeFileSync(join(root, "file.txt"), "three\n");
    git(root, ["add", "file.txt"]);
    git(root, ["commit", "-m", "fix: third"], "2026-01-03T00:00:00Z");
    git(root, ["checkout", "-b", "side"]);
    writeFileSync(join(root, "file.txt"), "four\n");
    git(root, ["add", "file.txt"]);
    git(root, ["commit", "-m", "fix: side"], "2026-01-04T00:00:00Z");
    git(root, ["checkout", "main"]);
    git(
      root,
      ["merge", "--no-ff", "side", "-m", "Merge side"],
      "2026-01-05T00:00:00Z",
    );
    git(root, ["tag", "v0.3.0"]);

    const body = collectReleaseNotes(root, "v0.3.0");

    expect(body).toBe("fix: side\n\nfix: third\n");
    expect(body).not.toContain("feat: first");
    expect(body).not.toContain("fix: second");
    expect(body).not.toContain("Merge side");
  });
});
