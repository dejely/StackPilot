import { useCallback, useMemo, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";

import { AppHeader } from "./components/AppHeader";
import { CommandBar } from "./components/CommandBar";
import { Dashboard } from "./components/Dashboard";
import { PendingActionModal } from "./components/PendingActionModal";
import { SettingsPanel } from "./components/SettingsPanel";
import { SetupScreen } from "./components/SetupScreen";
import { useProjectServer } from "./hooks/useProjectServer";
import { useServiceActions } from "./hooks/useServiceActions";
import { useServiceLogs } from "./hooks/useServiceLogs";
import { useServiceStatus } from "./hooks/useServiceStatus";
import { useStackSettings } from "./hooks/useStackSettings";
import { useTheme } from "./hooks/useTheme";
import { normalizeProjectName } from "./lib/paths";
import type { Page } from "./types/stack";

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const runningInTauri = useMemo(() => isTauri(), []);
  const theme = useTheme();
  const stack = useStackSettings();
  const showSettings = useCallback(() => setPage("settings"), []);

  const project = useProjectServer({
    setupComplete: stack.setupComplete,
    runningInTauri,
    windowsMode: stack.current.windowsMode,
    projectRoot: stack.current.projectRoot,
    projectName: stack.current.projectName,
    phpMyAdminUrl: stack.current.phpMyAdminUrl,
    xamppMode: stack.current.xamppMode,
    onSettingsNeeded: showSettings,
  });

  const serviceStatus = useServiceStatus({
    setupComplete: stack.setupComplete,
    runningInTauri,
    windowsMode: stack.current.windowsMode,
    serviceDefinitions: stack.current.serviceDefinitions,
  });

  const serviceLogs = useServiceLogs({
    setupComplete: stack.setupComplete,
    runningInTauri,
    windowsMode: stack.current.windowsMode,
    serviceDefinitions: stack.current.serviceDefinitions,
  });

  const serviceActions = useServiceActions({
    runningInTauri,
    windowsMode: stack.current.windowsMode,
    serviceDefinitions: stack.current.serviceDefinitions,
    selectedService: serviceLogs.selectedService,
    loadStatuses: serviceStatus.loadStatuses,
    loadLogs: serviceLogs.loadLogs,
  });

  function saveSettings() {
    const didSave = stack.actions.saveStackSettings();

    if (didSave) {
      project.clearOpenError();
    }
  }

  function resetSettings() {
    stack.actions.resetStackSettings();
    project.clearOpenError();
  }

  async function completeSetup(openAfterSave = false) {
    const targetProjectRoot = stack.draft.projectRoot.trim();
    const targetProjectName = normalizeProjectName(stack.draft.projectName);
    const targetXamppMode = stack.draft.xamppMode;
    const targetWindowsMode = stack.draft.windowsMode;
    const didSave = stack.actions.saveStackSettings(true);

    if (!didSave) {
      return;
    }

    project.clearOpenError();

    if (openAfterSave) {
      await project.openConfiguredProject({
        projectRoot: targetProjectRoot,
        projectName: targetProjectName,
        xamppMode: targetXamppMode,
        windowsMode: targetWindowsMode,
        redirectToSettingsOnError: false,
      });
    }
  }

  if (!stack.setupComplete) {
    return (
      <SetupScreen
        isProjectServerLoading={project.isProjectServerLoading}
        onCompleteSetup={(openAfterSave) => void completeSetup(openAfterSave)}
        openError={project.openError}
        stack={stack}
        theme={theme}
      />
    );
  }

  return (
    <main className="app-shell">
      <AppHeader
        activePresetName={stack.current.activePreset.name}
        page={page}
        setPage={setPage}
        theme={theme}
      />

      {!runningInTauri ? (
        <p className="notice warning">
          Browser preview mode: systemd, journalctl, pkexec, and local folder
          actions are available only inside the Tauri desktop runtime.
        </p>
      ) : null}
      {stack.current.windowsMode ? (
        <p className="notice warning">
          Windows preset is active. StackPilot will use XAMPP-style paths and
          project serving; systemd service controls are disabled.
        </p>
      ) : null}

      <CommandBar project={project} serviceStatus={serviceStatus} />

      {project.openError ? (
        <p className="notice error">{project.openError}</p>
      ) : null}
      {project.projectServer.running && project.projectServer.url ? (
        <p className="notice">
          Project site running at {project.projectServer.url}
          {project.projectServer.root
            ? ` from ${project.projectServer.root}`
            : ""}.
        </p>
      ) : null}
      {stack.current.xamppMode ? (
        <p className="notice">
          XAMPP mode is active. StackPilot serves {project.xamppProjectRoot} with
          PHP's built-in server. Apache-style route: {project.xamppProjectUrl}.
        </p>
      ) : null}
      {serviceStatus.statusError ? (
        <p className="notice error">{serviceStatus.statusError}</p>
      ) : null}
      {serviceActions.actionNotice ? (
        <p className="notice">{serviceActions.actionNotice}</p>
      ) : null}

      {page === "dashboard" ? (
        <Dashboard
          runningInTauri={runningInTauri}
          serviceActions={serviceActions}
          serviceDefinitions={stack.current.serviceDefinitions}
          serviceLogs={serviceLogs}
          serviceStatus={serviceStatus}
          windowsMode={stack.current.windowsMode}
        />
      ) : (
        <SettingsPanel
          onResetSettings={resetSettings}
          onSaveSettings={saveSettings}
          project={project}
          stack={stack}
          theme={theme}
        />
      )}

      <PendingActionModal
        isActionRunning={serviceActions.isActionRunning}
        onCancel={() => serviceActions.setPendingAction(null)}
        onRun={() => void serviceActions.runPendingAction()}
        pendingAction={serviceActions.pendingAction}
        serviceDefinitions={stack.current.serviceDefinitions}
      />
    </main>
  );
}

export default App;
