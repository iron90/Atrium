import type { RunFinished } from "../bridge";

export type WorkspaceMessage =
  | { type: "projects"; count: number }
  | { type: "workspaceUpdated"; count: number }
  | { type: "scanning" }
  | { type: "projectRefreshed" };

export type RunMessage =
  | { type: "cancelled" }
  | { type: "demo"; displayCommand: string }
  | {
      type: "finished";
      displayCommand: string;
      status: RunFinished["status"];
    };

export type ActivityMessage = RunMessage | WorkspaceMessage;
