export function isWindowsAbsolutePath(path: string) {
  const trimmedPath = path.trim();
  return /^[A-Za-z]:[\\/]/.test(trimmedPath) || /^\\\\[^\\]+\\[^\\]+/.test(trimmedPath);
}

export function isUnixAbsolutePath(path: string) {
  return path.trim().startsWith("/");
}

export function isAbsolutePath(path: string, windowsMode = false) {
  return windowsMode
    ? isWindowsAbsolutePath(path) || isUnixAbsolutePath(path)
    : isUnixAbsolutePath(path);
}

export function isHttpUrl(url: string) {
  return url.startsWith("http://") || url.startsWith("https://");
}

export function normalizeProjectName(name: string) {
  return name.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

export function buildXamppProjectUrl(name: string) {
  const projectName = normalizeProjectName(name);

  if (!projectName) {
    return "http://localhost/";
  }

  const encodedProjectName = projectName
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `http://localhost/${encodedProjectName}/`;
}

export function joinPaths(root: string, child: string) {
  const trimmedRoot = root.trim();
  const trimmedChild = child.trim();

  if (isWindowsAbsolutePath(trimmedRoot) || trimmedRoot.includes("\\")) {
    return `${trimmedRoot.replace(/[\\/]+$/g, "")}\\${trimmedChild
      .replace(/^[\\/]+/g, "")
      .replace(/\//g, "\\")}`;
  }

  return `${trimmedRoot.replace(/\/+$/g, "")}/${trimmedChild.replace(
    /^\/+/g,
    "",
  )}`;
}
