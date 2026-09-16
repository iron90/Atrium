import { describe, expect, it } from "vitest";
import { formatActivityMessage } from "./activity-message";

describe("activity message formatting", () => {
  it("formats workspace lifecycle messages", () => {
    expect(formatActivityMessage({ type: "ready" }, "en")).toBe(
      "Ready to inspect local projects.",
    );
    expect(formatActivityMessage({ type: "projects", count: 4 }, "en")).toBe(
      "4 projects discovered",
    );
    expect(
      formatActivityMessage({ type: "workspaceUpdated", count: 2 }, "en"),
    ).toBe("Workspace updated · 2 projects");
    expect(
      formatActivityMessage({ type: "localized", key: "scanFailed" }, "en"),
    ).toBe("The workspace scan could not be completed.");
    expect(formatActivityMessage({ type: "projectRefreshed" }, "en")).toBe(
      "Project refreshed.",
    );
    expect(formatActivityMessage({ type: "refreshingWorkspace" }, "en")).toBe(
      "Refreshing workspace…",
    );
    expect(formatActivityMessage({ type: "scanning" }, "zh")).toBe(
      "正在扫描工作区并读取仓库事实…",
    );
  });

  it("formats run lifecycle messages with translated action labels", () => {
    expect(
      formatActivityMessage(
        {
          type: "command",
          commandKind: "build",
          label: "native build",
          displayCommand: "npm run build",
        },
        "en",
      ),
    ).toBe("Build · npm run build");
    expect(
      formatActivityMessage(
        { type: "demo", displayCommand: "npm run dev" },
        "en",
      ),
    ).toBe("npm run dev · succeeded");
    expect(
      formatActivityMessage(
        {
          type: "finished",
          displayCommand: "cargo test",
          status: "failed",
        },
        "zh",
      ),
    ).toBe("cargo test · 失败");
    expect(formatActivityMessage({ type: "cancelled" }, "zh")).toBe(
      "已请求取消运行。",
    );
  });
});
