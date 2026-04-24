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
const PROJECT_NAME_KEY = "stackpilot.projectName";
const PHPMYADMIN_URL_KEY = "stackpilot.phpMyAdminUrl";
const DISTRO_PRESET_KEY = "stackpilot.distroPreset";
const SERVICE_UNITS_KEY = "stackpilot.serviceUnits";
const SETUP_COMPLETE_KEY = "stackpilot.setupComplete";
const THEME_KEY = "stackpilot.theme";
const WINDOWS_MODE_KEY = "stackpilot.windowsMode";
const XAMPP_MODE_KEY = "stackpilot.xamppMode";
const DEFAULT_PROJECT_ROOT = "/var/www/html";
const DEFAULT_PHPMYADMIN_URL = "http://localhost/phpmyadmin";
const POLL_INTERVAL_MS = 10_000;
const LOG_LINE_COUNT = 80;

const SERVICE_ROLES = ["web", "database", "php"] as const;

type ServiceRole = (typeof SERVICE_ROLES)[number];
type PresetId = "fedora" | "arch" | "ubuntu" | "debian" | "windows";

type ServiceDefinition = {
  role: ServiceRole;
  name: string;
  label: string;
};

type StackPreset = {
  id: PresetId;
  name: string;
  platform: "linux" | "windows";
  projectRoot: string;
  xamppMode: boolean;
  phpMyAdminUrl: string;
  description: string;
  services: ServiceDefinition[];
};

const STACK_PRESETS = [
  {
    id: "fedora",
    name: "Fedora",
    platform: "linux",
    projectRoot: "/var/www/html",
    xamppMode: false,
    phpMyAdminUrl: DEFAULT_PHPMYADMIN_URL,
    description: "Fedora package names and systemd units.",
    services: [
      { role: "web", name: "httpd", label: "Apache HTTP Server" },
      { role: "database", name: "mariadb", label: "MariaDB" },
      { role: "php", name: "php-fpm", label: "PHP-FPM" },
    ],
  },
  {
    id: "arch",
    name: "Arch",
    platform: "linux",
    projectRoot: "/srv/http",
    xamppMode: false,
    phpMyAdminUrl: DEFAULT_PHPMYADMIN_URL,
    description: "Arch defaults for Apache, MariaDB, and PHP-FPM.",
    services: [
      { role: "web", name: "httpd", label: "Apache HTTP Server" },
      { role: "database", name: "mariadb", label: "MariaDB" },
      { role: "php", name: "php-fpm", label: "PHP-FPM" },
    ],
  },
  {
    id: "ubuntu",
    name: "Ubuntu",
    platform: "linux",
    projectRoot: "/var/www/html",
    xamppMode: false,
    phpMyAdminUrl: DEFAULT_PHPMYADMIN_URL,
    description: "Ubuntu Apache unit names. Edit PHP-FPM if your version differs.",
    services: [
      { role: "web", name: "apache2", label: "Apache HTTP Server" },
      { role: "database", name: "mariadb", label: "MariaDB" },
      { role: "php", name: "php8.3-fpm", label: "PHP-FPM" },
    ],
  },
  {
    id: "debian",
    name: "Debian",
    platform: "linux",
    projectRoot: "/var/www/html",
    xamppMode: false,
    phpMyAdminUrl: DEFAULT_PHPMYADMIN_URL,
    description: "Debian Apache unit names. Edit PHP-FPM if your version differs.",
    services: [
      { role: "web", name: "apache2", label: "Apache HTTP Server" },
      { role: "database", name: "mariadb", label: "MariaDB" },
      { role: "php", name: "php8.2-fpm", label: "PHP-FPM" },
    ],
  },
  {
    id: "windows",
    name: "Windows",
    platform: "windows",
    projectRoot: "C:\\xampp\\htdocs",
    xamppMode: true,
    phpMyAdminUrl: DEFAULT_PHPMYADMIN_URL,
    description: "XAMPP-style paths. systemd controls are disabled.",
    services: [
      { role: "web", name: "apache", label: "Apache HTTP Server" },
      { role: "database", name: "mysql", label: "MySQL or MariaDB" },
      { role: "php", name: "php", label: "PHP" },
    ],
  },
] satisfies StackPreset[];

const SERVICE_ACTIONS = ["start", "stop", "restart"] as const;
const DEFAULT_PRESET = STACK_PRESETS[0];

