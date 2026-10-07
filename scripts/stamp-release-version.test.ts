import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  stampReleaseVersion,
  versionFromTag,
} from "./stamp-release-version.mjs";

describe("versionFromTag", () => {
  it("reads a release tag", () => {
    expect(versionFromTag("v0.3.2")).toBe("0.3.2");
  });

  it("rejects tags that are not a plain release version", () => {
    expect(() => versionFromTag("0.3.2")).toThrow(/v1\.2\.3/);
    expect(() => versionFromTag("v0.3")).toThrow(/v1\.2\.3/);
    expect(() => versionFromTag("v0.3.2-rc.1")).toThrow(/v1\.2\.3/);
    expect(() => versionFromTag('v0.3.2"; rm')).toThrow(/v1\.2\.3/);
  });
});

describe("stampReleaseVersion", () => {
  it("writes the tag into the package manifests and leaves dependency versions", () => {
    const root = mkdtempSync(join(tmpdir(), "atrium-stamp-"));
    mkdirSync(join(root, "src-tauri"));
    writeFileSync(
      join(root, "package.json"),
      '{\n  "name": "atrium",\n  "version": "0.0.0"\n}\n',
    );
    writeFileSync(
      join(root, "package-lock.json"),
      [
        "{",
        '  "name": "atrium",',
        '  "version": "0.0.0",',
        '  "packages": {',
        '    "": {',
        '      "name": "atrium",',
        '      "version": "0.0.0"',
        "    },",
        '    "node_modules/left-alone": {',
        '      "version": "1.2.3"',
        "    }",
        "  }",
        "}",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(root, "src-tauri/tauri.conf.json"),
      '{\n  "productName": "Atrium",\n  "version": "0.0.0"\n}\n',
    );
    writeFileSync(
      join(root, "src-tauri/Cargo.toml"),
      [
        "[package]",
        'name = "atrium"',
        'version = "0.0.0"',
        "",
        "[dependencies]",
        'tauri = { version = "=2.11.5", features = [] }',
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(root, "src-tauri/Cargo.lock"),
      [
        "[[package]]",
        'name = "atrium"',
        'version = "0.0.0"',
        "",
        "[[package]]",
        'name = "other"',
        'version = "0.0.0"',
        "",
      ].join("\n"),
    );

    expect(stampReleaseVersion(root, "v1.4.5")).toBe("1.4.5");

    expect(
      JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version,
    ).toBe("1.4.5");
    const lock = JSON.parse(
      readFileSync(join(root, "package-lock.json"), "utf8"),
    );
    expect(lock.version).toBe("1.4.5");
    expect(lock.packages[""].version).toBe("1.4.5");
    expect(lock.packages["node_modules/left-alone"].version).toBe("1.2.3");
    expect(
      JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"))
        .version,
    ).toBe("1.4.5");
    const cargoToml = readFileSync(join(root, "src-tauri/Cargo.toml"), "utf8");
    expect(cargoToml).toContain('version = "1.4.5"');
    expect(cargoToml).toContain('version = "=2.11.5"');
    const cargoLock = readFileSync(join(root, "src-tauri/Cargo.lock"), "utf8");
    expect(cargoLock).toContain('name = "atrium"\nversion = "1.4.5"');
    expect(cargoLock).toContain('name = "other"\nversion = "0.0.0"');
  });
});
