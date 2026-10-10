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

const markedNotes = [
  "<!-- atrium:notes:en -->",
  "Settings on macOS now includes Update now.",
  "<!-- /atrium:notes:en -->",
  "",
  "<!-- atrium:notes:zh -->",
  "macOS 的设置页现在也会显示「立即更新」。",
  "<!-- /atrium:notes:zh -->",
  "",
  "macOS 首次打开若提示「已损坏」，在终端执行：",
  "",
  "xattr -rd com.apple.quarantine /Applications/Atrium.app",
].join("\n");

describe("localizedReleaseNotes", () => {
  it("returns the english half of a bilingual body", () => {
    expect(localizedReleaseNotes(bilingualNotes, "en")).toBe(
      "Download the installer for your platform from the assets below.",
    );
  });

  it("returns the chinese half of an older bilingual body", () => {
    expect(localizedReleaseNotes(bilingualNotes, "zh")).toBe(
      "从下方资产下载对应平台的安装包。macOS 首次打开若提示“已损坏”，执行一次 xattr。",
    );
  });

  it("returns the marked section for the interface language", () => {
    expect(localizedReleaseNotes(markedNotes, "en")).toBe(
      "Settings on macOS now includes Update now.",
    );
    expect(localizedReleaseNotes(markedNotes, "zh")).toBe(
      "macOS 的设置页现在也会显示「立即更新」。",
    );
  });

  it("returns the notes unchanged when there is no language separator", () => {
    expect(
      localizedReleaseNotes(
        "fix: suppress the console\n\nstyle: format the path",
      ),
    ).toBe("fix: suppress the console\n\nstyle: format the path");
  });

  it("keeps the english half when blank lines surround the separator", () => {
    expect(localizedReleaseNotes(publishedNotes)).not.toContain("从下方资产");
    expect(
      localizedReleaseNotes(publishedNotes.replace(/\n/g, "\r\n")),
    ).toContain("Download the installer");
  });
});

describe("releaseNoteBlocks", () => {
  it("uses the english half and lifts the shell command out of the sentence", () => {
    expect(releaseNoteBlocks(publishedNotes)).toEqual([
      {
        type: "paragraph",
        text: "Download the installer for your platform from the assets below. If macOS reports the app as damaged on first launch, run once:",
      },
      {
        type: "command",
        text: "xattr -rd com.apple.quarantine /Applications/Atrium.app",
      },
    ]);
  });

  it("leaves commit subjects as separate paragraphs", () => {
    expect(
      releaseNoteBlocks("fix: suppress the console\n\nstyle: format the path"),
    ).toEqual([
      { type: "paragraph", text: "fix: suppress the console" },
      { type: "paragraph", text: "style: format the path" },
    ]);
  });

  it("leaves ordinary sentences as paragraphs", () => {
    expect(releaseNoteBlocks("Bug fixes and a note: read the guide")).toEqual([
      { type: "paragraph", text: "Bug fixes and a note: read the guide" },
    ]);
  });

  it("hides the macOS install command outside the language markers", () => {
    expect(releaseNoteBlocks(markedNotes, "zh")).toEqual([
      {
        type: "paragraph",
        text: "macOS 的设置页现在也会显示「立即更新」。",
      },
    ]);
    expect(releaseNoteBlocks(markedNotes, "en")).toEqual([
      {
        type: "paragraph",
        text: "Settings on macOS now includes Update now.",
      },
    ]);
  });
});