type ServiceName = string;
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
type SetupStep = "preset" | "project";

const actionLabels: Record<ServiceAction, string> = {
  start: "Start",
  stop: "Stop",
  restart: "Restart",
};

function getInitialProjectRoot() {
  return localStorage.getItem(PROJECT_ROOT_KEY) || DEFAULT_PROJECT_ROOT;
}

function getInitialProjectName() {
  return localStorage.getItem(PROJECT_NAME_KEY) || "";
}

function getInitialPhpMyAdminUrl() {
  return localStorage.getItem(PHPMYADMIN_URL_KEY) || DEFAULT_PHPMYADMIN_URL;
}

function getInitialXamppMode() {
  return localStorage.getItem(XAMPP_MODE_KEY) === "true";
}

function isPresetId(value: string | null): value is PresetId {
  return STACK_PRESETS.some((preset) => preset.id === value);
}

function getPreset(id: PresetId) {
  return (
    STACK_PRESETS.find((preset) => preset.id === id) || DEFAULT_PRESET
  );
}

function getInitialPresetId(): PresetId {
  const savedPreset = localStorage.getItem(DISTRO_PRESET_KEY);

  if (isPresetId(savedPreset)) {
    return savedPreset;
  }

  return DEFAULT_PRESET.id;
}

function getInitialWindowsMode() {
  const savedValue = localStorage.getItem(WINDOWS_MODE_KEY);

  if (savedValue !== null) {
    return savedValue === "true";
  }

  return getInitialPresetId() === "windows";
}

function getInitialDraftXamppMode() {
  return getInitialSetupComplete()
    ? getInitialXamppMode()
    : getPreset(getInitialPresetId()).xamppMode;
}

