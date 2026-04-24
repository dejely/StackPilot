# StackPilot

StackPilot is a Tauri desktop control panel for a local PHP development stack. It is built for Linux workflows where Apache, MariaDB, and PHP-FPM are managed through `systemd`, but the UI also includes a per-project PHP preview server for projects that live outside Apache's configured document root.

why?
`becasue XAMPP does not work on Arch`

The goal is to provide a small native dashboard for the common tasks usually handled manually with `systemctl`, `journalctl`, and a browser.

## Features

- Service status polling for `httpd`, `mariadb`, and `php-fpm`.
- Start, stop, and restart actions through `pkexec systemctl`.
- Recent service logs through `journalctl`.
- Configurable project root path.
- Project folder opening through the Tauri opener plugin.
- Per-project preview server using `php -S 127.0.0.1:<port> -t <projectRoot>`.
- First-run distro presets for Fedora, Arch, Ubuntu, Debian, and Windows/XAMPP.
- First-run setup screen for distro presets, XAMPP compatibility, and the project root before the dashboard opens.
- Built-in phpMyAdmin shortcut, defaulting to `http://localhost/phpmyadmin`.
- Theme selection with light, dark, terminal-style, block-style, and shadcn variants.
- Linux AppImage and Windows installer release workflow through GitHub Actions.

## Requirements

Runtime requirements:

- Linux desktop environment with WebKitGTK support.
- `systemd` services named `httpd`, `mariadb`, and `php-fpm`.
- `pkexec` for privileged service actions.
- `journalctl` for service log retrieval.
- `php` on `PATH` for the project preview server.
- A local phpMyAdmin installation if the phpMyAdmin shortcut is used.

Development requirements:

- Node.js 22 or compatible.
- pnpm 10.
- Rust stable toolchain.
- Tauri Linux build dependencies for your distribution.

The GitHub release workflow uses Ubuntu 22.04 and installs these Linux packages:

```bash
sudo apt-get install -y \
  build-essential \
  curl \
  file \
  libayatana-appindicator3-dev \
  libfuse2 \
  librsvg2-dev \
  libssl-dev \
  libwebkit2gtk-4.1-dev \
  libxdo-dev \
  patchelf \
  wget
```

On Fedora, install the equivalent build packages through `dnf`. AppImage bundling also needs the FUSE runtime libraries:

```bash
sudo dnf install fuse fuse-libs
```

## Development

Install dependencies:

```bash
pnpm install
```

Run the Vite frontend only:

```bash
pnpm dev
```

Run the full desktop app:

```bash
pnpm tauri dev
```

Build the frontend:

```bash
pnpm build
```

Check the Rust backend:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

## Building an AppImage

Build a Linux AppImage locally with:

```bash
pnpm appimage
```

This runs:

```bash
tauri build --bundles appimage
```

The AppImage is written under:

```text
src-tauri/target/release/bundle/appimage/
```

The local build uses the Tauri configuration in:

```text
src-tauri/tauri.conf.json
```

## Release Builds

Linux AppImage releases use:

```text
.github/workflows/release-appimage.yml
```

This workflow runs on `ubuntu-22.04` and builds:

```bash
tauri build --bundles appimage
```

Windows installer releases use:

```text
.github/workflows/release-windows.yml
```

This workflow runs on `windows-latest` and builds:

```bash
tauri build --bundles nsis
```

Create a draft release by pushing a version tag:

```bash
git tag v0.3.0
git push origin v0.3.0
```

The Linux workflow also supports manual runs with a tag input. The Windows workflow is manual-only, so run it from GitHub Actions with the same tag if you want both artifacts attached to the same draft release.

The Windows artifact is useful for installer packaging checks, but StackPilot's current service controls are Linux-specific. Windows service support would require separate backend commands.

For local AppImage builds on newer Fedora releases, use:

```bash
pnpm run appimage
```

This script sets `NO_STRIP=1` before running Tauri. Fedora 43 system libraries can contain newer ELF sections such as `.relr.dyn`, and the `strip` binary bundled inside `linuxdeploy` may fail to process them.

