import { DEFAULT_PHPMYADMIN_URL, DEFAULT_PROJECT_ROOT } from "../config/defaults";
import { STACK_PRESETS } from "../config/presets";
import type { ProjectServerState } from "../hooks/useProjectServer";
import type { StackSettingsState } from "../hooks/useStackSettings";
import type { ThemeState } from "../hooks/useTheme";
import { UI_THEMES } from "../themes";

type SettingsPanelProps = {
  stack: StackSettingsState;
  theme: ThemeState;
  project: ProjectServerState;
  onSaveSettings: () => void;
  onResetSettings: () => void;
};

export function SettingsPanel({
  stack,
  theme,
  project,
  onSaveSettings,
  onResetSettings,
}: SettingsPanelProps) {
  return (
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
            checked={stack.draft.windowsMode}
            onChange={(event) => {
              stack.actions.applyPreset(
                event.target.checked ? "windows" : "fedora",
              );
            }}
            type="checkbox"
          />
          <span>Windows or XAMPP for Windows</span>
        </label>

        {!stack.draft.windowsMode ? (
          <div className="preset-grid">
            {STACK_PRESETS.filter((preset) => preset.platform === "linux").map(
              (preset) => (
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
              ),
            )}
          </div>
        ) : null}

        <p className="settings-hint">
          Active preset after save: {stack.draft.preset.name}
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

      <label className="checkbox-field">
        <input
          checked={stack.draft.xamppMode}
          onChange={(event) =>
            stack.actions.setDraftXamppMode(event.target.checked)
          }
          type="checkbox"
        />
        <span>XAMPP compatibility mode</span>
      </label>

      <label className="field">
        <span>
          {stack.draft.xamppMode ? "htdocs equivalent path" : "Project root path"}
        </span>
        <input
          onChange={(event) =>
            stack.actions.setDraftProjectRoot(event.target.value)
          }
          placeholder={DEFAULT_PROJECT_ROOT}
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

      <div className="settings-actions">
        <button
          className="primary-button"
          onClick={onSaveSettings}
          type="button"
        >
          Save
        </button>
        <button onClick={onResetSettings} type="button">
          Reset Default
        </button>
      </div>

      {stack.current.xamppMode ? (
        <dl className="compat-readout">
          <div>
            <dt>served path</dt>
            <dd>{project.xamppProjectRoot}</dd>
          </div>
          <div>
            <dt>apache URL</dt>
            <dd>{project.xamppProjectUrl}</dd>
          </div>
          <div>
            <dt>htdocs</dt>
            <dd>{stack.current.projectRoot}</dd>
          </div>
          <div>
            <dt>phpMyAdmin</dt>
            <dd>{stack.current.phpMyAdminUrl}</dd>
          </div>
        </dl>
      ) : null}

      {stack.settingsNotice ? (
        <p className="notice">{stack.settingsNotice}</p>
      ) : null}

      <section className="settings-section" aria-labelledby="themes-title">
        <div>
          <p className="eyebrow">interface</p>
          <h3 id="themes-title">UI Theme Library</h3>
        </div>

        <div className="theme-library">
          {UI_THEMES.map((themeOption) => (
            <button
              className={
                themeOption.id === theme.theme
                  ? "theme-card active"
                  : "theme-card"
              }
              key={themeOption.id}
              onClick={() => theme.setTheme(themeOption.id)}
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
  );
}
