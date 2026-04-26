import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { LOG_LINE_COUNT } from "../config/defaults";
import { describeCommandResult, getServiceLabel } from "../lib/service-utils";
import type {
  CommandResult,
  ServiceDefinition,
  ServiceName,
} from "../types/stack";

type UseServiceLogsOptions = {
  setupComplete: boolean;
  runningInTauri: boolean;
  windowsMode: boolean;
  serviceDefinitions: ServiceDefinition[];
};

export function useServiceLogs({
  setupComplete,
  runningInTauri,
  windowsMode,
  serviceDefinitions,
}: UseServiceLogsOptions) {
  const [selectedService, setSelectedService] = useState<ServiceName>(
    serviceDefinitions[0]?.name || "",
  );
  const [logs, setLogs] = useState("");
  const [logsError, setLogsError] = useState("");
  const [isLogsLoading, setIsLogsLoading] = useState(false);

  const loadLogs = useCallback(async (service: ServiceName) => {
    setIsLogsLoading(true);
    setLogsError("");

    if (!runningInTauri || windowsMode) {
      setLogs(
        windowsMode
          ? "journalctl is not available for the Windows preset.\n\nUse XAMPP Control Panel or Windows services for stack-level service logs."
          : `journalctl preview unavailable.\n\nRun this app with the Tauri desktop runtime to read recent ${service} logs.`,
      );
      setIsLogsLoading(false);
      return;
    }

    try {
      const result = await invoke<CommandResult>("get_service_logs", {
        service,
        lines: LOG_LINE_COUNT,
      });

      setLogs(result.stdout || "No recent journal entries.");
      setLogsError(result.success ? "" : describeCommandResult(result));
    } catch (error) {
      setLogs("");
      setLogsError(String(error));
    } finally {
      setIsLogsLoading(false);
    }
  }, [runningInTauri, windowsMode]);

  useEffect(() => {
    if (!serviceDefinitions.some((service) => service.name === selectedService)) {
      setSelectedService(serviceDefinitions[0]?.name || "");
    }
  }, [selectedService, serviceDefinitions]);

  useEffect(() => {
    if (!setupComplete || !selectedService) {
      setLogs("");
      setLogsError("");
      return;
    }

    void loadLogs(selectedService);
  }, [loadLogs, selectedService, setupComplete]);

  const selectedLabel = getServiceLabel(serviceDefinitions, selectedService);

  return {
    selectedService,
    setSelectedService,
    selectedLabel,
    logs,
    logsError,
    isLogsLoading,
    loadLogs,
  };
}

export type ServiceLogsState = ReturnType<typeof useServiceLogs>;
