import type { ServiceActionsState } from "../hooks/useServiceActions";
import type { ServiceLogsState } from "../hooks/useServiceLogs";
import type { ServiceStatusState } from "../hooks/useServiceStatus";
import { normalizeStatus } from "../lib/service-utils";
import {
  SERVICE_ACTIONS,
  actionLabels,
  type ServiceDefinition,
  type ServiceName,
} from "../types/stack";

type DashboardProps = {
  runningInTauri: boolean;
  windowsMode: boolean;
  serviceDefinitions: ServiceDefinition[];
  serviceStatus: ServiceStatusState;
  serviceLogs: ServiceLogsState;
  serviceActions: ServiceActionsState;
};

export function Dashboard({
  runningInTauri,
  windowsMode,
  serviceDefinitions,
  serviceStatus,
  serviceLogs,
  serviceActions,
}: DashboardProps) {
  return (
    <div className="dashboard-grid">
      <section aria-labelledby="services-title" className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">systemd units</p>
            <h2 id="services-title">Services</h2>
          </div>
          <span className="summary-pill">
            {serviceStatus.statuses.length
              ? `${serviceStatus.activeServiceCount}/${serviceDefinitions.length} active`
              : "Checking services"}
          </span>
        </div>

        <div className="service-grid">
          {serviceDefinitions.map((service) => {
            const status = serviceStatus.statusByName[service.name];
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
                        serviceActions.isActionRunning ||
                        !runningInTauri ||
                        windowsMode
                      }
                      key={action}
                      onClick={() =>
                        serviceActions.setPendingAction({
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
                  serviceLogs.setSelectedService(
                    event.target.value as ServiceName,
                  )
                }
                value={serviceLogs.selectedService}
              >
                {serviceDefinitions.map((service) => (
                  <option key={service.name} value={service.name}>
                    {service.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={serviceLogs.isLogsLoading}
              onClick={() => void serviceLogs.loadLogs(serviceLogs.selectedService)}
              type="button"
            >
              {serviceLogs.isLogsLoading ? "Loading" : "Refresh Logs"}
            </button>
          </div>
        </div>

        {serviceLogs.logsError ? (
          <p className="notice error">{serviceLogs.logsError}</p>
        ) : null}

        <pre
          aria-label={`Recent ${serviceLogs.selectedLabel} logs`}
          className="logs"
        >
          {serviceLogs.isLogsLoading && !serviceLogs.logs
            ? "Loading logs..."
            : serviceLogs.logs}
        </pre>
      </section>
    </div>
  );
}
