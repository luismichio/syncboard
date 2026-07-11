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
    // Maps pairingId -> WS message channel to push commands to Penpot plugin
    connections: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<AxumMessage>>>>,
    // Maps requestId -> oneshot response channels awaiting Penpot plugin replies
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<serde_json::Value>>>>,
    // Late-initialized Tauri AppHandle to emit events
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
    // Shared memory state
    let state = AppState {
        connections: Arc::new(Mutex::new(HashMap::new())),
        pending: Arc::new(Mutex::new(HashMap::new())),
        app_handle: Arc::new(Mutex::new(None)),
    };

    // Spawn our background Axum HTTPS & WS secure bridge server
    let state_clone = state.clone();
    tauri::async_runtime::spawn(async move {
        start_https_server(state_clone).await;
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            // Set the app handle inside AppState
            let handle = app.handle().clone();
            let app_handle_clone = state.app_handle.clone();
            tauri::async_runtime::spawn(async move {
                *app_handle_clone.lock().await = Some(handle);
            });

            // Create tray menu items
            let quit_i = MenuItem::with_id(app, "quit", "Quit SyncBridge", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            // Create tray icon using app's default window icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "quit" => {
                            app.exit(0);
                        }
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
    // Configure CORS with native Private Network Access (PNA) preflight support.
    // This responds correctly to browser OPTIONS checks for cross-origin local network requests.
    let cors = CorsLayer::new()
        .allow_private_network(true)
        .allow_origin(tower_http::cors::Any)
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/detect-figma", post(handle_detect_figma))
        .route("/detect-penpot", post(handle_detect_penpot))
        .route("/export-penpot", post(handle_export_penpot))
        .layer(cors)
        .with_state(state.clone());

    // Include Let's Encrypt certificates directly into the binary
    let cert_pem = include_bytes!("../resources/cert.pem");
    let key_pem = include_bytes!("../resources/key.pem");

    let config = match axum_server::tls_rustls::RustlsConfig::from_pem(cert_pem.to_vec(), key_pem.to_vec()).await {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to initialize SSL configuration: {}", e);
            state.emit_status("error", 0, Some(format!("Failed to initialize SSL configuration: {}", e))).await;
            return;
        }
    };

    // Bind to 127.0.0.1:4401 (resolves to local-syncboard.luiskobayashi.com)
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], 4401));
    println!("Tauri Secure Bridge listening on https://127.0.0.1:4401");

    // Emit server startup log to the desktop webview
    state.emit_status("active", 0, Some("Secure loopback bridge server started successfully.".to_string())).await;

    if let Err(e) = axum_server::bind_rustls(addr, config)
        .serve(app.into_make_service())
        .await
    {
        eprintln!("Axum server shut down with error: {}", e);
        state.emit_status("error", 0, Some(format!("Server shut down: {}", e))).await;
    }
}

// WebSocket connection upgrade route
// Injects Access-Control-Allow-Private-Network: true directly into the
// 101 Switching Protocols response to satisfy Chrome's PNA preflight check.
async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<HashMap<String, String>>,
    State(state): State<AppState>,
) -> Response {
    let pairing_id = params.get("pairingId").cloned().unwrap_or_default();
    let mut response = ws
        .on_upgrade(move |socket| handle_socket(socket, pairing_id, state))
        .into_response();
    response.headers_mut().insert(
        HeaderName::from_static("access-control-allow-private-network"),
        HeaderValue::from_static("true"),
    );
    response
}

