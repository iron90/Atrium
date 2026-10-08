import { describe, expect, it } from "vitest";
import { localizedReleaseNotes, releaseNoteBlocks } from "./format";

const publishedNotes = [
  "从下方资产下载对应平台的安装包。macOS 首次打开若提示“已损坏”，在终端执行一次：xattr -rd com.apple.quarantine /Applications/Atrium.app",
  "",
  "---",
  "",
  "Download the installer for your platform from the assets below. If macOS reports the app as damaged on first launch, run once: xattr -rd com.apple.quarantine /Applications/Atrium.app",
].join("\n");

const bilingualNotes = [
  "从下方资产下载对应平台的安装包。macOS 首次打开若提示“已损坏”，执行一次 xattr。",
  "---",
  "Download the installer for your platform from the assets below.",
].join("\n");

describe("localizedReleaseNotes", () => {
  it("returns the chinese block for the zh interface", () => {
    expect(localizedReleaseNotes(bilingualNotes, "zh")).toBe(
      "从下方资产下载对应平台的安装包。macOS 首次打开若提示“已损坏”，执行一次 xattr。",
    );
  });

  it("returns the english block for the en interface", () => {
    expect(localizedReleaseNotes(bilingualNotes, "en")).toBe(
      "Download the installer for your platform from the assets below.",
    );
  });

  it("returns the notes unchanged when there is no language separator", () => {
    expect(localizedReleaseNotes("Single-language notes", "zh")).toBe(
      "Single-language notes",
    );
  });

  it("splits a published body that leaves blank lines around the separator", () => {
    expect(localizedReleaseNotes(publishedNotes, "zh")).not.toContain(
      "Download the installer",
    );
    expect(
      localizedReleaseNotes(publishedNotes.replace(/\n/g, "\r\n"), "en"),
    ).not.toContain("从下方资产");
  });
});

describe("releaseNoteBlocks", () => {
  it("keeps the current language and lifts the shell command out of the sentence", () => {
    expect(releaseNoteBlocks(publishedNotes, "zh")).toEqual([
      {
        type: "paragraph",
        text: "从下方资产下载对应平台的安装包。macOS 首次打开若提示“已损坏”，在终端执行一次：",
      },
      {
        type: "command",
        text: "xattr -rd com.apple.quarantine /Applications/Atrium.app",
      },
    ]);
    expect(releaseNoteBlocks(publishedNotes, "en")[0]).toEqual({
      type: "paragraph",
      text: "Download the installer for your platform from the assets below. If macOS reports the app as damaged on first launch, run once:",
    });
  });

  it("leaves ordinary sentences as paragraphs", () => {
    expect(
      releaseNoteBlocks("Bug fixes and a note: read the guide", "en"),
    ).toEqual([
      { type: "paragraph", text: "Bug fixes and a note: read the guide" },
    ]);
  });
});
