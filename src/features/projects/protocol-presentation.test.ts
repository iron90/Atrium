import { describe, expect, it } from "vitest";
import { demoSnapshot } from "../../bridge/fake-bridge";
import { protocolViewModel } from "./protocol-presentation";

const baseProject = demoSnapshot("/workspace").projects[0];

const withConfiguredCapabilities = (project: typeof baseProject) => ({
  ...project,
  protocol: {
    ...project.protocol,
    capabilities: project.protocol.capabilities.map((capability) => ({
      ...capability,
      status: "configured" as const,
    })),
  },
});

describe("protocol view model", () => {
  it("requires a configured manifest before trusting the protocol", () => {
    const view = protocolViewModel({
      ...baseProject,
      protocol: { ...baseProject.protocol, manifestStatus: "missing" },
    });

    expect(view.isReady).toBe(false);
    expect(view.cardStatus).toBe("missing");
    expect(view.needsGuidance).toBe(true);
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
    expect(view.needsGuidance).toBe(true);
  });

  it("marks a synchronized protocol as integrated", () => {
    const view = protocolViewModel(withConfiguredCapabilities(baseProject));

    expect(view.isReady).toBe(true);
    expect(view.cardStatus).toBe("configured");
    expect(view.needsUpdate).toBe(false);
    expect(view.needsSync).toBe(false);
    expect(view.needsGuidance).toBe(false);
  });

  it("marks an older protocol schema for update", () => {
    const configured = withConfiguredCapabilities(baseProject);
    const view = protocolViewModel({
      ...configured,
      protocol: { ...configured.protocol, needsUpdate: true },
    });

    expect(view.isReady).toBe(true);
    expect(view.cardStatus).toBe("needs-update");
    expect(view.needsUpdate).toBe(true);
    expect(view.needsGuidance).toBe(true);
  });

  it("marks a complete protocol for update when Agent guidance is stale", () => {
    const view = protocolViewModel({
      ...withConfiguredCapabilities(baseProject),
      guidance: { revision: 0, needsUpdate: true, needsSync: true },
    });

    expect(view.isReady).toBe(true);
    expect(view.cardStatus).toBe("needs-update");
    expect(view.needsGuidance).toBe(true);
  });

  it("reports current guidance without an Agent acknowledgement as awaiting sync", () => {
    const view = protocolViewModel({
      ...withConfiguredCapabilities(baseProject),
      guidance: { revision: 1, needsUpdate: false, needsSync: true },
    });

    expect(view.isReady).toBe(true);
    expect(view.cardStatus).toBe("needs-sync");
    expect(view.needsUpdate).toBe(false);
    expect(view.needsSync).toBe(true);
    expect(view.needsGuidance).toBe(true);
  });

  it("keeps pending host verification off the protocol card", () => {
    const view = protocolViewModel({
      ...withConfiguredCapabilities(baseProject),
      buildProfiles: baseProject.buildProfiles.map((profile) => ({
        ...profile,
        unverifiedActions: ["build"],
      })),
    });

    expect(view.cardStatus).toBe("configured");
    expect(view.needsUpdate).toBe(false);
    expect(view.needsGuidance).toBe(false);
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
    expect(view.needsGuidance).toBe(true);
  });
});