async fn handle_socket(socket: WebSocket, pairing_id: String, state: AppState) {
    if pairing_id.is_empty() {
        return;
    }

    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<AxumMessage>();

    // Register active Penpot connection and emit status
    let sessions = {
        let mut conns = state.connections.lock().await;
        conns.insert(pairing_id.clone(), tx);
        conns.len()
    };
    state.emit_status("active", sessions, Some(format!("Penpot connection established: {}", pairing_id))).await;

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
                    if let Some(req_id) = val.get("requestId").and_then(|v| v.as_str()) {
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

    // Deregister connection and emit status
    let sessions = {
        let mut conns = state.connections.lock().await;
        conns.remove(&pairing_id_clone);
        conns.len()
    };
    state.emit_status("active", sessions, Some(format!("Penpot connection closed: {}", pairing_id_clone))).await;
}

// Figma local selection detection handler
async fn handle_detect_figma(State(state): State<AppState>) -> impl IntoResponse {
    let sessions = state.connections.lock().await.len();
    state.emit_status("active", sessions, Some("Detecting Figma selection...".to_string())).await;

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

    // Query Figma Desktop local MCP server on port 3845
    let res = match client.post("http://127.0.0.1:3845/mcp")
        .json(&body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            state.emit_status("active", sessions, Some(format!("Figma local server unreachable: {}", e))).await;
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
        state.emit_status("active", sessions, Some(format!("Figma selection failed (HTTP {})", res.status()))).await;
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
            state.emit_status("active", sessions, Some(format!("Failed to parse Figma payload: {}", e))).await;
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse {
                    error: Some(format!("Failed to parse Figma response: {}", e)),
                    data: None,
                }),
            );
        }
    };

    // Extract regex details
    if let Some(text) = payload.pointer("/result/content/0/text").and_then(|v| v.as_str()) {
        let file_key = regex_capture(text, r"fileKey:\s*([a-zA-Z0-9]+)");
        let node_id = regex_capture(text, r"nodeId:\s*([a-zA-Z0-9\-:]+)");
        let name = regex_capture(text, r"name:\s*([^\n]+)").unwrap_or_else(|| "Figma Screen".to_string());

        if let (Some(fk), Some(nd)) = (file_key, node_id) {
            state.emit_status("active", sessions, Some(format!("Figma selection detected: {}", name))).await;
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

    state.emit_status("active", sessions, Some("Figma selection: Empty".to_string())).await;
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

// Penpot selection detection handler (WSS relay)
async fn handle_detect_penpot(
    State(state): State<AppState>,
    Json(payload): Json<PairingPayload>,
) -> impl IntoResponse {
    let sessions = state.connections.lock().await.len();
    
    // Allow blank pairing requests for health check
    if payload.pairing_id.is_empty() {
        return (
            StatusCode::OK,
            Json(ApiResponse {
                error: None,
                data: Some(serde_json::json!({ "status": "ok" })),
            }),
        );
    }

    state.emit_status("active", sessions, Some(format!("Detecting Penpot selection (pairingId: {})", payload.pairing_id))).await;

    let tx = {
        let conn = state.connections.lock().await;
        conn.get(&payload.pairing_id).cloned()
    };

    let tx = match tx {
        Some(t) => t,
        None => {
            state.emit_status("active", sessions, Some("Penpot tab not connected".to_string())).await;
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
        state.emit_status("active", sessions, Some("Failed to transmit request to Penpot client".to_string())).await;
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse {
                error: Some("Failed to transmit query request to Penpot client.".to_string()),
                data: None,
            }),
        );
    }

    // Await response with a 5-second timeout
    match tokio::time::timeout(std::time::Duration::from_secs(5), reply_rx).await {
        Ok(Ok(val)) => {
            if val.is_null() {
                state.emit_status("active", sessions, Some("Penpot selection: Empty".to_string())).await;
                (
                    StatusCode::OK,
                    Json(ApiResponse {
                        error: None,
                        data: None,
                    }),
                )
            } else {
                let name = val.get("name").and_then(|v| v.as_str()).unwrap_or("Penpot Screen");
                state.emit_status("active", sessions, Some(format!("Penpot selection detected: {}", name))).await;
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
            state.emit_status("active", sessions, Some("Penpot query timed out".to_string())).await;
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

// Penpot frame render export handler (WSS relay)
async fn handle_export_penpot(
    State(state): State<AppState>,
    Json(payload): Json<ExportPayload>,
) -> impl IntoResponse {
    let sessions = state.connections.lock().await.len();
    state.emit_status("active", sessions, Some(format!("Exporting Penpot shape: {}", payload.shape_id))).await;

    let tx = {
        let conn = state.connections.lock().await;
        conn.get(&payload.pairing_id).cloned()
    };

    let tx = match tx {
        Some(t) => t,
        None => {
            state.emit_status("active", sessions, Some("Penpot tab not connected".to_string())).await;
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
        state.emit_status("active", sessions, Some("Failed to transmit render request to Penpot client".to_string())).await;
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse {
                error: Some("Failed to transmit render request to Penpot client.".to_string()),
                data: None,
            }),
        );
    }

    // Await response with a 15-second timeout (renders can be slower)
    match tokio::time::timeout(std::time::Duration::from_secs(15), reply_rx).await {
        Ok(Ok(val)) => {
            state.emit_status("active", sessions, Some(format!("Penpot shape exported successfully: {}", payload.shape_id))).await;
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
            state.emit_status("active", sessions, Some("Penpot render timed out".to_string())).await;
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
