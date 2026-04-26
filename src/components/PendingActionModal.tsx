import { getServiceLabel } from "../lib/service-utils";
import {
  actionLabels,
  type PendingAction,
  type ServiceDefinition,
} from "../types/stack";

type PendingActionModalProps = {
  pendingAction: PendingAction | null;
  serviceDefinitions: ServiceDefinition[];
  isActionRunning: boolean;
  onCancel: () => void;
  onRun: () => void;
};

export function PendingActionModal({
  pendingAction,
  serviceDefinitions,
  isActionRunning,
  onCancel,
  onRun,
}: PendingActionModalProps) {
  if (!pendingAction) {
    return null;
  }

  return (
    <div aria-modal="true" className="modal-backdrop" role="dialog">
      <div className="modal">
        <p className="eyebrow">privileged command</p>
        <h2>
          {actionLabels[pendingAction.action]}{" "}
          {getServiceLabel(serviceDefinitions, pendingAction.service)}?
        </h2>
        <p>
          This will ask polkit for permission before changing the service state.
        </p>
        <code>
          pkexec systemctl {pendingAction.action} {pendingAction.service}
        </code>

        <div className="modal-actions">
          <button disabled={isActionRunning} onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className="danger-button"
            disabled={isActionRunning}
            onClick={onRun}
            type="button"
          >
            {isActionRunning ? "Running" : "Run Command"}
          </button>
        </div>
      </div>
    </div>
  );
}
