use axum::{
    extract::{
        ws::{Message as AxumMessage, WebSocket, WebSocketUpgrade},
        State, Query,
    },
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, oneshot};
use tower_http::cors::CorsLayer;
use futures_util::{sink::SinkExt, stream::StreamExt};

#[derive(Clone)]
struct AppState {
    // Maps pairingId -> WS message channel to push commands to Penpot plugin
    connections: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<AxumMessage>>>>,
    // Maps requestId -> oneshot response channels awaiting Penpot plugin replies
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<serde_json::Value>>>>,
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

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Shared memory state
    let state = AppState {
        connections: Arc::new(Mutex::new(HashMap::new())),
        pending: Arc::new(Mutex::new(HashMap::new())),
    };

    // Spawn our background Axum HTTPS & WS secure bridge server
    let state_clone = state.clone();
    tauri::async_runtime::spawn(async move {
        start_https_server(state_clone).await;
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Create menu items
            let show_i = MenuItem::with_id(app, "show", "Show SyncBridge", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
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
    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/detect-figma", post(handle_detect_figma))
        .route("/detect-penpot", post(handle_detect_penpot))
        .route("/export-penpot", post(handle_export_penpot))
        .layer(CorsLayer::permissive())
        .with_state(state);

    // Include Let's Encrypt certificates directly into the binary
    let cert_pem = include_bytes!("../resources/cert.pem");
    let key_pem = include_bytes!("../resources/key.pem");

    let config = match axum_server::tls_rustls::RustlsConfig::from_pem(cert_pem.to_vec(), key_pem.to_vec()).await {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to initialize SSL configuration: {}", e);
            return;
        }
    };

    // Bind to 127.0.0.1:4401 (resolves to local-syncboard.luiskobayashi.com)
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], 4401));
    println!("Tauri Secure Bridge listening on https://127.0.0.1:4401");

    if let Err(e) = axum_server::bind_rustls(addr, config)
        .serve(app.into_make_service())
        .await
    {
        eprintln!("Axum server shut down with error: {}", e);
    }
}

// WebSocket connection upgrade route
async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<HashMap<String, String>>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let pairing_id = params.get("pairingId").cloned().unwrap_or_default();
    ws.on_upgrade(move |socket| handle_socket(socket, pairing_id, state))
}

async fn handle_socket(socket: WebSocket, pairing_id: String, state: AppState) {
    if pairing_id.is_empty() {
        return;
    }

    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<AxumMessage>();

    // Register active Penpot connection
    state.connections.lock().await.insert(pairing_id.clone(), tx);

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

    state.connections.lock().await.remove(&pairing_id_clone);
}

// Figma local selection detection handler
async fn handle_detect_figma() -> impl IntoResponse {
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
    let tx = {
        let conn = state.connections.lock().await;
        conn.get(&payload.pairing_id).cloned()
    };

    let tx = match tx {
        Some(t) => t,
        None => {
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
                (
                    StatusCode::OK,
                    Json(ApiResponse {
                        error: None,
                        data: None,
                    }),
                )
            } else {
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
    let tx = {
        let conn = state.connections.lock().await;
        conn.get(&payload.pairing_id).cloned()
    };

    let tx = match tx {
        Some(t) => t,
        None => {
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
