// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ServiceStatus {
    name: String,
    label: String,
    active_state: String,
    enabled_state: Option<String>,
    ok: bool,
    message: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServiceRequest {
    name: String,
    label: String,
}

#[derive(Serialize)]
struct CommandResult {
    success: bool,
    code: Option<i32>,
    stdout: String,
    stderr: String,
}

struct ProjectServer {
    child: Child,
    root: PathBuf,
    port: u16,
}

impl Drop for ProjectServer {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectServerStatus {
    running: bool,
    root: Option<String>,
    url: Option<String>,
    port: Option<u16>,
    message: String,
}

type ProjectServerState = Mutex<Option<ProjectServer>>;

const ACTIONS: [&str; 3] = ["start", "stop", "restart"];

fn validate_service_name(name: &str) -> Result<(), String> {
    let is_valid = !name.trim().is_empty()
        && name
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_.@:-".contains(character));

    is_valid.then_some(()).ok_or_else(|| {
        format!(
            "Invalid service unit name: {name}. Use only letters, numbers, dots, dashes, underscores, colons, and @."
        )
    })
}

fn validate_action(action: &str) -> Result<(), String> {
    ACTIONS
        .contains(&action)
        .then_some(())
        .ok_or_else(|| format!("Unsupported service action: {action}"))
}

fn run_command(program: &str, args: &[&str]) -> Result<CommandResult, String> {
    Command::new(program)
        .args(args)
        .output()
        .map(|output| CommandResult {
            success: output.status.success(),
            code: output.status.code(),
            stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
        })
        .map_err(|error| format!("Failed to run {program}: {error}"))
}

fn inactive_project_server_status(message: impl Into<String>) -> ProjectServerStatus {
    ProjectServerStatus {
        running: false,
        root: None,
        url: None,
        port: None,
        message: message.into(),
    }
}

fn running_project_server_status(server: &ProjectServer) -> ProjectServerStatus {
    let url = format!("http://127.0.0.1:{}", server.port);

    ProjectServerStatus {
        running: true,
        root: Some(server.root.display().to_string()),
        url: Some(url.clone()),
        port: Some(server.port),
        message: format!("Project server is running at {url}."),
    }
}

fn validate_project_root(project_root: &str) -> Result<PathBuf, String> {
    let trimmed = project_root.trim();

    if trimmed.is_empty() {
        return Err("Project root must be a non-empty absolute path.".to_string());
    }

    let path = PathBuf::from(trimmed);

    if !path.is_absolute() {
        return Err("Project root must be an absolute path.".to_string());
    }

    let canonical_path = fs::canonicalize(&path)
        .map_err(|error| format!("Could not read project root {trimmed}: {error}"))?;

    if !canonical_path.is_dir() {
        return Err(format!(
            "Project root is not a directory: {}",
            canonical_path.display()
        ));
    }

    Ok(canonical_path)
}

fn find_available_port() -> Result<u16, String> {
    for port in 8000..=8099 {
        if TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return Ok(port);
        }
    }

    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|error| format!("Could not find an available localhost port: {error}"))?;

    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| format!("Could not read localhost port: {error}"))
}

fn project_server_is_running(server: &mut ProjectServer) -> bool {
    matches!(server.child.try_wait(), Ok(None))
}

fn clear_finished_project_server(project_server: &mut Option<ProjectServer>) {
    let should_clear = match project_server.as_mut() {
        Some(server) => !project_server_is_running(server),
        None => false,
    };

    if should_clear {
        *project_server = None;
    }
}

fn spawn_project_server(root: &Path, port: u16) -> Result<ProjectServer, String> {
    let address = format!("127.0.0.1:{port}");

    let mut child = Command::new("php")
        .arg("-S")
        .arg(&address)
        .arg("-t")
        .arg(root)
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Failed to start PHP server. Is php installed? {error}"))?;

    thread::sleep(Duration::from_millis(180));

    match child.try_wait() {
        Ok(Some(status)) => Err(format!(
            "PHP server exited immediately with status {status}."
        )),
        Ok(None) => Ok(ProjectServer {
            child,
            root: root.to_path_buf(),
            port,
        }),
        Err(error) => Err(format!("Could not verify PHP server status: {error}")),
    }
}

