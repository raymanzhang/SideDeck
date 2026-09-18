// Copyright (c) 2026 Rayman Zhang
// SPDX-License-Identifier: AGPL-3.0-only

use super::{Provider, ProviderCategory};
use serde_json::{json, Value};
use std::{future::Future, pin::Pin, time::Duration};

pub struct AnthropicUsageProvider {
    client: reqwest::Client,
}

impl AnthropicUsageProvider {
    pub fn new() -> Result<Self, reqwest::Error> {
        Ok(Self {
            client: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(10))
                .timeout(Duration::from_secs(10))
                .build()?,
        })
    }
}

fn failure(status: &str, error: &str) -> Value {
    json!({"status":status,"service":"anthropic","display_name":"Anthropic","error":error})
}

fn parse_token(bytes: &[u8]) -> Result<String, Value> {
    serde_json::from_slice::<Value>(bytes)
        .ok()
        .and_then(|v| {
            v.get("accessToken")
                .and_then(Value::as_str)
                .filter(|s| !s.trim().is_empty())
                .map(str::to_owned)
        })
        .ok_or_else(|| {
            failure(
                "no_auth",
                "OAuth token not found in Keychain. Please log in with claude CLI.",
            )
        })
}

#[cfg(target_os = "macos")]
fn read_token() -> Result<String, Value> {
    match security_framework::passwords::get_generic_password(
        "com.anthropic.claude-code",
        "oauth_credentials",
    ) {
        Ok(bytes) => parse_token(&bytes),
        Err(e) if e.code() == -25300 => Err(failure(
            "no_auth",
            "OAuth token not found in Keychain. Please log in with claude CLI.",
        )),
        Err(_) => Err(failure("auth_error", "Keychain access denied")),
    }
}

#[cfg(not(target_os = "macos"))]
fn read_token() -> Result<String, Value> {
    Err(failure(
        "unavailable",
        "OAuth Keychain access requires macOS",
    ))
}

fn window(value: Option<&Value>, label: &str) -> Value {
    match value.filter(|v| v.is_object()) {
        Some(v) => json!({
            "usage_percent": v.get("usage_percent").or_else(|| v.get("utilization")).and_then(Value::as_f64).filter(|n| *n >= 0.0),
            "reset_at": v.get("reset_at").or_else(|| v.get("resets_at")).and_then(Value::as_str),
            "label": label,
        }),
        None => Value::Null,
    }
}

fn parse_usage(value: &Value) -> Value {
    json!({
        "status":"ok", "service":"anthropic", "display_name":"Anthropic",
        "plan":value.get("plan").and_then(Value::as_str),
        "daily":window(value.get("daily").or_else(|| value.get("five_hour")), "5h"),
        "weekly":window(value.get("weekly").or_else(|| value.get("seven_day")), "7d"),
    })
}

impl Provider for AnthropicUsageProvider {
    fn id(&self) -> &str {
        "anthropic-usage"
    }
    fn display_name(&self) -> &str {
        "Anthropic"
    }
    fn category(&self) -> ProviderCategory {
        ProviderCategory::AIAccount
    }
    fn poll_interval(&self) -> Duration {
        Duration::from_secs(60)
    }
    fn poll(
        &self,
    ) -> Pin<
        Box<
            dyn Future<Output = Result<Value, Box<dyn std::error::Error + Send + Sync>>>
                + Send
                + '_,
        >,
    > {
        Box::pin(async {
            let token = match tokio::task::spawn_blocking(read_token).await {
                Ok(Ok(token)) => token,
                Ok(Err(error)) => return Ok(error),
                Err(_) => return Ok(failure("auth_error", "Keychain access failed")),
            };
            let response = match self
                .client
                .get("https://api.anthropic.com/api/oauth/usage")
                .bearer_auth(token)
                .send()
                .await
            {
                Ok(response) => response,
                Err(e) => {
                    return Ok(failure(
                        "error",
                        if e.is_timeout() {
                            "API request timed out"
                        } else {
                            "Unable to reach Anthropic Usage API"
                        },
                    ))
                }
            };
            if response.status() == reqwest::StatusCode::UNAUTHORIZED {
                return Ok(failure(
                    "auth_expired",
                    "OAuth token expired. Please re-login with claude CLI.",
                ));
            }
            if !response.status().is_success() {
                return Ok(failure(
                    "error",
                    &format!(
                        "Anthropic Usage API returned HTTP {}",
                        response.status().as_u16()
                    ),
                ));
            }
            Ok(match response.json::<Value>().await {
                Ok(value) => parse_usage(&value),
                Err(e) => failure(
                    "error",
                    if e.is_timeout() {
                        "API request timed out"
                    } else {
                        "Invalid Anthropic Usage API response"
                    },
                ),
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_partial_and_malformed_windows() {
        let data =
            parse_usage(&json!({"daily":{"usage_percent":45.2,"reset_at":"2026-09-17T00:00:00Z"}}));
        assert_eq!(data["daily"]["usage_percent"], 45.2);
        assert!(data["weekly"].is_null());
        let data = parse_usage(
            &json!({"five_hour":{"utilization":100,"resets_at":"later"},"seven_day":{"utilization":"bad"}}),
        );
        assert_eq!(data["daily"]["usage_percent"], 100.0);
        assert!(data["weekly"]["usage_percent"].is_null());
        assert!(parse_usage(&Value::Null)["daily"].is_null());
    }
    #[test]
    fn rejects_missing_or_invalid_credentials() {
        assert_eq!(
            parse_token(br#"{"accessToken":"test-token"}"#).unwrap(),
            "test-token"
        );
        for input in [b"invalid".as_slice(), b"{}", br#"{"accessToken":" "}"#] {
            assert_eq!(parse_token(input).unwrap_err()["status"], "no_auth");
        }
    }
}
