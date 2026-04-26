import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import {
  describeCommandResult,
  getServiceLabel,
} from "../lib/service-utils";
import {
  actionLabels,
  type CommandResult,
  type PendingAction,
  type ServiceDefinition,
  type ServiceName,
} from "../types/stack";

type UseServiceActionsOptions = {
  runningInTauri: boolean;
  windowsMode: boolean;
  serviceDefinitions: ServiceDefinition[];
  selectedService: ServiceName;
  loadStatuses: () => Promise<void>;
  loadLogs: (service: ServiceName) => Promise<void>;
};

export function useServiceActions({
  runningInTauri,
  windowsMode,
  serviceDefinitions,
  selectedService,
  loadStatuses,
  loadLogs,
}: UseServiceActionsOptions) {
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [isActionRunning, setIsActionRunning] = useState(false);
  const [actionNotice, setActionNotice] = useState("");

  async function runPendingAction() {
    if (!pendingAction) {
      return;
    }

    setIsActionRunning(true);
    setActionNotice("");

    if (!runningInTauri || windowsMode) {
      setActionNotice(
        windowsMode
          ? "Windows preset selected. Use XAMPP Control Panel or Windows services for stack-level service actions."
          : "Service actions require the Tauri desktop runtime.",
      );
      setIsActionRunning(false);
      return;
    }

    try {
      const result = await invoke<CommandResult>("run_service_action", {
        service: pendingAction.service,
        action: pendingAction.action,
      });
      const label = getServiceLabel(serviceDefinitions, pendingAction.service);
      const verb = actionLabels[pendingAction.action].toLowerCase();

      setActionNotice(
        result.success
          ? `${label} ${verb} command completed.`
          : `${label} ${verb} command failed: ${describeCommandResult(result)}`,
      );
      setPendingAction(null);
      await loadStatuses();
      await loadLogs(selectedService);
    } catch (error) {
      setActionNotice(String(error));
    } finally {
      setIsActionRunning(false);
    }
  }

  return {
    pendingAction,
    setPendingAction,
    isActionRunning,
    actionNotice,
    runPendingAction,
  };
}

export type ServiceActionsState = ReturnType<typeof useServiceActions>;
