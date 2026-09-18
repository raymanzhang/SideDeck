// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

use serde_json::{json, Value};
use std::{fmt, process::Stdio, time::Duration};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};

#[derive(Debug, PartialEq)]
pub enum ProxyError {
    Unavailable,
    Timeout,
    Unsupported,
    InvalidResponse,
    Rpc,
    Auth,
}

impl fmt::Display for ProxyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Unavailable => "Codex CLI/proxy unavailable. Install Codex in a standard bin directory or set SIDEDECK_CODEX_PATH, log in, and start its required background service.",
            Self::Timeout => "IPC timeout",
            Self::Unsupported => "RPC method not supported by Codex",
            Self::InvalidResponse => "Invalid IPC response",
            Self::Auth => "Codex account authentication required",
            Self::Rpc => "Codex RPC failed",
        })
    }
}
impl std::error::Error for ProxyError {}

fn response_result(response: &Value) -> Option<Result<Value, ProxyError>> {
    if response.get("id") != Some(&json!(1)) {
        return None;
    }
    if let Some(error) = response.get("error") {
        return Some(Err(
            if error.get("code").and_then(Value::as_i64) == Some(-32601) {
                ProxyError::Unsupported
            } else if error["message"].as_str().is_some_and(|m| {
                let m = m.to_lowercase();
                m.contains("authenticat")
                    || m.contains("not logged in")
                    || m.contains("unauthorized")
            }) {
                ProxyError::Auth
            } else {
                ProxyError::Rpc
            },
        ));
    }
    Some(
        response
            .get("result")
            .cloned()
            .ok_or(ProxyError::InvalidResponse),
    )
}

/// One newline-delimited request, bounded across both writing and reading.
pub async fn proxy_call(method: &str, params: Value) -> Result<Value, ProxyError> {
    let mut child = super::cli::command("codex").map_err(|_| ProxyError::Unavailable)?
        .args(["app-server", "proxy"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| ProxyError::Unavailable)?;

    let exchange = async {
        let mut stdin = child.stdin.take().ok_or(ProxyError::Unavailable)?;
        let stdout = child.stdout.take().ok_or(ProxyError::Unavailable)?;
        let mut lines = BufReader::new(stdout.take(4 * 1024 * 1024)).lines();
        for (id, rpc, args) in [
            (
                0,
                "initialize",
                json!({"clientInfo":{"name":"sidedeck","version":env!("CARGO_PKG_VERSION")},"capabilities":{"experimentalApi":true}}),
            ),
            (1, method, params),
        ] {
            let request = json!({"id":id,"method":rpc,"params":args}).to_string() + "\n";
            stdin
                .write_all(request.as_bytes())
                .await
                .map_err(|_| ProxyError::Unavailable)?;
            loop {
                let line = lines
                    .next_line()
                    .await
                    .map_err(|_| ProxyError::InvalidResponse)?
                    .ok_or(ProxyError::Unavailable)?;
                if line.len() > 4 * 1024 * 1024 {
                    return Err(ProxyError::InvalidResponse);
                }
                let response: Value =
                    serde_json::from_str(&line).map_err(|_| ProxyError::InvalidResponse)?;
                if response["id"] != id {
                    continue;
                }
                if id == 1 {
                    return response_result(&response).unwrap_or(Err(ProxyError::InvalidResponse));
                }
                if response.get("error").is_some() {
                    return Err(ProxyError::Rpc);
                }
                if response.get("result").is_none() {
                    return Err(ProxyError::InvalidResponse);
                }
                stdin
                    .write_all(b"{\"method\":\"initialized\"}\n")
                    .await
                    .map_err(|_| ProxyError::Unavailable)?;
                break;
            }
        }
        Err(ProxyError::Unavailable)
    };
    let result = tokio::time::timeout(Duration::from_secs(3), exchange)
        .await
        .unwrap_or(Err(ProxyError::Timeout));
    // Explicitly terminate and reap, including on timeout or successful response.
    let _ = child.kill().await;
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_request_and_classifies_rpc_errors() {
        assert!(response_result(&json!({"method":"notification"})).is_none());
        assert!(response_result(&json!({"id":2,"result":{}})).is_none());
        assert_eq!(
            response_result(&json!({"id":1,"error":{"code":-32601}})),
            Some(Err(ProxyError::Unsupported))
        );
        assert_eq!(
            response_result(&json!({"id":1,"error":{"code":-32603}})),
            Some(Err(ProxyError::Rpc))
        );
        assert_eq!(
            response_result(&json!({"id":1,"result":{"balance":null}})),
            Some(Ok(json!({"balance":null})))
        );
    }
}