fn read_systemctl_field(service_name: &str, field: &str) -> Result<CommandResult, String> {
    run_command("systemctl", &[field, service_name])
}

fn service_status(service: &ServiceRequest) -> ServiceStatus {
    if let Err(error) = validate_service_name(&service.name) {
        return ServiceStatus {
            name: service.name.clone(),
            label: service.label.clone(),
            active_state: "unknown".to_string(),
            enabled_state: None,
            ok: false,
            message: error,
        };
    }

    let active_result = read_systemctl_field(&service.name, "is-active");
    let enabled_result = read_systemctl_field(&service.name, "is-enabled");

    let active_state = match &active_result {
        Ok(result) if !result.stdout.is_empty() => result.stdout.clone(),
        Ok(_) => "unknown".to_string(),
        Err(_) => "unknown".to_string(),
    };

    let enabled_state = match &enabled_result {
        Ok(result) if !result.stdout.is_empty() => Some(result.stdout.clone()),
        _ => None,
    };

    let message = match &active_result {
        Ok(result) if result.success => "Service is active.".to_string(),
        Ok(result) if !result.stderr.is_empty() => result.stderr.clone(),
        Ok(result) if !result.stdout.is_empty() => format!("Service is {}.", result.stdout),
        Ok(_) => "Service state could not be determined.".to_string(),
        Err(error) => error.clone(),
    };

    ServiceStatus {
        name: service.name.clone(),
        label: service.label.clone(),
        ok: active_state == "active",
        active_state,
        enabled_state,
        message,
    }
}

#[tauri::command]
fn get_service_statuses(services: Vec<ServiceRequest>) -> Result<Vec<ServiceStatus>, String> {
    if services.is_empty() {
        return Err("At least one service must be configured.".to_string());
    }

    if services.len() > 8 {
        return Err("Too many services configured.".to_string());
    }

    Ok(services.iter().map(service_status).collect())
}

#[tauri::command]
fn run_service_action(service: String, action: String) -> Result<CommandResult, String> {
    validate_service_name(&service)?;
    validate_action(&action)?;

    run_command("pkexec", &["systemctl", &action, service.as_str()])
}

#[tauri::command]
fn get_service_logs(service: String, lines: Option<u16>) -> Result<CommandResult, String> {
    validate_service_name(&service)?;
    let line_count = lines.unwrap_or(80).clamp(20, 500).to_string();

    run_command(
        "journalctl",
        &[
            "-u",
            service.as_str(),
            "-n",
            &line_count,
            "--no-pager",
            "--output=short-iso",
        ],
    )
}

#[tauri::command]
fn get_project_server_status(
    state: tauri::State<ProjectServerState>,
) -> Result<ProjectServerStatus, String> {
    let mut project_server = state
        .lock()
        .map_err(|_| "Project server state lock was poisoned.".to_string())?;

    clear_finished_project_server(&mut project_server);

    Ok(match project_server.as_ref() {
        Some(server) => running_project_server_status(server),
        None => inactive_project_server_status("Project server is stopped."),
    })
}

#[tauri::command]
fn start_project_server(
    project_root: String,
    state: tauri::State<ProjectServerState>,
) -> Result<ProjectServerStatus, String> {
    let root = validate_project_root(&project_root)?;
    let mut project_server = state
        .lock()
        .map_err(|_| "Project server state lock was poisoned.".to_string())?;

    clear_finished_project_server(&mut project_server);

    if let Some(server) = project_server.as_ref() {
        if server.root == root {
            return Ok(running_project_server_status(server));
        }
    }

    *project_server = None;

    let port = find_available_port()?;
    let server = spawn_project_server(&root, port)?;
    let status = running_project_server_status(&server);
    *project_server = Some(server);

    Ok(status)
}

#[tauri::command]
fn stop_project_server(
    state: tauri::State<ProjectServerState>,
) -> Result<ProjectServerStatus, String> {
    let mut project_server = state
        .lock()
        .map_err(|_| "Project server state lock was poisoned.".to_string())?;

    *project_server = None;

    Ok(inactive_project_server_status("Project server stopped."))
}

fn main() {
    tauri::Builder::default()
        .manage(ProjectServerState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_service_statuses,
            run_service_action,
            get_service_logs,
            get_project_server_status,
            start_project_server,
            stop_project_server
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
