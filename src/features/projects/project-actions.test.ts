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
    expect(openTerminal).toHaveBeenCalledWith(project.path);
    openDirectory.mockRestore();
    openTerminal.mockRestore();
  });

  it("does not open a remote when the project has none", async () => {
    const projectWithoutRemote = {
      ...project,
      repo: null,
    };
    const openRemote = vi
      .spyOn(bridge, "openProjectRemote")
      .mockResolvedValue(undefined);

    await openProjectAction("remote", projectWithoutRemote);

    expect(openRemote).not.toHaveBeenCalled();
    openRemote.mockRestore();
  });
});
