/** Device discovery types for ScholarMind mDNS. */

export type DiscoveryStatus = "idle" | "scanning" | "stopped" | "error";

export interface DiscoveredDevice {
  /** Service name (full mDNS name) */
  name: string;
  /** Device hostname */
  host: string;
  /** API port */
  port: number;
  /** Unique device identifier */
  deviceId: string;
  /** Device fingerprint for verification */
  fingerprint: string;
  /** Full service name including type */
  fullName: string;
  /** Constructed HTTP URL */
  url: string;
  /** Device display name from TXT records */
  displayName: string;
}

export interface DiscoveryState {
  /** Current scanning status */
  status: DiscoveryStatus;
  /** List of discovered devices */
  devices: DiscoveredDevice[];
  /** Error message if status is 'error' */
  error?: string;
}

export interface MdnsServiceInfo {
  /** Service name */
  name: string;
  /** Full service name including type */
  fullName: string;
  /** Host address */
  host: string;
  /** Service port */
  port: number;
  /** TXT records as key-value pairs */
  txt?: Record<string, string | string[] | null>;
}
