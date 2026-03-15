import type { TagMindAPI } from "@/shared/types";

declare global {
  interface Window {
    tagmind: TagMindAPI;
  }
}

export {};
