import type { ProjectCommand, RunFinished } from "../bridge";

export type WorkspaceMessage =
  | { type: "projects"; count: number }
  | { type: "workspaceUpdated"; count: number }
  | { type: "refreshingWorkspace" }
  | { type: "scanning" }
  | { type: "projectRefreshed" }
  | {
      type: "localized";
      key: "scanFailed" | "refreshFailed";
    };

export type RunMessage =
  | { type: "ready" }
  | {
      type: "localized";
      key: "commandStartFailed";
    }
  | { type: "cancelled" }
  | {
      type: "command";
      commandKind: ProjectCommand["kind"];
      label: string;
      displayCommand: string;
    }
  | { type: "demo"; displayCommand: string }
  | {
      type: "finished";
      displayCommand: string;
      status: RunFinished["status"];
    };

export type ActivityMessage = RunMessage | WorkspaceMessage;