function getInitialSetupComplete() {
  return localStorage.getItem(SETUP_COMPLETE_KEY) === "true";
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

function getInitialServiceDefinitions(): ServiceDefinition[] {
  const savedServices = localStorage.getItem(SERVICE_UNITS_KEY);

  if (savedServices) {
    try {
      const parsedServices = JSON.parse(savedServices);

      if (isServiceDefinitions(parsedServices)) {
        return parsedServices;
      }
    } catch {
      localStorage.removeItem(SERVICE_UNITS_KEY);
    }
  }

  return getPreset(getInitialPresetId()).services;
}

function getInitialSelectedService() {
  return getInitialServiceDefinitions()[0]?.name || "httpd";
}

function getPreviewStatuses(
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

function getPreviewProjectServerStatus(): ProjectServerStatus {
  return {
    running: false,
    root: null,
    url: null,
    port: null,
    message: "Desktop runtime required to serve projects.",
  };
}

function isServiceDefinitions(value: unknown): value is ServiceDefinition[] {
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

function getServiceLabel(services: ServiceDefinition[], serviceName: string) {
  return (
    services.find((service) => service.name === serviceName)?.label ||
    serviceName
  );
}

function isWindowsAbsolutePath(path: string) {
  const trimmedPath = path.trim();
  return /^[A-Za-z]:[\\/]/.test(trimmedPath) || /^\\\\[^\\]+\\[^\\]+/.test(trimmedPath);
}

function isUnixAbsolutePath(path: string) {
  return path.trim().startsWith("/");
}

function isAbsolutePath(path: string, windowsMode = false) {
  return windowsMode
    ? isWindowsAbsolutePath(path) || isUnixAbsolutePath(path)
    : isUnixAbsolutePath(path);
}

function isValidServiceUnitName(name: string) {
  return /^[A-Za-z0-9_.@:-]+$/.test(name.trim());
}

function normalizeServiceDefinitions(services: ServiceDefinition[]) {
  return services.map((service) => ({
    ...service,
    name: service.name.trim(),
    label: service.label.trim(),
  }));
}

function validateServiceDefinitions(services: ServiceDefinition[]) {
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

function isHttpUrl(url: string) {
  return url.startsWith("http://") || url.startsWith("https://");
}

function normalizeProjectName(name: string) {
  return name.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function buildXamppProjectUrl(name: string) {
  const projectName = normalizeProjectName(name);

  if (!projectName) {
    return "http://localhost/";
  }

  const encodedProjectName = projectName
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `http://localhost/${encodedProjectName}/`;
}

function joinPaths(root: string, child: string) {
  const trimmedRoot = root.trim();
  const trimmedChild = child.trim();

  if (isWindowsAbsolutePath(trimmedRoot) || trimmedRoot.includes("\\")) {
    return `${trimmedRoot.replace(/[\\/]+$/g, "")}\\${trimmedChild
      .replace(/^[\\/]+/g, "")
      .replace(/\//g, "\\")}`;
  }

  return `${trimmedRoot.replace(/\/+$/g, "")}/${trimmedChild.replace(
    /^\/+/g,
    "",
  )}`;
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
  const [selectedService, setSelectedService] = useState<ServiceName>(
    getInitialSelectedService,
  );
  const [logs, setLogs] = useState("");
  const [logsError, setLogsError] = useState("");
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [isActionRunning, setIsActionRunning] = useState(false);
  const [actionNotice, setActionNotice] = useState("");
  const [distroPreset, setDistroPreset] =
    useState<PresetId>(getInitialPresetId);
  const [windowsMode, setWindowsMode] = useState(getInitialWindowsMode);
  const [serviceDefinitions, setServiceDefinitions] = useState(
    getInitialServiceDefinitions,
  );
  const [projectRoot, setProjectRoot] = useState(getInitialProjectRoot);
  const [projectName, setProjectName] = useState(getInitialProjectName);
  const [phpMyAdminUrl, setPhpMyAdminUrl] = useState(getInitialPhpMyAdminUrl);
  const [xamppMode, setXamppMode] = useState(getInitialXamppMode);
  const [draftDistroPreset, setDraftDistroPreset] =
    useState<PresetId>(distroPreset);
  const [draftWindowsMode, setDraftWindowsMode] = useState(windowsMode);
  const [draftServiceDefinitions, setDraftServiceDefinitions] =
    useState(serviceDefinitions);
  const [draftProjectRoot, setDraftProjectRoot] = useState(projectRoot);
  const [draftProjectName, setDraftProjectName] = useState(projectName);
  const [draftPhpMyAdminUrl, setDraftPhpMyAdminUrl] =
    useState(phpMyAdminUrl);
  const [draftXamppMode, setDraftXamppMode] = useState(
    getInitialDraftXamppMode,
  );
  const [setupComplete, setSetupComplete] = useState(getInitialSetupComplete);
  const [setupStep, setSetupStep] = useState<SetupStep>("preset");
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

  const activePreset = useMemo(() => getPreset(distroPreset), [distroPreset]);
  const draftPreset = useMemo(
    () => getPreset(draftDistroPreset),
    [draftDistroPreset],
  );

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

  const selectedLabel = getServiceLabel(serviceDefinitions, selectedService);
  const xamppProjectUrl = useMemo(
    () => buildXamppProjectUrl(projectName),
    [projectName],
  );
  const xamppProjectRoot = projectName
    ? joinPaths(projectRoot, projectName)
    : projectRoot;
  const projectReadout = xamppMode
    ? `${xamppProjectRoot} -> ${xamppProjectUrl}`
    : projectRoot;

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

  useEffect(() => {
    if (!setupComplete) {
      setProjectServer(getPreviewProjectServerStatus());
      return;
    }

    void loadProjectServerStatus();

    const pollId = window.setInterval(() => {
      void loadProjectServerStatus();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(pollId);
  }, [loadProjectServerStatus, setupComplete]);

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

  async function openProjectRoot() {
    const nextRoot = projectRoot.trim();
    setOpenError("");

    if (!isAbsolutePath(nextRoot, windowsMode)) {
      setOpenError(
        windowsMode
          ? "Project root must be an absolute path, for example C:\\xampp\\htdocs."
          : "Project root must be a non-empty absolute path.",
      );
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

    if (!isAbsolutePath(nextRoot, windowsMode)) {
      setOpenError(
        windowsMode
          ? "htdocs path must be an absolute path, for example C:\\xampp\\htdocs."
          : xamppMode
          ? "htdocs path must be a non-empty absolute path."
          : "Project root must be a non-empty absolute path.",
      );
      setPage("settings");
      return;
    }

    if (xamppMode) {
      const nextProjectName = normalizeProjectName(projectName);

      if (!nextProjectName) {
        setOpenError("Enter a project folder name for XAMPP mode.");
        setPage("settings");
        return;
      }

      try {
        if (!runningInTauri) {
          window.open(
            buildXamppProjectUrl(nextProjectName),
            "_blank",
            "noopener,noreferrer",
          );
          return;
        }

        setIsProjectServerLoading(true);
        const status = await invoke<ProjectServerStatus>(
          "start_project_server",
          {
            projectRoot: joinPaths(nextRoot, nextProjectName),
          },
        );
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

  async function openPhpMyAdmin() {
    const url = phpMyAdminUrl.trim();
    setOpenError("");

    if (!isHttpUrl(url)) {
      setOpenError("phpMyAdmin URL must start with http:// or https://.");
      setPage("settings");
      return;
    }

    try {
      if (!runningInTauri) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }

      await openUrl(url);
    } catch (error) {
      setOpenError(String(error));
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

  function applyPreset(presetId: PresetId) {
    const preset = getPreset(presetId);
    const isWindowsPreset = preset.platform === "windows";

    setDraftDistroPreset(preset.id);
    setDraftWindowsMode(isWindowsPreset);
    setDraftServiceDefinitions(preset.services);
    setDraftProjectRoot(preset.projectRoot);
    setDraftPhpMyAdminUrl(preset.phpMyAdminUrl);
    setDraftXamppMode(preset.xamppMode);
    setSettingsNotice("");
  }

  function setDraftServiceName(role: ServiceRole, name: string) {
    setDraftServiceDefinitions((services) =>
      services.map((service) =>
        service.role === role ? { ...service, name } : service,
      ),
    );
    setSettingsNotice("");
  }

  function saveStackSettings(markSetupComplete = false) {
    const nextRoot = draftProjectRoot.trim();
    const nextProjectName = normalizeProjectName(draftProjectName);
    const nextPhpMyAdminUrl = draftPhpMyAdminUrl.trim();
    const serviceValidation = validateServiceDefinitions(
      draftServiceDefinitions,
    );

    if (!isAbsolutePath(nextRoot, draftWindowsMode)) {
      setSettingsNotice(
        draftWindowsMode
          ? "Enter an absolute htdocs path, for example C:\\xampp\\htdocs."
          : draftXamppMode
          ? "Enter a non-empty absolute htdocs path."
          : "Enter a non-empty absolute project root path.",
      );
      return false;
    }

    if (draftXamppMode && !nextProjectName) {
      setSettingsNotice("Enter a project folder name for XAMPP mode.");
      return false;
    }

    if (!isHttpUrl(nextPhpMyAdminUrl)) {
      setSettingsNotice("phpMyAdmin URL must start with http:// or https://.");
      return false;
    }

    if (!serviceValidation.ok) {
      setSettingsNotice(serviceValidation.message);
      return false;
    }

    const nextPreset = draftWindowsMode ? "windows" : draftDistroPreset;
    const nextWindowsMode = draftWindowsMode;
    const nextServices = serviceValidation.services;

    localStorage.setItem(DISTRO_PRESET_KEY, nextPreset);
    localStorage.setItem(PROJECT_ROOT_KEY, nextRoot);
    localStorage.setItem(PROJECT_NAME_KEY, nextProjectName);
    localStorage.setItem(PHPMYADMIN_URL_KEY, nextPhpMyAdminUrl);
    localStorage.setItem(SERVICE_UNITS_KEY, JSON.stringify(nextServices));
    localStorage.setItem(WINDOWS_MODE_KEY, String(nextWindowsMode));
    localStorage.setItem(XAMPP_MODE_KEY, String(draftXamppMode));

    if (markSetupComplete) {
      localStorage.setItem(SETUP_COMPLETE_KEY, "true");
      setSetupComplete(true);
    }

    setDistroPreset(nextPreset);
    setWindowsMode(nextWindowsMode);
    setServiceDefinitions(nextServices);
    setProjectRoot(nextRoot);
    setProjectName(nextProjectName);
    setPhpMyAdminUrl(nextPhpMyAdminUrl);
    setXamppMode(draftXamppMode);
    setDraftDistroPreset(nextPreset);
    setDraftWindowsMode(nextWindowsMode);
    setDraftServiceDefinitions(nextServices);
    setDraftProjectRoot(nextRoot);
    setDraftProjectName(nextProjectName);
    setDraftPhpMyAdminUrl(nextPhpMyAdminUrl);
    setSettingsNotice("Settings saved.");
    setOpenError("");

    return true;
  }

  async function completeSetup(openAfterSave = false) {
    const nextRoot = draftProjectRoot.trim();
    const nextProjectName = normalizeProjectName(draftProjectName);
    const nextXamppMode = draftXamppMode;
    const didSave = saveStackSettings(true);

    if (!didSave) {
      return;
    }

    if (openAfterSave) {
      try {
        if (nextXamppMode) {
          if (!runningInTauri) {
            window.open(
              buildXamppProjectUrl(nextProjectName),
              "_blank",
              "noopener,noreferrer",
            );
            return;
          }

          setIsProjectServerLoading(true);
          const status = await invoke<ProjectServerStatus>(
            "start_project_server",
            {
              projectRoot: joinPaths(nextRoot, nextProjectName),
            },
          );
          setProjectServer(status);

          if (status.url) {
            await openUrl(status.url);
          } else {
            setOpenError(
              status.message || "Project server did not provide a URL.",
            );
          }

          return;
        }

        if (!runningInTauri) {
          setOpenError("Project serving requires the Tauri desktop runtime.");
          return;
        }

        setIsProjectServerLoading(true);
        const status = await invoke<ProjectServerStatus>(
          "start_project_server",
          {
            projectRoot: nextRoot,
          },
        );
        setProjectServer(status);

        if (status.url) {
          await openUrl(status.url);
        }
      } catch (error) {
        setOpenError(String(error));
      } finally {
        setIsProjectServerLoading(false);
      }
    }
  }

  function resetStackSettings() {
    const defaultServices = DEFAULT_PRESET.services;

    localStorage.setItem(DISTRO_PRESET_KEY, DEFAULT_PRESET.id);
    localStorage.setItem(PROJECT_ROOT_KEY, DEFAULT_PROJECT_ROOT);
    localStorage.setItem(PROJECT_NAME_KEY, "");
    localStorage.setItem(PHPMYADMIN_URL_KEY, DEFAULT_PHPMYADMIN_URL);
    localStorage.setItem(SERVICE_UNITS_KEY, JSON.stringify(defaultServices));
    localStorage.setItem(WINDOWS_MODE_KEY, "false");
    localStorage.setItem(XAMPP_MODE_KEY, "false");
    setDistroPreset(DEFAULT_PRESET.id);
    setWindowsMode(false);
    setServiceDefinitions(defaultServices);
    setProjectRoot(DEFAULT_PROJECT_ROOT);
    setProjectName("");
    setPhpMyAdminUrl(DEFAULT_PHPMYADMIN_URL);
    setXamppMode(false);
    setDraftDistroPreset(DEFAULT_PRESET.id);
    setDraftWindowsMode(false);
    setDraftServiceDefinitions(defaultServices);
    setDraftProjectRoot(DEFAULT_PROJECT_ROOT);
    setDraftProjectName("");
    setDraftPhpMyAdminUrl(DEFAULT_PHPMYADMIN_URL);
    setDraftXamppMode(false);
    setSettingsNotice("Settings reset to the default.");
    setOpenError("");
  }

  if (!setupComplete) {
    return (
      <main className="app-shell setup-shell">
        <section aria-labelledby="setup-title" className="panel setup-screen">
          <header className="setup-header">
            <div>
              <p className="eyebrow">first run</p>
              <h1 id="setup-title">Set up StackPilot</h1>
            </div>

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
          </header>

          <div className="setup-progress" aria-label="Setup progress">
            <span className={setupStep === "preset" ? "active" : ""}>
              Environment
            </span>
            <span className={setupStep === "project" ? "active" : ""}>
              Project
            </span>
          </div>

          {setupStep === "preset" ? (
            <div className="setup-pane">
              <div>
                <p className="eyebrow">environment preset</p>
                <h2>Choose your local stack</h2>
                <p>
                  This sets service unit names, the default project root, and
                  whether StackPilot should use XAMPP-style behavior.
                </p>
              </div>

              <label className="checkbox-field setup-checkbox">
                <input
                  checked={draftWindowsMode}
                  onChange={(event) =>
                    applyPreset(event.target.checked ? "windows" : "fedora")
                  }
                  type="checkbox"
                />
                <span>Windows or XAMPP for Windows</span>
              </label>

              {!draftWindowsMode ? (
                <div className="preset-grid">
                  {STACK_PRESETS.filter(
                    (preset) => preset.platform === "linux",
                  ).map((preset) => (
                    <button
                      className={
                        preset.id === draftDistroPreset
                          ? "preset-card active"
                          : "preset-card"
                      }
                      key={preset.id}
                      onClick={() => applyPreset(preset.id)}
                      type="button"
                    >
                      <span>{preset.name}</span>
                      <small>{preset.description}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="notice">
                  Windows mode uses {getPreset("windows").projectRoot} and
                  disables systemd controls.
                </p>
              )}

              <div className="modal-actions">
                <button
                  className="primary-button"
                  onClick={() => {
                    setSettingsNotice("");
                    setSetupStep("project");
                  }}
                  type="button"
                >
                  Continue
                </button>
              </div>
            </div>
          ) : (
            <div className="setup-pane">
              <div>
                <p className="eyebrow">project setup</p>
                <h2>{draftPreset.name} project settings</h2>
                <p>
                  Confirm the project path, folder name, phpMyAdmin URL, and
                  service units before opening the dashboard.
                </p>
              </div>

              <label className="checkbox-field setup-checkbox">
                <input
                  checked={draftXamppMode}
                  onChange={(event) => {
                    setDraftXamppMode(event.target.checked);
                    setSettingsNotice("");
                  }}
                  type="checkbox"
                />
                <span>Enable XAMPP compatibility mode</span>
              </label>

              <div className="setup-fields">
                <label className="field">
                  <span>
                    {draftXamppMode
                      ? "htdocs equivalent path"
                      : "Project root path"}
                  </span>
                  <input
                    onChange={(event) => {
                      setDraftProjectRoot(event.target.value);
                      setSettingsNotice("");
                    }}
                    placeholder={draftPreset.projectRoot}
                    value={draftProjectRoot}
                  />
                </label>

                <label className="field">
                  <span>Project folder name</span>
                  <input
                    disabled={!draftXamppMode}
                    onChange={(event) => {
                      setDraftProjectName(event.target.value);
                      setSettingsNotice("");
                    }}
                    placeholder="my-project"
                    value={draftProjectName}
                  />
                </label>

                <label className="field">
                  <span>phpMyAdmin URL</span>
                  <input
                    onChange={(event) => {
                      setDraftPhpMyAdminUrl(event.target.value);
                      setSettingsNotice("");
                    }}
                    placeholder={DEFAULT_PHPMYADMIN_URL}
                    value={draftPhpMyAdminUrl}
                  />
                </label>
              </div>

              <section
                className="settings-section"
                aria-labelledby="setup-service-units-title"
              >
                <div>
                  <p className="eyebrow">service map</p>
                  <h3 id="setup-service-units-title">Service Unit Names</h3>
                </div>

                <div className="service-unit-grid">
                  {draftServiceDefinitions.map((service) => (
                    <label className="field" key={service.role}>
                      <span>{service.label}</span>
                      <input
                        disabled={draftWindowsMode}
                        onChange={(event) =>
                          setDraftServiceName(service.role, event.target.value)
                        }
                        placeholder={service.name}
                        value={service.name}
                      />
                    </label>
                  ))}
                </div>
              </section>

              {settingsNotice ? <p className="notice">{settingsNotice}</p> : null}
              {openError ? <p className="notice error">{openError}</p> : null}

              <div className="modal-actions">
                <button onClick={() => setSetupStep("preset")} type="button">
                  Back
                </button>
                <button onClick={() => void completeSetup(false)} type="button">
                  Save Setup
                </button>
                <button
                  className="primary-button"
                  disabled={isProjectServerLoading}
                  onClick={() => void completeSetup(true)}
                  type="button"
                >
                  {isProjectServerLoading ? "Opening" : "Save and Open Project"}
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Local LAMP stack / {activePreset.name}</p>
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
      {windowsMode ? (
        <p className="notice warning">
          Windows preset is active. StackPilot will use XAMPP-style paths and
          project serving; systemd service controls are disabled.
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
        <button onClick={() => void openPhpMyAdmin()} type="button">
          phpMyAdmin
        </button>
        <button
          disabled={!projectServer.running || isProjectServerLoading}
          onClick={() => void stopProjectServer()}
          type="button"
        >
          Stop PHP Server
        </button>
        <span className="path-readout" title={projectReadout}>
          {projectReadout}
        </span>
      </section>

      {openError ? <p className="notice error">{openError}</p> : null}
      {projectServer.running && projectServer.url ? (
        <p className="notice">
          Project site running at {projectServer.url}
          {projectServer.root ? ` from ${projectServer.root}` : ""}.
        </p>
      ) : null}
      {xamppMode ? (
        <p className="notice">
          XAMPP mode is active. StackPilot serves {xamppProjectRoot} with PHP's
          built-in server. Apache-style route: {xamppProjectUrl}.
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
                  ? `${activeServiceCount}/${serviceDefinitions.length} active`
                  : "Checking services"}
              </span>
            </div>

            <div className="service-grid">
              {serviceDefinitions.map((service) => {
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
                          disabled={
                            isActionRunning || !runningInTauri || windowsMode
                          }
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
                    {serviceDefinitions.map((service) => (
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

          <section className="settings-section" aria-labelledby="preset-title">
            <div>
              <p className="eyebrow">environment</p>
              <h3 id="preset-title">Distro Preset</h3>
            </div>

            <label className="checkbox-field">
              <input
                checked={draftWindowsMode}
                onChange={(event) => {
                  applyPreset(event.target.checked ? "windows" : "fedora");
                }}
                type="checkbox"
              />
              <span>Windows or XAMPP for Windows</span>
            </label>

            {!draftWindowsMode ? (
              <div className="preset-grid">
                {STACK_PRESETS.filter(
                  (preset) => preset.platform === "linux",
                ).map((preset) => (
                  <button
                    className={
                      preset.id === draftDistroPreset
                        ? "preset-card active"
                        : "preset-card"
                    }
                    key={preset.id}
                    onClick={() => applyPreset(preset.id)}
                    type="button"
                  >
                    <span>{preset.name}</span>
                    <small>{preset.description}</small>
                  </button>
                ))}
              </div>
            ) : null}

            <p className="settings-hint">
              Active preset after save: {draftPreset.name}
            </p>
          </section>

          <section
            className="settings-section"
            aria-labelledby="service-units-title"
          >
            <div>
              <p className="eyebrow">service map</p>
              <h3 id="service-units-title">Service Unit Names</h3>
            </div>

            <div className="service-unit-grid">
              {draftServiceDefinitions.map((service) => (
                <label className="field" key={service.role}>
                  <span>{service.label}</span>
                  <input
                    disabled={draftWindowsMode}
                    onChange={(event) =>
                      setDraftServiceName(service.role, event.target.value)
                    }
                    placeholder={service.name}
                    value={service.name}
                  />
                </label>
              ))}
            </div>
          </section>

          <label className="checkbox-field">
            <input
              checked={draftXamppMode}
              onChange={(event) => {
                setDraftXamppMode(event.target.checked);
                setSettingsNotice("");
              }}
              type="checkbox"
            />
            <span>XAMPP compatibility mode</span>
          </label>

          <label className="field">
            <span>
              {draftXamppMode ? "htdocs equivalent path" : "Project root path"}
            </span>
            <input
              onChange={(event) => {
                setDraftProjectRoot(event.target.value);
                setSettingsNotice("");
              }}
              placeholder={DEFAULT_PROJECT_ROOT}
              value={draftProjectRoot}
            />
          </label>

          <label className="field">
            <span>Project folder name</span>
            <input
              disabled={!draftXamppMode}
              onChange={(event) => {
                setDraftProjectName(event.target.value);
                setSettingsNotice("");
              }}
              placeholder="my-project"
              value={draftProjectName}
            />
          </label>

          <label className="field">
            <span>phpMyAdmin URL</span>
            <input
              onChange={(event) => {
                setDraftPhpMyAdminUrl(event.target.value);
                setSettingsNotice("");
              }}
              placeholder={DEFAULT_PHPMYADMIN_URL}
              value={draftPhpMyAdminUrl}
            />
          </label>

          <div className="settings-actions">
            <button
              className="primary-button"
              onClick={() => saveStackSettings()}
              type="button"
            >
              Save
            </button>
            <button onClick={resetStackSettings} type="button">
              Reset Default
            </button>
          </div>

          {xamppMode ? (
            <dl className="compat-readout">
              <div>
                <dt>served path</dt>
                <dd>{xamppProjectRoot}</dd>
              </div>
              <div>
                <dt>apache URL</dt>
                <dd>{xamppProjectUrl}</dd>
              </div>
              <div>
                <dt>htdocs</dt>
                <dd>{projectRoot}</dd>
              </div>
              <div>
                <dt>phpMyAdmin</dt>
                <dd>{phpMyAdminUrl}</dd>
              </div>
            </dl>
          ) : null}

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
              {getServiceLabel(serviceDefinitions, pendingAction.service)}?
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
