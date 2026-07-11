use axum::{
    extract::{
        ws::{Message as AxumMessage, WebSocket, WebSocketUpgrade},
        State, Query,
    },
    http::{HeaderName, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, oneshot};
use tower_http::cors::CorsLayer;
use futures_util::{sink::SinkExt, stream::StreamExt};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri::Emitter;

#[derive(Clone)]
struct AppState {
    connections: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<AxumMessage>>>>,
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<serde_json::Value>>>>,
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

    /// Emit a log entry prefixed with the service name for clarity in the activity log.
    async fn log(&self, service: &str, message: String) {
        self.emit_status("active", self.connections.lock().await.len(), Some(format!("[{}] {}", service, message))).await;
    }
}

#[derive(Deserialize)]
struct PairingPayload {
    #[serde(rename = "pairingId")]
    pairing_id: String,
}

#[derive(Deserialize)]
struct ExportPayload {
    #[serde(rename = "pairingId")]
    pairing_id: String,
    #[serde(rename = "shapeId")]
    shape_id: String,
    format: String,
    scale: f64,
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
        pending: Arc::new(Mutex::new(HashMap::new())),
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
                    "message": "[Bridge] Starting HTTPS server on localhost:4401…",
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

async fn start_https_server(state: AppState) {
    let cors = CorsLayer::new()
        .allow_private_network(true)
        .allow_origin(tower_http::cors::AllowOrigin::mirror_request())
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    let app = Router::new()
        .route("/health", get(handle_health))
        // WebSocket route handles both GET (upgrade) and OPTIONS (PNA preflight)
        .route("/ws", get(ws_handler).options(ws_preflight))
        .route("/detect-figma", post(handle_detect_figma))
        .route("/detect-penpot", post(handle_detect_penpot))
        .route("/export-penpot", post(handle_export_penpot))
        .layer(cors)
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
    state.log("Bridge", "Ready — accepting connections from Penpot Companion Plugin and SyncBoard Miro plugin.".to_string()).await;

    if let Err(e) = axum_server::bind_rustls(addr, config)
        .serve(app.into_make_service())
        .await
    {
        eprintln!("Axum server shut down with error: {}", e);
        state.emit_status("error", 0, Some(format!("[Bridge] Server shut down: {}", e))).await;
    }
}

// ── Private Network Access (PNA) preflight for WebSocket ──────────
// Chrome sends an OPTIONS preflight before the WebSocket upgrade when
// the target is on a local/private network. This handler responds
// correctly so Chrome allows the wss:// connection through.
async fn ws_preflight(
    State(state): State<AppState>,
) -> impl IntoResponse {
    state.log("Bridge", "PNA preflight received for WebSocket — allowing private network access.".to_string()).await;
    let headers = [
        (HeaderName::from_static("access-control-allow-origin"), HeaderValue::from_static("*")),
        (HeaderName::from_static("access-control-allow-methods"), HeaderValue::from_static("GET")),
        (HeaderName::from_static("access-control-allow-private-network"), HeaderValue::from_static("true")),
    ];
    (StatusCode::NO_CONTENT, headers)
}

// ── WebSocket handler ────────────────────────────────────────────
async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<HashMap<String, String>>,
    State(state): State<AppState>,
) -> Response {
    let pairing_id = params.get("pairingId").cloned().unwrap_or_default();
    let mut response = ws
        .on_upgrade(move |socket| handle_socket(socket, pairing_id, state))
        .into_response();

    // Chrome's PNA also requires the header in the 101 Switching Protocols response
    response.headers_mut().insert(
        HeaderName::from_static("access-control-allow-private-network"),
        HeaderValue::from_static("true"),
    );
    response
}

async fn handle_socket(socket: WebSocket, pairing_id: String, state: AppState) {
    if pairing_id.is_empty() {
        state.log("Bridge", "Rejected WebSocket with empty pairingId.".to_string()).await;
        return;
    }

    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<AxumMessage>();

    let sessions = {
        let mut conns = state.connections.lock().await;
        conns.insert(pairing_id.clone(), tx);
        conns.len()
    };
    state.log("Penpot", format!("Plugin connected (pairingId: {}, {} active session{})",
        pairing_id, sessions, if sessions == 1 { "" } else { "s" })).await;

    let mut write_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(msg).await.is_err() {
                break;
            }
        }
    });

    let state_clone = state.clone();
    let pairing_id_clone = pairing_id.clone();
    let mut read_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let AxumMessage::Text(text) = msg {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                    // Log incoming messages from the Penpot plugin
                    if let Some(action) = val.get("action").and_then(|v| v.as_str()) {
                        let name = val.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
                        state_clone.log("Penpot", format!("Plugin responded to '{}' — {}", action, name)).await;
                    }
                    if let Some(req_id) = val.get("id").and_then(|v| v.as_str()) {
                        let mut pending = state_clone.pending.lock().await;
                        if let Some(tx) = pending.remove(req_id) {
                            let data = val.get("data").cloned().unwrap_or(serde_json::Value::Null);
                            let _ = tx.send(data);
                        }
                    }
                }
            }
        }
    });

    tokio::select! {
        _ = (&mut write_task) => {}
        _ = (&mut read_task) => {}
    }

    let sessions = {
        let mut conns = state.connections.lock().await;
        conns.remove(&pairing_id_clone);
        conns.len()
    };
    state.log("Penpot", format!("Plugin disconnected (pairingId: {}, {} active session{})",
        pairing_id_clone, sessions, if sessions == 1 { "" } else { "s" })).await;
}

