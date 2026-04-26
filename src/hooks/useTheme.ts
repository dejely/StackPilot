import { useEffect, useMemo, useState } from "react";

import {
  DEFAULT_THEME_ID,
  UI_THEMES,
  type ThemeId,
  isThemeId,
} from "../themes";
import { storageKeys } from "../config/storage";

function getInitialTheme(): ThemeId {
  const savedTheme = localStorage.getItem(storageKeys.theme);

  if (isThemeId(savedTheme)) {
    return savedTheme;
  }

  if (savedTheme === "dark") {
    return "midnight";
  }

  return DEFAULT_THEME_ID;
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>(getInitialTheme);

  const activeTheme = useMemo(() => {
    return (
      UI_THEMES.find((themeOption) => themeOption.id === theme) || UI_THEMES[0]
    );
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = activeTheme.colorScheme;
    localStorage.setItem(storageKeys.theme, theme);
  }, [activeTheme.colorScheme, theme]);

  return { theme, setTheme, activeTheme };
}

export type ThemeState = ReturnType<typeof useTheme>;
