import { defaultCache } from "@serwist/turbopack/worker";
import type {
  PrecacheEntry,
  RouteMatchCallbackOptions,
  RuntimeCaching,
  SerwistGlobalConfig,
} from "serwist";
import { Serwist } from "serwist";

const sameOriginCache: RuntimeCaching[] = defaultCache
  .filter((rule) => {
    if (typeof rule.handler !== "object" || !("cacheName" in rule.handler)) {
      return true;
    }
    return rule.handler.cacheName !== "cross-origin";
  })
  .map((rule) => {
    const originalMatcher = rule.matcher;
    return {
      ...rule,
      matcher: (params: RouteMatchCallbackOptions) => {
        // Never handle cross-origin requests (e.g. API on a different port)
        if (!params.sameOrigin) return false;
        if (originalMatcher instanceof RegExp) {
          return originalMatcher.test(params.url.href);
        }
        if (typeof originalMatcher === "function") {
          return originalMatcher(params);
        }
        return false;
      },
    };
  });

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  clientsClaim: true,
  fallbacks: {
    entries: [
      {
        matcher({ request }) {
          return request.destination === "document";
        },
        url: "/offline",
      },
    ],
  },
  navigationPreload: true,
  precacheEntries: self.__SW_MANIFEST,
  runtimeCaching: sameOriginCache,
  skipWaiting: true,
});

serwist.addEventListeners();
