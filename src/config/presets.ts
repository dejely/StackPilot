import { DEFAULT_PHPMYADMIN_URL, DEFAULT_PROJECT_ROOT } from "./defaults";
import type { PresetId, StackPreset } from "../types/stack";

export const STACK_PRESETS = [
  {
    id: "fedora",
    name: "Fedora",
    platform: "linux",
    projectRoot: DEFAULT_PROJECT_ROOT,
    xamppMode: false,
    phpMyAdminUrl: DEFAULT_PHPMYADMIN_URL,
    description: "Fedora package names and systemd units.",
    services: [
      { role: "web", name: "httpd", label: "Apache HTTP Server" },
      { role: "database", name: "mariadb", label: "MariaDB" },
      { role: "php", name: "php-fpm", label: "PHP-FPM" },
    ],
  },
  {
    id: "arch",
    name: "Arch",
    platform: "linux",
    projectRoot: "/srv/http",
    xamppMode: false,
    phpMyAdminUrl: DEFAULT_PHPMYADMIN_URL,
    description: "Arch defaults for Apache, MariaDB, and PHP-FPM.",
    services: [
      { role: "web", name: "httpd", label: "Apache HTTP Server" },
      { role: "database", name: "mariadb", label: "MariaDB" },
      { role: "php", name: "php-fpm", label: "PHP-FPM" },
    ],
  },
  {
    id: "ubuntu",
    name: "Ubuntu",
    platform: "linux",
    projectRoot: DEFAULT_PROJECT_ROOT,
    xamppMode: false,
    phpMyAdminUrl: DEFAULT_PHPMYADMIN_URL,
    description: "Ubuntu Apache unit names. Edit PHP-FPM if your version differs.",
    services: [
      { role: "web", name: "apache2", label: "Apache HTTP Server" },
      { role: "database", name: "mariadb", label: "MariaDB" },
      { role: "php", name: "php8.3-fpm", label: "PHP-FPM" },
    ],
  },
  {
    id: "debian",
    name: "Debian",
    platform: "linux",
    projectRoot: DEFAULT_PROJECT_ROOT,
    xamppMode: false,
    phpMyAdminUrl: DEFAULT_PHPMYADMIN_URL,
    description: "Debian Apache unit names. Edit PHP-FPM if your version differs.",
    services: [
      { role: "web", name: "apache2", label: "Apache HTTP Server" },
      { role: "database", name: "mariadb", label: "MariaDB" },
      { role: "php", name: "php8.2-fpm", label: "PHP-FPM" },
    ],
  },
  {
    id: "windows",
    name: "Windows",
    platform: "windows",
    projectRoot: "C:\\xampp\\htdocs",
    xamppMode: true,
    phpMyAdminUrl: DEFAULT_PHPMYADMIN_URL,
    description: "XAMPP-style paths. systemd controls are disabled.",
    services: [
      { role: "web", name: "apache", label: "Apache HTTP Server" },
      { role: "database", name: "mysql", label: "MySQL or MariaDB" },
      { role: "php", name: "php", label: "PHP" },
    ],
  },
] satisfies StackPreset[];

export const DEFAULT_PRESET = STACK_PRESETS[0];

export function isPresetId(value: string | null): value is PresetId {
  return STACK_PRESETS.some((preset) => preset.id === value);
}

export function getPreset(id: PresetId): StackPreset {
  return STACK_PRESETS.find((preset) => preset.id === id) || DEFAULT_PRESET;
}
