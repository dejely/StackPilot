import { useMemo, useState } from "react";

import { DEFAULT_PHPMYADMIN_URL, DEFAULT_PROJECT_ROOT } from "../config/defaults";
import { DEFAULT_PRESET, getPreset, isPresetId } from "../config/presets";
import { storageKeys } from "../config/storage";
import { isAbsolutePath, isHttpUrl, normalizeProjectName } from "../lib/paths";
import {
  isServiceDefinitions,
  validateServiceDefinitions,
} from "../lib/service-utils";
import type {
  PresetId,
  ServiceDefinition,
  ServiceRole,
  SetupStep,
} from "../types/stack";

function getInitialProjectRoot() {
  return localStorage.getItem(storageKeys.projectRoot) || DEFAULT_PROJECT_ROOT;
}

function getInitialProjectName() {
  return localStorage.getItem(storageKeys.projectName) || "";
}

function getInitialPhpMyAdminUrl() {
  return localStorage.getItem(storageKeys.phpMyAdminUrl) || DEFAULT_PHPMYADMIN_URL;
}

function getInitialXamppMode() {
  return localStorage.getItem(storageKeys.xamppMode) === "true";
}

function getInitialPresetId(): PresetId {
  const savedPreset = localStorage.getItem(storageKeys.distroPreset);

  if (isPresetId(savedPreset)) {
    return savedPreset;
  }

  return DEFAULT_PRESET.id;
}

function getInitialWindowsMode() {
  const savedValue = localStorage.getItem(storageKeys.windowsMode);

  if (savedValue !== null) {
    return savedValue === "true";
  }

  return getInitialPresetId() === "windows";
}

function getInitialSetupComplete() {
  return localStorage.getItem(storageKeys.setupComplete) === "true";
}

function getInitialDraftXamppMode() {
  return getInitialSetupComplete()
    ? getInitialXamppMode()
    : getPreset(getInitialPresetId()).xamppMode;
}

function getInitialServiceDefinitions(): ServiceDefinition[] {
  const savedServices = localStorage.getItem(storageKeys.serviceUnits);

  if (savedServices) {
    try {
      const parsedServices = JSON.parse(savedServices);

      if (isServiceDefinitions(parsedServices)) {
        return parsedServices;
      }
    } catch {
      localStorage.removeItem(storageKeys.serviceUnits);
    }
  }

  return getPreset(getInitialPresetId()).services;
}

export function useStackSettings() {
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

  const activePreset = useMemo(() => getPreset(distroPreset), [distroPreset]);
  const draftPreset = useMemo(
    () => getPreset(draftDistroPreset),
    [draftDistroPreset],
  );

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

  function updateDraftProjectRoot(value: string) {
    setDraftProjectRoot(value);
    setSettingsNotice("");
  }

  function updateDraftProjectName(value: string) {
    setDraftProjectName(value);
    setSettingsNotice("");
  }

  function updateDraftPhpMyAdminUrl(value: string) {
    setDraftPhpMyAdminUrl(value);
    setSettingsNotice("");
  }

  function updateDraftXamppMode(value: boolean) {
    setDraftXamppMode(value);
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

    localStorage.setItem(storageKeys.distroPreset, nextPreset);
    localStorage.setItem(storageKeys.projectRoot, nextRoot);
    localStorage.setItem(storageKeys.projectName, nextProjectName);
    localStorage.setItem(storageKeys.phpMyAdminUrl, nextPhpMyAdminUrl);
    localStorage.setItem(storageKeys.serviceUnits, JSON.stringify(nextServices));
    localStorage.setItem(storageKeys.windowsMode, String(nextWindowsMode));
    localStorage.setItem(storageKeys.xamppMode, String(draftXamppMode));

    if (markSetupComplete) {
      localStorage.setItem(storageKeys.setupComplete, "true");
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

    return true;
  }

  function resetStackSettings() {
    const defaultServices = DEFAULT_PRESET.services;

    localStorage.setItem(storageKeys.distroPreset, DEFAULT_PRESET.id);
    localStorage.setItem(storageKeys.projectRoot, DEFAULT_PROJECT_ROOT);
    localStorage.setItem(storageKeys.projectName, "");
    localStorage.setItem(storageKeys.phpMyAdminUrl, DEFAULT_PHPMYADMIN_URL);
    localStorage.setItem(storageKeys.serviceUnits, JSON.stringify(defaultServices));
    localStorage.setItem(storageKeys.windowsMode, "false");
    localStorage.setItem(storageKeys.xamppMode, "false");

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
  }

  return {
    setupComplete,
    setupStep,
    setSetupStep,
    settingsNotice,
    setSettingsNotice,
    current: {
      distroPreset,
      windowsMode,
      serviceDefinitions,
      projectRoot,
      projectName,
      phpMyAdminUrl,
      xamppMode,
      activePreset,
    },
    draft: {
      distroPreset: draftDistroPreset,
      windowsMode: draftWindowsMode,
      serviceDefinitions: draftServiceDefinitions,
      projectRoot: draftProjectRoot,
      projectName: draftProjectName,
      phpMyAdminUrl: draftPhpMyAdminUrl,
      xamppMode: draftXamppMode,
      preset: draftPreset,
    },
    actions: {
      applyPreset,
      setDraftServiceName,
      setDraftProjectRoot: updateDraftProjectRoot,
      setDraftProjectName: updateDraftProjectName,
      setDraftPhpMyAdminUrl: updateDraftPhpMyAdminUrl,
      setDraftXamppMode: updateDraftXamppMode,
      saveStackSettings,
      resetStackSettings,
    },
  };
}

export type StackSettingsState = ReturnType<typeof useStackSettings>;
