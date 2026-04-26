import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { POLL_INTERVAL_MS } from "../config/defaults";
import { getPreviewStatuses } from "../lib/service-utils";
import type {
  ServiceDefinition,
  ServiceName,
  ServiceStatus,
} from "../types/stack";

type UseServiceStatusOptions = {
  setupComplete: boolean;
  runningInTauri: boolean;
  windowsMode: boolean;
  serviceDefinitions: ServiceDefinition[];
};

export function useServiceStatus({
  setupComplete,
  runningInTauri,
  windowsMode,
  serviceDefinitions,
}: UseServiceStatusOptions) {
  const [statuses, setStatuses] = useState<ServiceStatus[]>([]);
  const [statusError, setStatusError] = useState("");
  const [isStatusLoading, setIsStatusLoading] = useState(false);

  const loadStatuses = useCallback(async () => {
    setIsStatusLoading(true);
    setStatusError("");

    if (!runningInTauri || windowsMode) {
      setStatuses(getPreviewStatuses(serviceDefinitions, windowsMode));
      setIsStatusLoading(false);
      return;
    }

    try {
      const nextStatuses =
        await invoke<ServiceStatus[]>("get_service_statuses", {
          services: serviceDefinitions,
        });
      setStatuses(nextStatuses);
    } catch (error) {
      setStatusError(String(error));
    } finally {
      setIsStatusLoading(false);
    }
  }, [runningInTauri, serviceDefinitions, windowsMode]);

  useEffect(() => {
    if (!setupComplete) {
      setStatuses([]);
      setStatusError("");
      return;
    }

    void loadStatuses();

    const pollId = window.setInterval(() => {
      void loadStatuses();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(pollId);
  }, [loadStatuses, setupComplete]);

  const activeServiceCount = useMemo(() => {
    return statuses.filter((status) => status.ok).length;
  }, [statuses]);

  const statusByName = useMemo(() => {
    return statuses.reduce<Record<ServiceName, ServiceStatus>>(
      (accumulator, status) => {
        accumulator[status.name] = status;
        return accumulator;
      },
      {},
    );
  }, [statuses]);

  return {
    statuses,
    statusError,
    isStatusLoading,
    activeServiceCount,
    statusByName,
    loadStatuses,
  };
}

export type ServiceStatusState = ReturnType<typeof useServiceStatus>;
