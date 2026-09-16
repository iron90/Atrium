import { describe, expect, it, vi } from "vitest";
import { bridge } from "../../bridge";
import { demoSnapshot } from "../../bridge/fake-bridge";
import { openProjectAction } from "./project-actions";

const project = demoSnapshot("/workspace").projects[0];

describe("project actions", () => {
  it("dispatches directory and terminal actions to the bridge", async () => {
    const openDirectory = vi
      .spyOn(bridge, "openProjectDirectory")
      .mockResolvedValue(undefined);
    const openTerminal = vi
      .spyOn(bridge, "openProjectTerminal")
      .mockResolvedValue(undefined);

    await openProjectAction("directory", project);
    await openProjectAction("terminal", project);

    expect(openDirectory).toHaveBeenCalledWith(project.path);
    expect(openTerminal).toHaveBeenCalledWith(project.path, null);
    openDirectory.mockRestore();
    openTerminal.mockRestore();
  });

  it("does not invoke optional actions without their required facts", async () => {
    const projectWithoutOptionalFacts = {
      ...project,
      repo: null,
      links: [],
    };
    const openRemote = vi
      .spyOn(bridge, "openProjectRemote")
      .mockResolvedValue(undefined);
    const openLink = vi
      .spyOn(bridge, "openProjectLink")
      .mockResolvedValue(undefined);

    await openProjectAction("remote", projectWithoutOptionalFacts);
    await openProjectAction("link", projectWithoutOptionalFacts);

    expect(openRemote).not.toHaveBeenCalled();
    expect(openLink).not.toHaveBeenCalled();
    openRemote.mockRestore();
    openLink.mockRestore();
  });
});
