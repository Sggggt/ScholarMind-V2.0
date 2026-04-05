import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    multiSet: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("api helpers", () => {
  it("normalizes backend urls", async () => {
    const { normalizeBackendUrl } = await import("../lib/api");
    expect(normalizeBackendUrl("http://127.0.0.1:8000/")).toBe("http://127.0.0.1:8000");
    expect(normalizeBackendUrl("http://127.0.0.1:8000/api")).toBe("http://127.0.0.1:8000");
  });

  it("infers lan mode for private addresses", async () => {
    const { inferNetworkMode } = await import("../lib/api");
    expect(inferNetworkMode("http://192.168.1.100:8000")).toBe("lan");
    expect(inferNetworkMode("http://127.0.0.1:8000")).toBe("lan");
  });

  it("infers public mode for tunneled addresses", async () => {
    const { inferNetworkMode } = await import("../lib/api");
    expect(inferNetworkMode("https://demo.ngrok-free.app")).toBe("public");
  });
});

describe("types", () => {
  it("exports all module names", async () => {
    const { MODULE_NAMES, MODULE_SEQUENCE } = await import("../lib/types");
    expect(MODULE_SEQUENCE).toHaveLength(9);
    for (const moduleId of MODULE_SEQUENCE) {
      expect(MODULE_NAMES[moduleId]).toBeDefined();
    }
  });
});
