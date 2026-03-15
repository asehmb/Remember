import type { RememberAPI } from "@/shared/types";

declare global {
  interface Window {
    remember: RememberAPI;
  }
}

export {};
