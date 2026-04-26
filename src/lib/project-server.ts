import type { ProjectServerStatus } from "../types/stack";

export function getPreviewProjectServerStatus(): ProjectServerStatus {
  return {
    running: false,
    root: null,
    url: null,
    port: null,
    message: "Desktop runtime required to serve projects.",
  };
}