## Architecture

Frontend:

- React 18.
- Vite.
- Theme metadata in `src/themes.ts`.
- Main application UI in `src/App.tsx`.
- Styling in `src/App.css`.

Backend:

- Tauri 2.
- Rust commands in `src-tauri/src/main.rs`.
- `systemctl` and `journalctl` are executed through `std::process::Command`.
- Service actions use `pkexec systemctl <action> <service>`.
- The project preview server is stored as Tauri state and is killed when replaced or when the app exits.

Configuration:

- Default project root: `/var/www/html`.
- Saved project root key: `stackpilot.projectRoot`.
- Saved project folder key: `stackpilot.projectName`.
- Saved phpMyAdmin URL key: `stackpilot.phpMyAdminUrl`.
- Saved distro preset key: `stackpilot.distroPreset`.
- Saved service unit map key: `stackpilot.serviceUnits`.
- Saved Windows mode key: `stackpilot.windowsMode`.
- Saved XAMPP mode key: `stackpilot.xamppMode`.
- First-run setup key: `stackpilot.setupComplete`.
- Saved theme key: `stackpilot.theme`.
- Tauri bundle configuration: `src-tauri/tauri.conf.json`.

## Distro Presets

The first-run setup opens as a dedicated setup screen before the dashboard starts polling services. Linux users can choose Fedora, Arch, Ubuntu, or Debian. Windows users can enable the Windows/XAMPP checkbox.

Presets set the initial project root, phpMyAdmin URL, XAMPP mode, and service unit names:

- Fedora: `httpd`, `mariadb`, `php-fpm`, root `/var/www/html`.
- Arch: `httpd`, `mariadb`, `php-fpm`, root `/srv/http`.
- Ubuntu: `apache2`, `mariadb`, `php8.3-fpm`, root `/var/www/html`.
- Debian: `apache2`, `mariadb`, `php8.2-fpm`, root `/var/www/html`.
- Windows/XAMPP: root `C:\xampp\htdocs`, systemd controls disabled.

The service unit names remain editable in Settings because PHP-FPM unit names vary by installed PHP version.

## XAMPP Compatibility Mode

On first launch, StackPilot asks for the local folder that should behave like `htdocs`, a project folder name, and a phpMyAdmin URL.

When XAMPP compatibility mode is enabled:

- The project root is treated as the htdocs equivalent.
- Open Project Site serves `<htdocs>/<project-name>` with PHP's built-in server.
- Open Project Root opens the htdocs equivalent folder.
- StackPilot still shows the Apache-style route `http://localhost/<project-name>/` for reference.
- The phpMyAdmin button opens the configured phpMyAdmin URL.

This avoids Apache 404s when Fedora's `httpd` document root is still `/var/www/html` and the configured htdocs-equivalent folder lives elsewhere.

## Project Preview Server

The project preview server does not rewrite Apache configuration. It starts a user-space PHP server for the selected project root:

```bash
php -S 127.0.0.1:<available-port> -t <project-root>
```

StackPilot searches ports `8000` through `8099` first, then asks the OS for an available fallback port. This avoids serving projects from a home directory through Apache, which can run into document root, Unix permission, or SELinux constraints.

Use Apache service controls for the system stack. Use Open Project Site for the project-specific PHP preview.

## Known Limits

- Windows mode disables systemd service controls. Use XAMPP Control Panel or Windows services for stack-level actions on Windows.
- Service management requires a desktop session where `pkexec` can prompt for authorization.
- The browser-only Vite preview cannot access Tauri commands.
- The project preview server uses PHP's built-in server and is intended for local development, not production hosting.
- Linux service unit names are preset-based and editable. Invalid unit names are rejected before running `systemctl`.

## Repository Notes

Keep release-related changes synchronized between:

- `package.json`
- `src-tauri/tauri.conf.json`
- `.github/workflows/release-appimage.yml`

When adding a new distro preset, update `STACK_PRESETS` in `src/App.tsx`. The Rust backend validates service unit names at runtime instead of keeping a distro-specific service list.