// ── Figma detection ──────────────────────────────────────────────
async fn handle_detect_figma(State(state): State<AppState>) -> impl IntoResponse {
    state.log("Miro", format!("→ Requested Figma selection detection")).await;
    state.log("Figma", "Detecting local selection…".to_string()).await;

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": "get_design_context",
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

    state.log("Figma", "No selection found in active design file.".to_string()).await;
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

// ── Penpot selection detection (WSS relay) ───────────────────────
async fn handle_detect_penpot(
    State(state): State<AppState>,
    Json(payload): Json<PairingPayload>,
) -> impl IntoResponse {
    if payload.pairing_id.is_empty() {
        return (
            StatusCode::OK,
            Json(ApiResponse {
                error: None,
                data: Some(serde_json::json!({ "status": "ok" })),
            }),
        );
    }

    state.log("Miro", format!("→ Requested Penpot selection detection (pairingId: {})", payload.pairing_id)).await;
    state.log("Penpot", format!("Selection query for pairingId: {}", payload.pairing_id)).await;

    let tx = {
        let conn = state.connections.lock().await;
        conn.get(&payload.pairing_id).cloned()
    };

    let tx = match tx {
        Some(t) => t,
        None => {
            state.log("Penpot", format!("Tab not connected (pairingId: {})", payload.pairing_id)).await;
            return (
                StatusCode::NOT_FOUND,
                Json(ApiResponse {
                    error: Some("Penpot tab not connected. Make sure the Companion Plugin is active.".to_string()),
                    data: None::<serde_json::Value>,
                }),
            );
        }
    };

    let req_id = format!("req_{}", rand_id());
    let (reply_tx, reply_rx) = oneshot::channel::<serde_json::Value>();

    state.pending.lock().await.insert(req_id.clone(), reply_tx);

    let ws_msg = serde_json::json!({
        "id": req_id,
        "action": "select"
    });

    if tx.send(AxumMessage::Text(ws_msg.to_string())).is_err() {
        state.pending.lock().await.remove(&req_id);
        state.log("Penpot", format!("Failed to send selection request to plugin (pairingId: {})", payload.pairing_id)).await;
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse {
                error: Some("Failed to transmit query request to Penpot client.".to_string()),
                data: None,
            }),
        );
    }

    let log_id = payload.pairing_id.clone();
    match tokio::time::timeout(std::time::Duration::from_secs(5), reply_rx).await {
        Ok(Ok(val)) => {
            if val.is_null() {
                state.log("Penpot", "Selection: empty (nothing selected in Penpot)".to_string()).await;
                (
                    StatusCode::OK,
                    Json(ApiResponse {
                        error: None,
                        data: None,
                    }),
                )
            } else {
                let name = val.get("name").and_then(|v| v.as_str()).unwrap_or("Penpot Screen");
                let shape_id = val.get("id").and_then(|v| v.as_str()).unwrap_or("unknown");
                state.log("Penpot", format!("Selected: {} (shapeId: {})", name, shape_id)).await;
                (
                    StatusCode::OK,
                    Json(ApiResponse {
                        error: None,
                        data: Some(val),
                    }),
                )
            }
        }
        _ => {
            state.pending.lock().await.remove(&req_id);
            state.log("Penpot", format!("Selection query timed out (pairingId: {})", log_id)).await;
            (
                StatusCode::GATEWAY_TIMEOUT,
                Json(ApiResponse {
                    error: Some("Penpot plugin timed out responding to selection query.".to_string()),
                    data: None,
                }),
            )
        }
    }
}

