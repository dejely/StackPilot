export const DEFAULT_THEME_ID = "default";

export const UI_THEMES = [
  {
    id: DEFAULT_THEME_ID,
    name: "Default",
    description: "Clean desktop control panel styling.",
    colorScheme: "light",
    swatches: ["#256f9f", "#fbfcfe", "#1f7a4d"],
  },
  {
    id: "blockcraft",
    name: "Blockcraft",
    description: "Pixel-block panels inspired by voxel game UIs.",
    colorScheme: "dark",
    swatches: ["#58a83f", "#3b2413", "#e8c65a"],
  },
  {
    id: "shadcn",
    name: "shadcn",
    description: "Neutral, restrained, component-library feel.",
    colorScheme: "light",
    swatches: ["#18181b", "#ffffff", "#71717a"],
  },
  {
    id: "midnight",
    name: "Midnight Ops",
    description: "Dark operational dashboard theme.",
    colorScheme: "dark",
    swatches: ["#57a9db", "#171c21", "#4ab681"],
  },
  {
    id: "terminal",
    name: "Terminal",
    description: "High-contrast console look for log-heavy work.",
    colorScheme: "dark",
    swatches: ["#39ff88", "#050806", "#ffd166"],
  },
] as const;

export type ThemeId = (typeof UI_THEMES)[number]["id"];

export function isThemeId(value: string | null): value is ThemeId {
  return UI_THEMES.some((theme) => theme.id === value);
}
