export const SERVICE_ROLES = ["web", "database", "php"] as const;
export const SERVICE_ACTIONS = ["start", "stop", "restart"] as const;

export type ServiceRole = (typeof SERVICE_ROLES)[number];
export type PresetId = "fedora" | "arch" | "ubuntu" | "debian" | "windows";
export type ServiceName = string;
export type ServiceAction = (typeof SERVICE_ACTIONS)[number];
export type Page = "dashboard" | "settings";
export type SetupStep = "preset" | "project";

export type ServiceDefinition = {
  role: ServiceRole;
  name: string;
  label: string;
};

export type StackPreset = {
  id: PresetId;
  name: string;
  platform: "linux" | "windows";
  projectRoot: string;
  xamppMode: boolean;
  phpMyAdminUrl: string;
  description: string;
  services: ServiceDefinition[];
};

export type ServiceStatus = {
  name: ServiceName;
  label: string;
  activeState: string;
  enabledState?: string | null;
  ok: boolean;
  message: string;
};

export type CommandResult = {
  success: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
};

export type ProjectServerStatus = {
  running: boolean;
  root?: string | null;
  url?: string | null;
  port?: number | null;
  message: string;
};

export type PendingAction = {
  service: ServiceName;
  action: ServiceAction;
};

export const actionLabels: Record<ServiceAction, string> = {
  start: "Start",
  stop: "Stop",
  restart: "Restart",
};
