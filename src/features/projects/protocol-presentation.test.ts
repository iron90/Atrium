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

  it("uses the not-connected state for an incomplete integration", () => {
    const view = protocolViewModel({
      ...baseProject,
      protocol: {
        ...baseProject.protocol,
        manifestStatus: "missing",
        capabilities: baseProject.protocol.capabilities.map((capability) => ({
          ...capability,
          status: capability.id === "identity" ? "legacy" : "missing",
        })),
      },
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
    expect(view.needsUpdate).toBe(false);
    expect(view.shouldShowGuidance).toBe(false);
  });

  it("marks an older protocol schema for update", () => {
    const view = protocolViewModel({
      ...baseProject,
      protocol: {
        ...baseProject.protocol,
        needsUpdate: true,
        capabilities: baseProject.protocol.capabilities.map((capability) => ({
          ...capability,
          status: "configured",
        })),
      },
    });

    expect(view.isReady).toBe(true);
    expect(view.cardStatus).toBe("needs-update");
    expect(view.needsUpdate).toBe(true);
    expect(view.shouldShowGuidance).toBe(true);
  });

  it("marks a complete protocol for update when Agent guidance is stale", () => {
    const view = protocolViewModel({
      ...baseProject,
      guidance: { revision: 0, needsUpdate: true, needsSync: true },
      protocol: {
        ...baseProject.protocol,
        capabilities: baseProject.protocol.capabilities.map((capability) => ({
          ...capability,
          status: "configured",
        })),
      },
    });

    expect(view.isReady).toBe(true);
    expect(view.cardStatus).toBe("needs-update");
    expect(view.shouldShowGuidance).toBe(true);
  });

  it("keeps the three-state protocol card current while exposing pending host verification", () => {
    const view = protocolViewModel({
      ...baseProject,
      buildProfiles: baseProject.buildProfiles.map((profile) => ({
        ...profile,
        unverifiedActions: ["build"],
      })),
      protocol: {
        ...baseProject.protocol,
        capabilities: baseProject.protocol.capabilities.map((capability) => ({
          ...capability,
          status: "configured",
        })),
      },
    });

    expect(view.cardStatus).toBe("configured");
    expect(view.needsUpdate).toBe(false);
    expect(view.hasPendingHostVerification).toBe(true);
    expect(view.shouldShowGuidance).toBe(true);
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
    expect(view.cardStatus).toBe("missing");
    expect(view.shouldShowGuidance).toBe(true);
  });
});
