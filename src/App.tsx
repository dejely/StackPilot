import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";

import {
  DEFAULT_THEME_ID,
  UI_THEMES,
  type ThemeId,
  isThemeId,
} from "./themes";

const PROJECT_ROOT_KEY = "stackpilot.projectRoot";
const THEME_KEY = "stackpilot.theme";
const DEFAULT_PROJECT_ROOT = "/var/www/html";
const POLL_INTERVAL_MS = 10_000;
const LOG_LINE_COUNT = 80;

const SERVICE_DEFINITIONS = [
  { name: "httpd", label: "Apache HTTP Server" },
  { name: "mariadb", label: "MariaDB" },
  { name: "php-fpm", label: "PHP-FPM" },
] as const;

const SERVICE_ACTIONS = ["start", "stop", "restart"] as const;

type ServiceName = (typeof SERVICE_DEFINITIONS)[number]["name"];
type ServiceAction = (typeof SERVICE_ACTIONS)[number];

type ServiceStatus = {
  name: ServiceName;
  label: string;
  activeState: string;
  enabledState?: string | null;
  ok: boolean;
  message: string;
};

type CommandResult = {
  success: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
};

type ProjectServerStatus = {
  running: boolean;
  root?: string | null;
  url?: string | null;
  port?: number | null;
  message: string;
};

type PendingAction = {
  service: ServiceName;
  action: ServiceAction;
};

type Page = "dashboard" | "settings";

const actionLabels: Record<ServiceAction, string> = {
  start: "Start",
  stop: "Stop",
  restart: "Restart",
};

const serviceLabels = SERVICE_DEFINITIONS.reduce<Record<ServiceName, string>>(
  (labels, service) => {
    labels[service.name] = service.label;
    return labels;
  },
  {} as Record<ServiceName, string>,
);

function getInitialProjectRoot() {
  return localStorage.getItem(PROJECT_ROOT_KEY) || DEFAULT_PROJECT_ROOT;
}

function getInitialTheme(): ThemeId {
  const savedTheme = localStorage.getItem(THEME_KEY);

  if (isThemeId(savedTheme)) {
    return savedTheme;
  }

  if (savedTheme === "dark") {
    return "midnight";
  }

  return DEFAULT_THEME_ID;
}

function getPreviewStatuses(): ServiceStatus[] {
  return SERVICE_DEFINITIONS.map((service) => ({
    name: service.name,
    label: service.label,
    activeState: "unknown",
    enabledState: null,
    ok: false,
    message: "Desktop runtime required for systemd status.",
  }));
}

function getPreviewProjectServerStatus(): ProjectServerStatus {
  return {
    running: false,
    root: null,
    url: null,
    port: null,
    message: "Desktop runtime required to serve projects.",
  };
}

function isAbsolutePath(path: string) {
  return path.trim().startsWith("/");
}

