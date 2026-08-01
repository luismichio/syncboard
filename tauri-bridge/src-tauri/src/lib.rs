use axum::{
    extract::State,
    http::{HeaderName, HeaderValue, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use axum::middleware;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri::Emitter;

#[derive(Clone)]
struct AppState {
    // WebSocket connections (legacy)
    connections: Arc<Mutex<HashMap<String, ()>>>,
    app_handle: Arc<Mutex<Option<tauri::AppHandle>>>,
}

impl AppState {
    async fn emit_status(&self, status: &str, sessions: usize, message: Option<String>) {
        if let Some(handle) = self.app_handle.lock().await.as_ref() {
            let _ = handle.emit("bridge_status", serde_json::json!({
                "status": status,
                "sessions": sessions,
                "message": message,
            }));
        }
    }

    async fn log(&self, service: &str, message: impl Into<String>) {
        let msg: String = message.into();
        self.emit_status("active", self.connections.lock().await.len(), Some(format!("[{}] {}", service, msg))).await;
    }
}









#[derive(Serialize)]
struct ApiResponse<T> {
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<T>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState {
        connections: Arc::new(Mutex::new(HashMap::new())),
        app_handle: Arc::new(Mutex::new(None)),
    };

    let state_clone = state.clone();
    tauri::async_runtime::spawn(async move {
        start_https_server(state_clone).await;
    });

    tauri::Builder::default()
        .manage(state.clone())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_bridge_status])
        .setup(move |app| {
            let handle = app.handle().clone();
            let app_handle_clone = state.app_handle.clone();
            tauri::async_runtime::spawn(async move {
                *app_handle_clone.lock().await = Some(handle.clone());
                handle.emit("bridge_status", serde_json::json!({
                    "status": "starting",
                    "sessions": 0,
                    "message": "[Bridge] Starting HTTPS server on localhost:4401\u{2026}",
                })).ok();
            });

            let quit_i = MenuItem::with_id(app, "quit", "Quit SyncBridge", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "quit" => app.exit(0),
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button, .. } = event {
                        if button == tauri::tray::MouseButton::Left {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Middleware that adds CORS and PNA headers to every response.
/// Handles OPTIONS preflight directly (returns 204 with all headers).
/// This replaces tower-http CorsLayer which had compatibility issues
/// with WebSocket upgrade (101) responses and PNA headers.
async fn add_cors_and_pna(
    request: axum::http::Request<axum::body::Body>,
    next: middleware::Next,
) -> impl IntoResponse {
    let method = request.method().clone();
    let uri = request.uri().clone();
    let origin = request
        .headers()
        .get("origin")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let allowed_origins = [
        "https://www.syncingboard.com",
        "https://syncingboard.com",
        "http://localhost:3000",
        "http://localhost:1420",
    ];

    let is_allowed = origin.is_empty() || allowed_origins.contains(&origin.as_str());

    if !is_allowed {
        eprintln!("[CORS+PNA] Forbidden Origin blocked: {origin}");
        return (
            StatusCode::FORBIDDEN,
            [(HeaderName::from_static("content-type"), HeaderValue::from_static("text/plain"))],
            "Forbidden Origin",
        ).into_response();
    }

    let ac_origin = if origin.is_empty() {
        HeaderValue::from_static("*")
    } else {
        HeaderValue::from_str(&origin).unwrap_or(HeaderValue::from_static("*"))
    };

    eprintln!("[CORS+PNA] {method} {uri} (origin: {origin})");

    // For OPTIONS preflight (CORS + PNA), return 204 with all headers
    if method == axum::http::Method::OPTIONS {
        eprintln!("[CORS+PNA] Returning OPTIONS preflight (204)");
        let headers = [
            (HeaderName::from_static("access-control-allow-origin"), ac_origin),
            (HeaderName::from_static("access-control-allow-methods"), HeaderValue::from_static("GET, POST, OPTIONS")),
            (HeaderName::from_static("access-control-allow-headers"), HeaderValue::from_static("*")),
            (HeaderName::from_static("access-control-allow-private-network"), HeaderValue::from_static("true")),
            (HeaderName::from_static("access-control-max-age"), HeaderValue::from_static("86400")),
        ];
        return (StatusCode::NO_CONTENT, headers).into_response();
    }

    // For non-OPTIONS requests, call next handler then add CORS + PNA
    let mut response = next.run(request).await;

    // Reflect origin or allow all
    response.headers_mut().insert(
        HeaderName::from_static("access-control-allow-origin"),
        ac_origin,
    );

    // PNA: required for Chrome when public sites access local/private network
    response.headers_mut().insert(
        HeaderName::from_static("access-control-allow-private-network"),
        HeaderValue::from_static("true"),
    );

    eprintln!("[CORS+PNA] Response status: {}", response.status());
    response
}

async fn start_https_server(state: AppState) {
    let app = Router::new()
        .route("/health", get(handle_health))
        .route("/miro/connect", post(handle_miro_connect))
        .route("/detect-figma", post(handle_detect_figma))
        .route_layer(middleware::from_fn(add_cors_and_pna))
        .with_state(state.clone());

    let cert_pem = include_bytes!("../resources/cert.pem");
    let key_pem = include_bytes!("../resources/key.pem");

    let config = match axum_server::tls_rustls::RustlsConfig::from_pem(cert_pem.to_vec(), key_pem.to_vec()).await {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to initialize SSL configuration: {}", e);
            state.emit_status("error", 0, Some(format!("[Bridge] SSL init failed: {}", e))).await;
            return;
        }
    };

    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], 4401));
    state.log("Bridge", format!("Listening on https://localhost:4401")).await;
    state.log("Bridge", "Ready \u{2014} accepting connections from Penpot Companion Plugin and SyncingBoard Miro plugin.").await;

    if let Err(e) = axum_server::bind_rustls(addr, config)
        .serve(app.into_make_service())
        .await
    {
        eprintln!("Axum server shut down with error: {}", e);
        state.emit_status("error", 0, Some(format!("[Bridge] Server shut down: {}", e))).await;
    }
}

// \u{2500}\u{2500} WebSocket handler \u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}




// ══ Penpot HTTP polling handlers ════════════════════════════════════════════







// \u{2500}\u{2500} Figma detection \u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}
async fn handle_detect_figma(State(state): State<AppState>) -> impl IntoResponse {
    state.log("Miro", format!("\u{2192} Requested Figma selection detection")).await;
    state.log("Figma", "Detecting local selection\u{2026}").await;

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": "get_selection",
            "arguments": {}
        },
        "id": 1
    });

    let res = match client.post("http://127.0.0.1:3845/mcp")
        .json(&body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            state.log("Figma", format!("Local server unreachable (port 3845): {}", e)).await;
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(ApiResponse {
                    error: Some(format!("Failed to connect to local Figma server: {}", e)),
                    data: None::<serde_json::Value>,
                }),
            );
        }
    };

    if !res.status().is_success() {
        state.log("Figma", format!("MCP server error (HTTP {})", res.status())).await;
        return (
            StatusCode::BAD_GATEWAY,
            Json(ApiResponse {
                error: Some(format!("Figma local server returned error status {}", res.status())),
                data: None,
            }),
        );
    }

    let payload = match res.json::<serde_json::Value>().await {
        Ok(p) => p,
        Err(e) => {
            state.log("Figma", format!("Failed to parse Figma MCP response: {}", e)).await;
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse {
                    error: Some(format!("Failed to parse Figma response: {}", e)),
                    data: None,
                }),
            );
        }
    };

    if let Some(text) = payload.pointer("/result/content/0/text").and_then(|v| v.as_str()) {
        let file_key = regex_capture(text, r"fileKey:\s*([a-zA-Z0-9]+)");
        let node_id = regex_capture(text, r"nodeId:\s*([a-zA-Z0-9\-:]+)");
        let name = regex_capture(text, r"name:\s*([^\n]+)").unwrap_or_else(|| "Figma Screen".to_string());

        if let (Some(fk), Some(nd)) = (file_key, node_id) {
            state.log("Figma", format!("Detected: {} (file: {}, node: {})", name, fk, nd)).await;
            return (
                StatusCode::OK,
                Json(ApiResponse {
                    error: None,
                    data: Some(serde_json::json!({
                        "id": nd,
                        "fileKey": fk,
                        "name": name
                    })),
                }),
            );
        }
    }

    state.log("Figma", "No selection found in active design file.").await;
    (
        StatusCode::NOT_FOUND,
        Json(ApiResponse {
            error: Some("Figma MCP returned empty selection details. Make sure your design file is active.".to_string()),
            data: None,
        }),
    )
}

fn regex_capture(text: &str, pattern: &str) -> Option<String> {
    let re = regex::Regex::new(pattern).ok()?;
    re.captures(text).and_then(|c| c.get(1)).map(|m| m.as_str().to_string())
}

// \u{2500}\u{2500} Penpot selection detection (WSS relay) \u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}


// \u{2500}\u{2500} Penpot frame export (WSS relay) \u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}




// Silent health check \u{2014} called by Miro plugin every 30s. No logging to avoid flooding.
async fn handle_health() -> impl IntoResponse {
    (StatusCode::OK, Json(serde_json::json!({ "status": "ok" })))
}

/// Called once by the Miro plugin when the user first connects to the bridge.
async fn handle_miro_connect(State(state): State<AppState>) -> impl IntoResponse {
    state.log("Miro", "Connected \u{2014} SyncingBoard plugin is now linked to SyncBridge").await;
    (StatusCode::OK, Json(serde_json::json!({ "status": "connected" })))
}

#[tauri::command]
async fn get_bridge_status(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let sessions = state.connections.lock().await.len();
    Ok(serde_json::json!({
        "status": "active",
        "sessions": sessions,
    }))
}
