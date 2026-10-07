import { describe, expect, it } from "vitest";
import { localizedReleaseNotes } from "./format";

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
});
