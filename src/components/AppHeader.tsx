import type { Dispatch, SetStateAction } from "react";

import type { ThemeState } from "../hooks/useTheme";
import type { Page } from "../types/stack";
import { ThemePicker } from "./ThemePicker";

type AppHeaderProps = {
  activePresetName: string;
  page: Page;
  setPage: Dispatch<SetStateAction<Page>>;
  theme: ThemeState;
};

export function AppHeader({
  activePresetName,
  page,
  setPage,
  theme,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">Local LAMP stack / {activePresetName}</p>
        <h1>StackPilot</h1>
      </div>

      <div className="header-actions">
        <ThemePicker theme={theme.theme} onThemeChange={theme.setTheme} />

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
  );
}
