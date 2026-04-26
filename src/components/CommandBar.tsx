import type { ProjectServerState } from "../hooks/useProjectServer";
import type { ServiceStatusState } from "../hooks/useServiceStatus";

type CommandBarProps = {
  project: ProjectServerState;
  serviceStatus: ServiceStatusState;
};

export function CommandBar({ project, serviceStatus }: CommandBarProps) {
  return (
    <section className="command-bar" aria-label="Stack shortcuts">
      <button
        className="primary-button"
        disabled={serviceStatus.isStatusLoading}
        onClick={() => void serviceStatus.loadStatuses()}
        type="button"
      >
        {serviceStatus.isStatusLoading ? "Refreshing" : "Refresh Status"}
      </button>
      <button onClick={() => void project.openProjectRoot()} type="button">
        Open Project Root
      </button>
      <button
        disabled={project.isProjectServerLoading}
        onClick={() => void project.openProjectSite()}
        type="button"
      >
        {project.isProjectServerLoading ? "Opening Site" : "Open Project Site"}
      </button>
      <button onClick={() => void project.openPhpMyAdmin()} type="button">
        phpMyAdmin
      </button>
      <button
        disabled={
          !project.projectServer.running || project.isProjectServerLoading
        }
        onClick={() => void project.stopProjectServer()}
        type="button"
      >
        Stop PHP Server
      </button>
      <span className="path-readout" title={project.projectReadout}>
        {project.projectReadout}
      </span>
    </section>
  );
}
