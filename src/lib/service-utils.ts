import {
  SERVICE_ROLES,
  type CommandResult,
  type ServiceDefinition,
  type ServiceName,
  type ServiceRole,
  type ServiceStatus,
} from "../types/stack";

export function getPreviewStatuses(
  services: ServiceDefinition[],
  windowsMode = false,
): ServiceStatus[] {
  return services.map((service) => ({
    name: service.name,
    label: service.label,
    activeState: "unknown",
    enabledState: null,
    ok: false,
    message: windowsMode
      ? "Windows preset selected. systemd service controls are disabled."
      : "Desktop runtime required for systemd status.",
  }));
}

export function isServiceDefinitions(value: unknown): value is ServiceDefinition[] {
  if (!Array.isArray(value) || value.length !== SERVICE_ROLES.length) {
    return false;
  }

  return value.every((service) => {
    if (!service || typeof service !== "object") {
      return false;
    }

    const candidate = service as Partial<ServiceDefinition>;
    return (
      typeof candidate.name === "string" &&
      typeof candidate.label === "string" &&
      SERVICE_ROLES.includes(candidate.role as ServiceRole)
    );
  });
}

export function getServiceLabel(
  services: ServiceDefinition[],
  serviceName: ServiceName,
) {
  return (
    services.find((service) => service.name === serviceName)?.label ||
    serviceName
  );
}

export function isValidServiceUnitName(name: string) {
  return /^[A-Za-z0-9_.@:-]+$/.test(name.trim());
}

export function normalizeServiceDefinitions(services: ServiceDefinition[]) {
  return services.map((service) => ({
    ...service,
    name: service.name.trim(),
    label: service.label.trim(),
  }));
}

export function validateServiceDefinitions(services: ServiceDefinition[]) {
  const normalizedServices = normalizeServiceDefinitions(services);

  for (const service of normalizedServices) {
    if (!service.name || !isValidServiceUnitName(service.name)) {
      return {
        ok: false,
        message:
          "Service unit names may only contain letters, numbers, dots, dashes, underscores, colons, and @.",
        services: normalizedServices,
      };
    }
  }

  return { ok: true, message: "", services: normalizedServices };
}

export function describeCommandResult(result: CommandResult) {
  if (result.stderr) {
    return result.stderr;
  }

  if (result.stdout) {
    return result.stdout;
  }

  if (result.code !== null) {
    return `Command exited with code ${result.code}.`;
  }

  return "Command finished without output.";
}

export function normalizeStatus(state: string) {
  const value = state.trim().toLowerCase();

  if (value === "active" || value === "inactive" || value === "failed") {
    return value;
  }

  return "unknown";
}