// ── Penpot frame export (WSS relay) ──────────────────────────────
async fn handle_export_penpot(
    State(state): State<AppState>,
    Json(payload): Json<ExportPayload>,
) -> impl IntoResponse {
    state.log("Miro", format!("→ Requested Penpot shape export (shapeId: {})", payload.shape_id)).await;
    state.log("Penpot", format!("Export request: shapeId={}, format={}, scale={}", payload.shape_id, payload.format, payload.scale)).await;

    let tx = {
        let conn = state.connections.lock().await;
        conn.get(&payload.pairing_id).cloned()
    };

    let tx = match tx {
        Some(t) => t,
        None => {
            state.log("Penpot", format!("Export failed — tab not connected (pairingId: {})", payload.pairing_id)).await;
            return (
                StatusCode::NOT_FOUND,
                Json(ApiResponse {
                    error: Some("Penpot tab not connected. Make sure the Companion Plugin is active.".to_string()),
                    data: None::<serde_json::Value>,
                }),
            );
        }
    };

    let req_id = format!("req_{}", rand_id());
    let (reply_tx, reply_rx) = oneshot::channel::<serde_json::Value>();

    state.pending.lock().await.insert(req_id.clone(), reply_tx);

    let ws_msg = serde_json::json!({
        "id": req_id,
        "action": "export",
        "shapeId": payload.shape_id,
        "format": payload.format,
        "scale": payload.scale
    });

    if tx.send(AxumMessage::Text(ws_msg.to_string())).is_err() {
        state.pending.lock().await.remove(&req_id);
        state.log("Penpot", format!("Failed to send export request to plugin (shapeId: {})", payload.shape_id)).await;
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse {
                error: Some("Failed to transmit render request to Penpot client.".to_string()),
                data: None,
            }),
        );
    }

    let shape_id_log = payload.shape_id.clone();
    match tokio::time::timeout(std::time::Duration::from_secs(15), reply_rx).await {
        Ok(Ok(val)) => {
            let svg_size = val.get("svg").and_then(|v| v.as_str()).map(|s| s.len()).unwrap_or(0);
            let b64_size = val.get("base64").and_then(|v| v.as_str()).map(|s| s.len()).unwrap_or(0);
            state.log("Penpot", format!("Export complete: shapeId={}, svg={}B, base64={}B", shape_id_log, svg_size, b64_size)).await;
            (
                StatusCode::OK,
                Json(ApiResponse {
                    error: None,
                    data: Some(val),
                }),
            )
        }
        _ => {
            state.pending.lock().await.remove(&req_id);
            state.log("Penpot", format!("Export timed out (shapeId: {})", shape_id_log)).await;
            (
                StatusCode::GATEWAY_TIMEOUT,
                Json(ApiResponse {
                    error: Some("Penpot plugin timed out responding to render query.".to_string()),
                    data: None,
                }),
            )
        }
    }
}

fn rand_id() -> String {
    let r: u32 = rand::random();
    format!("{:x}", r)
}

async fn handle_health() -> impl IntoResponse {
    (StatusCode::OK, Json(serde_json::json!({ "status": "ok" })))
}

#[tauri::command]
async fn get_bridge_status(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let sessions = state.connections.lock().await.len();
    Ok(serde_json::json!({
        "status": "active",
        "sessions": sessions,
    }))
}
