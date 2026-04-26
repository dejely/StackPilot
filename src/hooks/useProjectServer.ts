import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";

import { getPreviewProjectServerStatus } from "../lib/project-server";
import {
  buildXamppProjectUrl,
  isAbsolutePath,
  isHttpUrl,
  joinPaths,
  normalizeProjectName,
} from "../lib/paths";
import type { ProjectServerStatus } from "../types/stack";
import { POLL_INTERVAL_MS } from "../config/defaults";

type ProjectTarget = {
  projectRoot: string;
  projectName: string;
  xamppMode: boolean;
  windowsMode?: boolean;
  redirectToSettingsOnError?: boolean;
};

type UseProjectServerOptions = {
  setupComplete: boolean;
  runningInTauri: boolean;
  windowsMode: boolean;
  projectRoot: string;
  projectName: string;
  phpMyAdminUrl: string;
  xamppMode: boolean;
  onSettingsNeeded: () => void;
};

export function useProjectServer({
  setupComplete,
  runningInTauri,
  windowsMode,
  projectRoot,
  projectName,
  phpMyAdminUrl,
  xamppMode,
  onSettingsNeeded,
}: UseProjectServerOptions) {
  const [openError, setOpenError] = useState("");
  const [projectServer, setProjectServer] = useState<ProjectServerStatus>(
    getPreviewProjectServerStatus,
  );
  const [isProjectServerLoading, setIsProjectServerLoading] = useState(false);

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

  const openConfiguredProject = useCallback(async ({
    projectRoot: targetRoot,
    projectName: targetName,
    xamppMode: targetXamppMode,
    windowsMode: targetWindowsMode = windowsMode,
    redirectToSettingsOnError = true,
  }: ProjectTarget) => {
    const nextRoot = targetRoot.trim();
    const nextProjectName = normalizeProjectName(targetName);
    setOpenError("");

    if (!isAbsolutePath(nextRoot, targetWindowsMode)) {
      setOpenError(
        targetWindowsMode
          ? "htdocs path must be an absolute path, for example C:\\xampp\\htdocs."
          : targetXamppMode
            ? "htdocs path must be a non-empty absolute path."
            : "Project root must be a non-empty absolute path.",
      );
      if (redirectToSettingsOnError) {
        onSettingsNeeded();
      }
      return;
    }

    if (targetXamppMode) {
      if (!nextProjectName) {
        setOpenError("Enter a project folder name for XAMPP mode.");
        if (redirectToSettingsOnError) {
          onSettingsNeeded();
        }
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
  }, [onSettingsNeeded, runningInTauri, windowsMode]);

  async function openProjectRoot() {
    const nextRoot = projectRoot.trim();
    setOpenError("");

    if (!isAbsolutePath(nextRoot, windowsMode)) {
      setOpenError(
        windowsMode
          ? "Project root must be an absolute path, for example C:\\xampp\\htdocs."
          : "Project root must be a non-empty absolute path.",
      );
      onSettingsNeeded();
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
    await openConfiguredProject({
      projectRoot,
      projectName,
      xamppMode,
      windowsMode,
    });
  }

  async function openPhpMyAdmin() {
    const url = phpMyAdminUrl.trim();
    setOpenError("");

    if (!isHttpUrl(url)) {
      setOpenError("phpMyAdmin URL must start with http:// or https://.");
      onSettingsNeeded();
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

  return {
    projectServer,
    isProjectServerLoading,
    openError,
    setOpenError,
    clearOpenError: () => setOpenError(""),
    xamppProjectUrl,
    xamppProjectRoot,
    projectReadout,
    loadProjectServerStatus,
    openConfiguredProject,
    openProjectRoot,
    openProjectSite,
    openPhpMyAdmin,
    stopProjectServer,
  };
}

export type ProjectServerState = ReturnType<typeof useProjectServer>;
