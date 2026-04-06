/** mDNS/Bonjour service browser for discovering ScholarMind backends. */

import { Platform } from "react-native";

const SERVICE_NAME = "scholarmind";
const SERVICE_PROTOCOL = "tcp";
const SERVICE_DOMAIN = "local.";
const FULL_SERVICE_TYPE = `_${SERVICE_NAME}._${SERVICE_PROTOCOL}.${SERVICE_DOMAIN}`;

type MdnsBrowserEvent = "start" | "stop" | "found" | "remove" | "error";
type MdnsListener = (payload?: unknown) => void;

/**
 * Represents a discovered mDNS service.
 */
export interface MdnsServiceInfo {
  name: string;
  fullName: string;
  host: string;
  port: number;
  addresses?: string[];
  txt?: Record<string, string | string[] | null>;
}

/**
 * Browser state for discovered services.
 */
interface BrowserState {
  services: Map<string, MdnsServiceInfo>;
  resolved: Set<string>;
}

/**
 * mDNS service browser singleton for ScholarMind.
 *
 * Emits events:
 * - "start": When scanning starts
 * - "stop": When scanning stops
 * - "found": When a device is discovered (MdnsServiceInfo)
 * - "remove": When a device is no longer visible
 * - "error": On scanning errors
 */
class MdnsBrowser {
  private zeroconf: any;
  private scanning = false;
  private state: BrowserState = {
    services: new Map(),
    resolved: new Set(),
  };
  private listeners: Record<MdnsBrowserEvent, Set<MdnsListener>> = {
    start: new Set(),
    stop: new Set(),
    found: new Set(),
    remove: new Set(),
    error: new Set(),
  };

  constructor() {
    try {
      const ZeroconfModule = require("react-native-zeroconf");
      this.zeroconf = new ZeroconfModule.default();
      this.setupListeners();
    } catch (e) {
      console.warn("[mDNS] react-native-zeroconf not available:", e);
    }
  }

  private setupListeners() {
    if (!this.zeroconf) return;

    this.zeroconf.on("start", () => {
      this.scanning = true;
      this.emit("start");
    });

    this.zeroconf.on("stop", () => {
      this.scanning = false;
      this.emit("stop");
    });

    this.zeroconf.on("found", (serviceName: string) => {
      this.state.services.set(serviceName, {
        name: serviceName,
        fullName: serviceName,
        host: "",
        port: 0,
        addresses: [],
      });
    });

    this.zeroconf.on("resolved", (service: MdnsServiceInfo) => {
      const normalized = normalizeService(service);
      this.state.services.set(normalized.name, normalized);
      this.state.resolved.add(normalized.name);
      this.emit("found", normalized);
    });

    this.zeroconf.on("remove", (serviceName: string) => {
      const service = this.state.services.get(serviceName);
      this.state.services.delete(serviceName);
      this.state.resolved.delete(serviceName);
      if (service) {
        this.emit("remove", service);
      }
    });

    this.zeroconf.on("error", (error: Error) => {
      this.emit("error", error);
    });
  }

  start(): void {
    if (!this.zeroconf || this.scanning) {
      return;
    }
    this.state.services.clear();
    this.state.resolved.clear();
    if (Platform.OS === "android") {
      this.zeroconf.scan(SERVICE_NAME, SERVICE_PROTOCOL, SERVICE_DOMAIN, "DNSSD");
      return;
    }
    this.zeroconf.scan(SERVICE_NAME, SERVICE_PROTOCOL, SERVICE_DOMAIN);
  }

  stop(): void {
    if (!this.zeroconf || !this.scanning) {
      return;
    }
    if (Platform.OS === "android") {
      this.zeroconf.stop("DNSSD");
      return;
    }
    this.zeroconf.stop();
  }

  getServices(): MdnsServiceInfo[] {
    return Array.from(this.state.services.values()).filter(
      (s) => this.state.resolved.has(s.name)
    );
  }

  isScanning(): boolean {
    return this.scanning;
  }

  on(event: MdnsBrowserEvent, listener: MdnsListener): void {
    this.listeners[event].add(listener);
  }

  off(event: MdnsBrowserEvent, listener: MdnsListener): void {
    this.listeners[event].delete(listener);
  }

  private emit(event: MdnsBrowserEvent, payload?: unknown): void {
    for (const listener of this.listeners[event]) {
      listener(payload);
    }
  }

  destroy(): void {
    this.stop();
    this.zeroconf?.removeDeviceListeners?.();
    for (const event of Object.keys(this.listeners) as MdnsBrowserEvent[]) {
      this.listeners[event].clear();
    }
  }
}

function normalizeTxt(
  txt?: Record<string, string | string[] | null>
): Record<string, string | string[] | null> {
  if (!txt) {
    return {};
  }
  return txt;
}

function normalizeService(service: MdnsServiceInfo): MdnsServiceInfo {
  return {
    ...service,
    host: stripTrailingDot(service.host || ""),
    fullName: service.fullName || service.name,
    addresses: Array.isArray(service.addresses) ? service.addresses : [],
    txt: normalizeTxt(service.txt),
  };
}

function stripTrailingDot(value: string): string {
  return value.endsWith(".") ? value.slice(0, -1) : value;
}

function scoreAddress(address: string): number {
  if (/^192\.168\./.test(address)) return 5;
  if (/^10\./.test(address)) return 4;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) return 3;
  if (/^127\./.test(address)) return 2;
  if (/^169\.254\./.test(address)) return -1;
  if (address.includes(":")) return 0;
  return 1;
}

function pickBestAddress(service: MdnsServiceInfo): string {
  const candidates = [...(service.addresses ?? [])]
    .map((item) => stripTrailingDot(item))
    .filter(Boolean)
    .sort((left, right) => scoreAddress(right) - scoreAddress(left));

  if (candidates.length > 0) {
    return candidates[0];
  }

  return stripTrailingDot(service.host || "");
}

// Singleton instance
let mdnsBrowserInstance: MdnsBrowser | null = null;

export function getMdnsBrowser(): MdnsBrowser | null {
  if (!mdnsBrowserInstance) {
    try {
      mdnsBrowserInstance = new MdnsBrowser();
    } catch (e) {
      console.warn("[mDNS] Failed to create browser:", e);
      return null;
    }
  }
  return mdnsBrowserInstance;
}

export function serviceToDiscoveredDevice(service: MdnsServiceInfo) {
  const txt = service.txt ?? {};
  const host = pickBestAddress(service);
  const deviceId = (txt.id as string) || service.name.split(".")[0] || host || "unknown";
  const displayName = (txt.name as string) || host || "ScholarMind Device";
  const fingerprint = (txt.fpr as string) || "";
  const scheme = typeof txt.scheme === "string" && txt.scheme ? txt.scheme : "http";
  const url = `${scheme}://${host}:${service.port}`;

  return {
    name: service.name,
    host,
    addresses: service.addresses ?? [],
    port: service.port,
    deviceId,
    fingerprint,
    fullName: service.fullName,
    url,
    displayName,
    apiPath: typeof txt.api === "string" ? txt.api : undefined,
    wsPath: typeof txt.ws === "string" ? txt.ws : undefined,
    healthPath: typeof txt.health === "string" ? txt.health : undefined,
    role: typeof txt.role === "string" ? txt.role : undefined,
    version: typeof txt.ver === "string" ? txt.ver : undefined,
  };
}

export { MdnsBrowser };
export { FULL_SERVICE_TYPE };