function describeCommandResult(result: CommandResult) {
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

function normalizeStatus(state: string) {
  const value = state.trim().toLowerCase();

  if (value === "active" || value === "inactive" || value === "failed") {
    return value;
  }

  return "unknown";
}

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [statuses, setStatuses] = useState<ServiceStatus[]>([]);
  const [statusError, setStatusError] = useState("");
  const [isStatusLoading, setIsStatusLoading] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceName>("httpd");
  const [logs, setLogs] = useState("");
  const [logsError, setLogsError] = useState("");
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [isActionRunning, setIsActionRunning] = useState(false);
  const [actionNotice, setActionNotice] = useState("");
  const [projectRoot, setProjectRoot] = useState(getInitialProjectRoot);
  const [draftProjectRoot, setDraftProjectRoot] = useState(projectRoot);
  const [settingsNotice, setSettingsNotice] = useState("");
  const [openError, setOpenError] = useState("");
  const [projectServer, setProjectServer] = useState<ProjectServerStatus>(
    getPreviewProjectServerStatus,
  );
  const [isProjectServerLoading, setIsProjectServerLoading] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(getInitialTheme);
  const runningInTauri = useMemo(() => isTauri(), []);

  const activeTheme = useMemo(() => {
    return (
      UI_THEMES.find((themeOption) => themeOption.id === theme) || UI_THEMES[0]
    );
  }, [theme]);

  const activeServiceCount = useMemo(() => {
    return statuses.filter((status) => status.ok).length;
  }, [statuses]);

  const statusByName = useMemo(() => {
    return statuses.reduce<Partial<Record<ServiceName, ServiceStatus>>>(
      (accumulator, status) => {
        accumulator[status.name] = status;
        return accumulator;
      },
      {},
    );
  }, [statuses]);

  const selectedLabel = serviceLabels[selectedService];

  const loadStatuses = useCallback(async () => {
    setIsStatusLoading(true);
    setStatusError("");

    if (!runningInTauri) {
      setStatuses(getPreviewStatuses());
      setIsStatusLoading(false);
      return;
    }

    try {
      const nextStatuses =
        await invoke<ServiceStatus[]>("get_service_statuses");
      setStatuses(nextStatuses);
    } catch (error) {
      setStatusError(String(error));
    } finally {
      setIsStatusLoading(false);
    }
  }, [runningInTauri]);

  const loadLogs = useCallback(async (service: ServiceName) => {
    setIsLogsLoading(true);
    setLogsError("");

    if (!runningInTauri) {
      setLogs(
        `journalctl preview unavailable.\n\nRun this app with the Tauri desktop runtime to read recent ${service} logs.`,
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
  }, [runningInTauri]);

  const loadProjectServerStatus = useCallback(async () => {
    if (!runningInTauri) {
      setProjectServer(getPreviewProjectServerStatus());
      return;
    }

    try {
      const status = await invoke<ProjectServerStatus>(
        "get_project_server_status",
      );
      setProjectServer(status);
    } catch (error) {
      setOpenError(String(error));
    }
  }, [runningInTauri]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = activeTheme.colorScheme;
    localStorage.setItem(THEME_KEY, theme);
  }, [activeTheme.colorScheme, theme]);

  useEffect(() => {
    void loadStatuses();

    const pollId = window.setInterval(() => {
      void loadStatuses();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(pollId);
  }, [loadStatuses]);

  useEffect(() => {
    void loadLogs(selectedService);
  }, [loadLogs, selectedService]);

  useEffect(() => {
    void loadProjectServerStatus();

    const pollId = window.setInterval(() => {
      void loadProjectServerStatus();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(pollId);
  }, [loadProjectServerStatus]);

  async function runPendingAction() {
    if (!pendingAction) {
      return;
    }

    setIsActionRunning(true);
    setActionNotice("");

    if (!runningInTauri) {
      setActionNotice("Service actions require the Tauri desktop runtime.");
      setIsActionRunning(false);
      return;
    }

    try {
      const result = await invoke<CommandResult>("run_service_action", {
        service: pendingAction.service,
        action: pendingAction.action,
      });
      const label = serviceLabels[pendingAction.service];
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

  async function openProjectRoot() {
    const nextRoot = projectRoot.trim();
    setOpenError("");

    if (!isAbsolutePath(nextRoot)) {
      setOpenError("Project root must be a non-empty absolute path.");
      setPage("settings");
      return;
    }

    try {
      if (!runningInTauri) {
        setOpenError("Opening local folders requires the Tauri desktop runtime.");
        return;
      }

      await openPath(nextRoot);
    } catch (error) {
      setOpenError(String(error));
    }
  }

  async function openProjectSite() {
    const nextRoot = projectRoot.trim();
    setOpenError("");

    if (!isAbsolutePath(nextRoot)) {
      setOpenError("Project root must be a non-empty absolute path.");
      setPage("settings");
      return;
    }

    try {
      if (!runningInTauri) {
        setOpenError("Project serving requires the Tauri desktop runtime.");
        return;
      }

      setIsProjectServerLoading(true);
      const status = await invoke<ProjectServerStatus>("start_project_server", {
        projectRoot: nextRoot,
      });
      setProjectServer(status);

      if (!status.url) {
        setOpenError(status.message || "Project server did not provide a URL.");
        return;
      }

      await openUrl(status.url);
    } catch (error) {
      setOpenError(String(error));
    } finally {
      setIsProjectServerLoading(false);
    }
  }

  async function stopProjectServer() {
    setOpenError("");

    try {
      if (!runningInTauri) {
        setOpenError("Project serving requires the Tauri desktop runtime.");
        return;
      }

      setIsProjectServerLoading(true);
      const status = await invoke<ProjectServerStatus>("stop_project_server");
      setProjectServer(status);
    } catch (error) {
      setOpenError(String(error));
    } finally {
      setIsProjectServerLoading(false);
    }
  }

  function saveProjectRoot() {
    const nextRoot = draftProjectRoot.trim();

    if (!isAbsolutePath(nextRoot)) {
      setSettingsNotice("Enter a non-empty absolute path.");
      return;
    }

    localStorage.setItem(PROJECT_ROOT_KEY, nextRoot);
    setProjectRoot(nextRoot);
    setDraftProjectRoot(nextRoot);
    setSettingsNotice("Project root saved.");
    setOpenError("");
  }

  function resetProjectRoot() {
    localStorage.setItem(PROJECT_ROOT_KEY, DEFAULT_PROJECT_ROOT);
    setProjectRoot(DEFAULT_PROJECT_ROOT);
    setDraftProjectRoot(DEFAULT_PROJECT_ROOT);
    setSettingsNotice("Project root reset to the default.");
    setOpenError("");
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Local LAMP stack</p>
          <h1>StackPilot</h1>
        </div>

        <div className="header-actions">
          <label className="theme-picker">
            <span>Theme</span>
            <select
              aria-label="UI theme"
              onChange={(event) => setTheme(event.target.value as ThemeId)}
              value={theme}
            >
              {UI_THEMES.map((themeOption) => (
                <option key={themeOption.id} value={themeOption.id}>
                  {themeOption.name}
                </option>
              ))}
            </select>
          </label>

          <nav aria-label="Primary navigation" className="page-tabs">
            <button
              className={page === "dashboard" ? "tab active" : "tab"}
              onClick={() => setPage("dashboard")}
              type="button"
            >
              Dashboard
            </button>
            <button
              className={page === "settings" ? "tab active" : "tab"}
              onClick={() => setPage("settings")}
              type="button"
            >
              Settings
            </button>
          </nav>
        </div>
      </header>

      {!runningInTauri ? (
        <p className="notice warning">
          Browser preview mode: systemd, journalctl, pkexec, and local folder
          actions are available only inside the Tauri desktop runtime.
        </p>
      ) : null}

      <section className="command-bar" aria-label="Stack shortcuts">
        <button
          className="primary-button"
          disabled={isStatusLoading}
          onClick={() => void loadStatuses()}
          type="button"
        >
          {isStatusLoading ? "Refreshing" : "Refresh Status"}
        </button>
        <button onClick={() => void openProjectRoot()} type="button">
          Open Project Root
        </button>
        <button
          disabled={isProjectServerLoading}
          onClick={() => void openProjectSite()}
          type="button"
        >
          {isProjectServerLoading ? "Opening Site" : "Open Project Site"}
        </button>
        <button
          disabled={!projectServer.running || isProjectServerLoading}
          onClick={() => void stopProjectServer()}
          type="button"
        >
          Stop Project Site
        </button>
        <span className="path-readout" title={projectRoot}>
          {projectRoot}
        </span>
      </section>

      {openError ? <p className="notice error">{openError}</p> : null}
      {projectServer.running && projectServer.url ? (
        <p className="notice">
          Project site running at {projectServer.url}
          {projectServer.root ? ` from ${projectServer.root}` : ""}.
        </p>
      ) : null}
      {statusError ? <p className="notice error">{statusError}</p> : null}
      {actionNotice ? <p className="notice">{actionNotice}</p> : null}

      {page === "dashboard" ? (
        <div className="dashboard-grid">
          <section aria-labelledby="services-title" className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">systemd units</p>
                <h2 id="services-title">Services</h2>
              </div>
              <span className="summary-pill">
                {statuses.length
                  ? `${activeServiceCount}/${SERVICE_DEFINITIONS.length} active`
                  : "Checking services"}
              </span>
            </div>

            <div className="service-grid">
              {SERVICE_DEFINITIONS.map((service) => {
                const status = statusByName[service.name];
                const activeState = normalizeStatus(
                  status?.activeState || "unknown",
                );

                return (
                  <article
                    className={`service-card ${activeState}`}
                    key={service.name}
                  >
                    <div className="service-heading">
                      <div>
                        <h3>{status?.label || service.label}</h3>
                        <p>{service.name}</p>
                      </div>
                      <span className={`status-chip ${activeState}`}>
                        {status?.activeState || "unknown"}
                      </span>
                    </div>

                    <dl className="service-meta">
                      <div>
                        <dt>Enabled</dt>
                        <dd>{status?.enabledState || "unknown"}</dd>
                      </div>
                      <div>
                        <dt>Health</dt>
                        <dd>{status?.ok ? "Ready" : "Needs attention"}</dd>
                      </div>
                    </dl>

                    <p className="service-message">
                      {status?.message || "Waiting for service status."}
                    </p>

                    <div className="service-actions">
                      {SERVICE_ACTIONS.map((action) => (
                        <button
                          disabled={isActionRunning || !runningInTauri}
                          key={action}
                          onClick={() =>
                            setPendingAction({
                              service: service.name,
                              action,
                            })
                          }
                          type="button"
                        >
                          {actionLabels[action]}
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="logs-title" className="panel logs-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">journalctl</p>
                <h2 id="logs-title">Recent Logs</h2>
              </div>

              <div className="logs-controls">
                <label>
                  <span>Service</span>
                  <select
                    onChange={(event) =>
                      setSelectedService(event.target.value as ServiceName)
                    }
                    value={selectedService}
                  >
                    {SERVICE_DEFINITIONS.map((service) => (
                      <option key={service.name} value={service.name}>
                        {service.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={isLogsLoading}
                  onClick={() => void loadLogs(selectedService)}
                  type="button"
                >
                  {isLogsLoading ? "Loading" : "Refresh Logs"}
                </button>
              </div>
            </div>

            {logsError ? <p className="notice error">{logsError}</p> : null}

            <pre aria-label={`Recent ${selectedLabel} logs`} className="logs">
              {isLogsLoading && !logs ? "Loading logs..." : logs}
            </pre>
          </section>
        </div>
      ) : (
        <section aria-labelledby="settings-title" className="panel settings">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">preferences</p>
              <h2 id="settings-title">Settings</h2>
            </div>
          </div>

          <label className="field">
            <span>Project root path</span>
            <input
              onChange={(event) => {
                setDraftProjectRoot(event.target.value);
                setSettingsNotice("");
              }}
              placeholder={DEFAULT_PROJECT_ROOT}
              value={draftProjectRoot}
            />
          </label>

          <div className="settings-actions">
            <button className="primary-button" onClick={saveProjectRoot} type="button">
              Save
            </button>
            <button onClick={resetProjectRoot} type="button">
              Reset Default
            </button>
          </div>

          {settingsNotice ? <p className="notice">{settingsNotice}</p> : null}

          <section className="settings-section" aria-labelledby="themes-title">
            <div>
              <p className="eyebrow">interface</p>
              <h3 id="themes-title">UI Theme Library</h3>
            </div>

            <div className="theme-library">
              {UI_THEMES.map((themeOption) => (
                <button
                  className={
                    themeOption.id === theme ? "theme-card active" : "theme-card"
                  }
                  key={themeOption.id}
                  onClick={() => setTheme(themeOption.id)}
                  type="button"
                >
                  <span className="theme-card-header">
                    <span>{themeOption.name}</span>
                    <span className="theme-swatch-row" aria-hidden="true">
                      {themeOption.swatches.map((swatch) => (
                        <span
                          className="theme-swatch"
                          key={swatch}
                          style={{ backgroundColor: swatch }}
                        />
                      ))}
                    </span>
                  </span>
                  <span>{themeOption.description}</span>
                </button>
              ))}
            </div>
          </section>
        </section>
      )}

      {pendingAction ? (
        <div aria-modal="true" className="modal-backdrop" role="dialog">
          <div className="modal">
            <p className="eyebrow">privileged command</p>
            <h2>
              {actionLabels[pendingAction.action]}{" "}
              {serviceLabels[pendingAction.service]}?
            </h2>
            <p>
              This will ask polkit for permission before changing the service
              state.
            </p>
            <code>
              pkexec systemctl {pendingAction.action} {pendingAction.service}
            </code>

            <div className="modal-actions">
              <button
                disabled={isActionRunning}
                onClick={() => setPendingAction(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="danger-button"
                disabled={isActionRunning}
                onClick={() => void runPendingAction()}
                type="button"
              >
                {isActionRunning ? "Running" : "Run Command"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default App;
