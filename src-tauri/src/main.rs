// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::process::Command;

#[derive(Clone, Copy)]
struct Service {
    name: &'static str,
    label: &'static str,
}

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

#[derive(Serialize)]
struct CommandResult {
    success: bool,
    code: Option<i32>,
    stdout: String,
    stderr: String,
}

const SERVICES: [Service; 3] = [
    Service {
        name: "httpd",
        label: "Apache HTTP Server",
    },
    Service {
        name: "mariadb",
        label: "MariaDB",
    },
    Service {
        name: "php-fpm",
        label: "PHP-FPM",
    },
];

const ACTIONS: [&str; 3] = ["start", "stop", "restart"];

fn resolve_service(name: &str) -> Result<Service, String> {
    SERVICES
        .iter()
        .copied()
        .find(|service| service.name == name)
        .ok_or_else(|| format!("Unsupported service: {name}"))
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

fn read_systemctl_field(service: Service, field: &str) -> Result<CommandResult, String> {
    run_command("systemctl", &[field, service.name])
}

fn service_status(service: Service) -> ServiceStatus {
    let active_result = read_systemctl_field(service, "is-active");
    let enabled_result = read_systemctl_field(service, "is-enabled");

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
        name: service.name.to_string(),
        label: service.label.to_string(),
        ok: active_state == "active",
        active_state,
        enabled_state,
        message,
    }
}

#[tauri::command]
fn get_service_statuses() -> Vec<ServiceStatus> {
    SERVICES.iter().copied().map(service_status).collect()
}

#[tauri::command]
fn run_service_action(service: String, action: String) -> Result<CommandResult, String> {
    let service = resolve_service(&service)?;
    validate_action(&action)?;

    run_command("pkexec", &["systemctl", &action, service.name])
}

#[tauri::command]
fn get_service_logs(service: String, lines: Option<u16>) -> Result<CommandResult, String> {
    let service = resolve_service(&service)?;
    let line_count = lines.unwrap_or(80).clamp(20, 500).to_string();

    run_command(
        "journalctl",
        &[
            "-u",
            service.name,
            "-n",
            &line_count,
            "--no-pager",
            "--output=short-iso",
        ],
    )
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_service_statuses,
            run_service_action,
            get_service_logs
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
