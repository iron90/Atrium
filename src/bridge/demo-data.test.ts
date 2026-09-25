import { describe, expect, it } from "vitest";
import { demoSnapshot } from "./demo-data";
import type { ProjectSnapshot } from "./types";

const REQUIRED_PROJECT_KEYS: (keyof ProjectSnapshot)[] = [
  "id",
  "name",
  "path",
  "iconConformance",
  "protocol",
  "guidance",
  "repo",
  "tools",
  "links",
  "platforms",
  "channels",
  "buildProfiles",
  "configuration",
  "commands",
  "cleanup",
  "scannedAt",
];

describe("demo snapshot", () => {
  it("derives command working directories from each preview project", () => {
    const snapshot = demoSnapshot("/preview");

    snapshot.projects.forEach((project) => {
      expect(
        project.commands.every(
          (command) => command.workingDirectory === project.path,
        ),
      ).toBe(true);
    });
  });

  it("keeps every preview project aligned with the bridge contract", () => {
    const snapshot = demoSnapshot("/preview");

    snapshot.projects.forEach((project) => {
      REQUIRED_PROJECT_KEYS.forEach((key) => {
        expect(
          project[key] !== undefined,
          `${project.id} is missing ${String(key)}`,
        ).toBe(true);
      });
    });
  });
});
