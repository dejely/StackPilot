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
- Theme selection with light, dark, terminal-style, block-style, and shadcn variants.
- Linux AppImage and Windows installer release workflow through GitHub Actions.

## Requirements

Runtime requirements:

- Linux desktop environment with WebKitGTK support.
- `systemd` services named `httpd`, `mariadb`, and `php-fpm`.
- `pkexec` for privileged service actions.
- `journalctl` for service log retrieval.
- `php` on `PATH` for the project preview server.

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
  librsvg2-dev \
  libssl-dev \
  libwebkit2gtk-4.1-dev \
  libxdo-dev \
  patchelf \
  wget
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
git tag v0.1.0
git push origin v0.1.0
```

The Linux workflow also supports manual runs with a tag input. The Windows workflow is manual-only, so run it from GitHub Actions with the same tag if you want both artifacts attached to the same draft release.

The Windows artifact is useful for installer packaging checks, but StackPilot's current service controls are Linux-specific. Windows service support would require separate backend commands.

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
- Saved theme key: `stackpilot.theme`.
- Tauri bundle configuration: `src-tauri/tauri.conf.json`.

## Project Preview Server

The project preview server does not rewrite Apache configuration. It starts a user-space PHP server for the selected project root:

```bash
php -S 127.0.0.1:<available-port> -t <project-root>
```

StackPilot searches ports `8000` through `8099` first, then asks the OS for an available fallback port. This avoids serving projects from a home directory through Apache, which can run into document root, Unix permission, or SELinux constraints.

Use Apache service controls for the system stack. Use Open Project Site for the project-specific PHP preview.

## Known Limits

- Service names are currently hard-coded to Fedora-style `httpd`, `mariadb`, and `php-fpm`.
- Service management requires a desktop session where `pkexec` can prompt for authorization.
- The browser-only Vite preview cannot access Tauri commands.
- The project preview server uses PHP's built-in server and is intended for local development, not production hosting.
- Windows release artifacts can be built, but service control behavior is currently Linux-only.

## Repository Notes

Keep release-related changes synchronized between:

- `package.json`
- `src-tauri/tauri.conf.json`
- `.github/workflows/release-appimage.yml`

When changing service names, add them in both the frontend service definitions and Rust backend service list.
