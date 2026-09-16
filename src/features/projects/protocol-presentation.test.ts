import { describe, expect, it } from "vitest";
import { demoSnapshot } from "../../bridge/fake-bridge";
import { protocolViewModel } from "./protocol-presentation";

const baseProject = demoSnapshot("/workspace").projects[0];

describe("protocol view model", () => {
  it("requires a configured manifest before trusting the protocol", () => {
    const view = protocolViewModel({
      ...baseProject,
      protocol: { ...baseProject.protocol, manifestStatus: "missing" },
    });

    expect(view.isReady).toBe(false);
    expect(view.cardStatus).toBe("missing");
    expect(view.shouldShowGuidance).toBe(true);
  });

  it("keeps a complete protocol quiet when every capability is configured", () => {
    const view = protocolViewModel({
      ...baseProject,
      protocol: {
        ...baseProject.protocol,
        capabilities: baseProject.protocol.capabilities.map((capability) => ({
          ...capability,
          status: "configured",
        })),
      },
    });

    expect(view.isReady).toBe(true);
    expect(view.cardStatus).toBe("configured");
    expect(view.shouldShowGuidance).toBe(false);
  });

  it("keeps the protocol ready but asks for guidance when cleanup is invalid", () => {
    const view = protocolViewModel({
      ...baseProject,
      protocol: {
        ...baseProject.protocol,
        capabilities: baseProject.protocol.capabilities.map((capability) => ({
          ...capability,
          status: capability.id === "cleanup" ? "invalid" : "configured",
        })),
      },
    });

    expect(view.isReady).toBe(true);
    expect(view.cardStatus).toBe("partial");
    expect(view.shouldShowGuidance).toBe(true);
  });
});
