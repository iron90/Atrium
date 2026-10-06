import type { AtriumBridge } from "./bridge-interface";
import { nativeGitMethods, previewGitMethods } from "./git";
import { nativeProjectMethods, previewProjectMethods } from "./projects";
import { nativeRunMethods, previewRunMethods } from "./runs";
import { isTauriRuntime } from "./runtime";
import { nativeToolMethods, previewToolMethods } from "./tools";
import { nativeUpdateMethods, previewUpdateMethods } from "./update";

export function createBridge(native: boolean = isTauriRuntime()): AtriumBridge {
  if (native) {
    return {
      ...nativeProjectMethods,
      ...nativeRunMethods,
      ...nativeGitMethods,
      ...nativeToolMethods,
      ...nativeUpdateMethods,
    };
  }
  return {
    ...previewProjectMethods,
    ...previewRunMethods,
    ...previewGitMethods,
    ...previewToolMethods,
    ...previewUpdateMethods,
  };
}
