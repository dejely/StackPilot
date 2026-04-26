import { DEFAULT_PHPMYADMIN_URL } from "../config/defaults";
import { STACK_PRESETS, getPreset } from "../config/presets";
import type { StackSettingsState } from "../hooks/useStackSettings";
import type { ThemeState } from "../hooks/useTheme";
import { ThemePicker } from "./ThemePicker";

type SetupScreenProps = {
  stack: StackSettingsState;
  theme: ThemeState;
  openError: string;
  isProjectServerLoading: boolean;
  onCompleteSetup: (openAfterSave?: boolean) => void;
};

export function SetupScreen({
  stack,
  theme,
  openError,
  isProjectServerLoading,
  onCompleteSetup,
}: SetupScreenProps) {
  return (
    <main className="app-shell setup-shell">
      <section aria-labelledby="setup-title" className="panel setup-screen">
        <header className="setup-header">
          <div>
            <p className="eyebrow">first run</p>
            <h1 id="setup-title">Set up StackPilot</h1>
          </div>

          <ThemePicker theme={theme.theme} onThemeChange={theme.setTheme} />
        </header>

        <div className="setup-progress" aria-label="Setup progress">
          <span className={stack.setupStep === "preset" ? "active" : ""}>
            Environment
          </span>
          <span className={stack.setupStep === "project" ? "active" : ""}>
            Project
          </span>
        </div>

        {stack.setupStep === "preset" ? (
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
                checked={stack.draft.windowsMode}
                onChange={(event) =>
                  stack.actions.applyPreset(
                    event.target.checked ? "windows" : "fedora",
                  )
                }
                type="checkbox"
              />
              <span>Windows or XAMPP for Windows</span>
            </label>

            {!stack.draft.windowsMode ? (
              <div className="preset-grid">
                {STACK_PRESETS.filter(
                  (preset) => preset.platform === "linux",
                ).map((preset) => (
                  <button
                    className={
                      preset.id === stack.draft.distroPreset
                        ? "preset-card active"
                        : "preset-card"
                    }
                    key={preset.id}
                    onClick={() => stack.actions.applyPreset(preset.id)}
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
                  stack.setSettingsNotice("");
                  stack.setSetupStep("project");
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
              <h2>{stack.draft.preset.name} project settings</h2>
              <p>
                Confirm the project path, folder name, phpMyAdmin URL, and
                service units before opening the dashboard.
              </p>
            </div>

            <label className="checkbox-field setup-checkbox">
              <input
                checked={stack.draft.xamppMode}
                onChange={(event) =>
                  stack.actions.setDraftXamppMode(event.target.checked)
                }
                type="checkbox"
              />
              <span>Enable XAMPP compatibility mode</span>
            </label>

            <div className="setup-fields">
              <label className="field">
                <span>
                  {stack.draft.xamppMode
                    ? "htdocs equivalent path"
                    : "Project root path"}
                </span>
                <input
                  onChange={(event) =>
                    stack.actions.setDraftProjectRoot(event.target.value)
                  }
                  placeholder={stack.draft.preset.projectRoot}
                  value={stack.draft.projectRoot}
                />
              </label>

              <label className="field">
                <span>Project folder name</span>
                <input
                  disabled={!stack.draft.xamppMode}
                  onChange={(event) =>
                    stack.actions.setDraftProjectName(event.target.value)
                  }
                  placeholder="my-project"
                  value={stack.draft.projectName}
                />
              </label>

              <label className="field">
                <span>phpMyAdmin URL</span>
                <input
                  onChange={(event) =>
                    stack.actions.setDraftPhpMyAdminUrl(event.target.value)
                  }
                  placeholder={DEFAULT_PHPMYADMIN_URL}
                  value={stack.draft.phpMyAdminUrl}
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
                {stack.draft.serviceDefinitions.map((service) => (
                  <label className="field" key={service.role}>
                    <span>{service.label}</span>
                    <input
                      disabled={stack.draft.windowsMode}
                      onChange={(event) =>
                        stack.actions.setDraftServiceName(
                          service.role,
                          event.target.value,
                        )
                      }
                      placeholder={service.name}
                      value={service.name}
                    />
                  </label>
                ))}
              </div>
            </section>

            {stack.settingsNotice ? (
              <p className="notice">{stack.settingsNotice}</p>
            ) : null}
            {openError ? <p className="notice error">{openError}</p> : null}

            <div className="modal-actions">
              <button
                onClick={() => stack.setSetupStep("preset")}
                type="button"
              >
                Back
              </button>
              <button onClick={() => onCompleteSetup(false)} type="button">
                Save Setup
              </button>
              <button
                className="primary-button"
                disabled={isProjectServerLoading}
                onClick={() => onCompleteSetup(true)}
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
