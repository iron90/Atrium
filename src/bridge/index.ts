import type { AtriumBridge } from "./bridge-interface";
import { createBridge } from "./create";
import { isTauriRuntime } from "./runtime";

export { createBridge, isTauriRuntime };
export type { AtriumBridge } from "./bridge-interface";

export const bridge: AtriumBridge = createBridge();

export type * from "./types";
