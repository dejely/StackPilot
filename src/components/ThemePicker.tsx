import { UI_THEMES, type ThemeId } from "../themes";

type ThemePickerProps = {
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
};

export function ThemePicker({ theme, onThemeChange }: ThemePickerProps) {
  return (
    <label className="theme-picker">
      <span>Theme</span>
      <select
        aria-label="UI theme"
        onChange={(event) => onThemeChange(event.target.value as ThemeId)}
        value={theme}
      >
        {UI_THEMES.map((themeOption) => (
          <option key={themeOption.id} value={themeOption.id}>
            {themeOption.name}
          </option>
        ))}
      </select>
    </label>
  );
}
