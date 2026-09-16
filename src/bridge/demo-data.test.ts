import { describe, expect, it } from "vitest";
import { demoSnapshot } from "./demo-data";

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
});
