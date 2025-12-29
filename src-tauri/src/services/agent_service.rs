use crate::models::{SshBuddyError, SshResult};
use base64::Engine;
use byteorder::{BigEndian, ReadBytesExt, WriteBytesExt};
use serde::{Deserialize, Serialize};
use ssh_key::{PrivateKey, PublicKey};
use std::io::{Cursor, Read};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;
use tokio::fs;

#[cfg(unix)]
use tokio::net::UnixStream;

// SSH Agent protocol constants
const SSH_AGENTC_REQUEST_IDENTITIES: u8 = 11;
const SSH_AGENT_IDENTITIES_ANSWER: u8 = 12;
const SSH_AGENT_FAILURE: u8 = 5;

/// Key information in Agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentKeyInfo {
    pub bit_size: u32,
    pub fingerprint: String,
    pub comment: String,
    #[serde(rename = "type")]
    pub key_type: String,
}

/// SSH Agent service
pub struct AgentService;

impl AgentService {
    /// Get SSH_AUTH_SOCK path
    fn get_auth_sock() -> SshResult<String> {
        std::env::var("SSH_AUTH_SOCK").map_err(|_| SshBuddyError::AgentNotRunning)
    }

    /// Connect to SSH Agent
    #[cfg(unix)]
    async fn connect() -> SshResult<UnixStream> {
        let sock_path = Self::get_auth_sock()?;
        UnixStream::connect(&sock_path)
            .await
            .map_err(|_| SshBuddyError::AgentNotRunning)
    }

    /// Send request and read response
    #[cfg(unix)]
    async fn send_request(stream: &mut UnixStream, request: &[u8]) -> SshResult<Vec<u8>> {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        // Send request length + request content
        let mut msg = Vec::new();
        WriteBytesExt::write_u32::<BigEndian>(&mut msg, request.len() as u32)
            .map_err(|e| SshBuddyError::IoError {
                message: e.to_string(),
            })?;
        msg.extend_from_slice(request);

        stream
            .write_all(&msg)
            .await
            .map_err(|e| SshBuddyError::IoError {
                message: e.to_string(),
            })?;

        // Read response length
        let mut len_buf = [0u8; 4];
        stream
            .read_exact(&mut len_buf)
            .await
            .map_err(|e| SshBuddyError::IoError {
                message: e.to_string(),
            })?;

        let len = ReadBytesExt::read_u32::<BigEndian>(&mut Cursor::new(&len_buf))
            .map_err(|e| SshBuddyError::IoError {
                message: e.to_string(),
            })? as usize;

        // Read response content
        let mut response = vec![0u8; len];
        stream
            .read_exact(&mut response)
            .await
            .map_err(|e| SshBuddyError::IoError {
                message: e.to_string(),
            })?;

        Ok(response)
    }

    /// Check if SSH Agent is running
    #[cfg(unix)]
    pub async fn is_running() -> bool {
        match Self::connect().await {
            Ok(_) => true,
            Err(_) => false,
        }
    }

    #[cfg(not(unix))]
    pub async fn is_running() -> bool {
        // Windows: temporarily use ssh-add -l command to check
        false
    }

    /// List all keys in Agent
    #[cfg(unix)]
    pub async fn list_keys() -> SshResult<Vec<AgentKeyInfo>> {
        let mut stream = Self::connect().await?;

        // Send REQUEST_IDENTITIES request
        let request = vec![SSH_AGENTC_REQUEST_IDENTITIES];
        let response = Self::send_request(&mut stream, &request).await?;

        // Parse response
        if response.is_empty() {
            return Err(SshBuddyError::AgentNotRunning);
        }

        let msg_type = response[0];
        if msg_type == SSH_AGENT_FAILURE {
            return Ok(Vec::new());
        }

        if msg_type != SSH_AGENT_IDENTITIES_ANSWER {
            return Err(SshBuddyError::Unknown {
                message: format!("Unexpected response type: {}", msg_type),
            });
        }

        // Parse key list
        let mut cursor = Cursor::new(&response[1..]);
        let num_keys = cursor.read_u32::<BigEndian>().map_err(|e| {
            SshBuddyError::IoError {
                message: e.to_string(),
            }
        })? as usize;

        let mut keys = Vec::with_capacity(num_keys);

        for _ in 0..num_keys {
            // Read public key blob
            let blob_len = cursor.read_u32::<BigEndian>().map_err(|e| {
                SshBuddyError::IoError {
                    message: e.to_string(),
                }
            })? as usize;

            let mut blob = vec![0u8; blob_len];
            cursor.read_exact(&mut blob).map_err(|e| {
                SshBuddyError::IoError {
                    message: e.to_string(),
                }
            })?;

            // Read comment
            let comment_len = cursor.read_u32::<BigEndian>().map_err(|e| {
                SshBuddyError::IoError {
                    message: e.to_string(),
                }
            })? as usize;

            let mut comment_bytes = vec![0u8; comment_len];
            cursor.read_exact(&mut comment_bytes).map_err(|e| {
                SshBuddyError::IoError {
                    message: e.to_string(),
                }
            })?;

            let comment = String::from_utf8_lossy(&comment_bytes).to_string();

            // Try to parse public key to get more information
            if let Ok(pub_key) = PublicKey::from_bytes(&blob) {
                let fingerprint = pub_key.fingerprint(ssh_key::HashAlg::Sha256).to_string();
                let key_type = pub_key.algorithm().as_str().to_string();
                let bit_size = Self::get_key_bit_size(&pub_key);

                keys.push(AgentKeyInfo {
                    bit_size,
                    fingerprint,
                    comment,
                    key_type,
                });
            }
        }

        Ok(keys)
    }

    #[cfg(not(unix))]
    pub async fn list_keys() -> SshResult<Vec<AgentKeyInfo>> {
        // Windows: direct Agent communication not yet supported
        Err(SshBuddyError::Unknown {
            message: "Agent communication not yet supported on Windows".to_string(),
        })
    }

    /// Get bit size from public key
    fn get_key_bit_size(pub_key: &PublicKey) -> u32 {
        match pub_key.key_data() {
            ssh_key::public::KeyData::Rsa(rsa) => (rsa.n.as_bytes().len() * 8) as u32,
            ssh_key::public::KeyData::Ed25519(_) => 256,
            ssh_key::public::KeyData::Ecdsa(ecdsa) => match ecdsa.curve() {
                ssh_key::EcdsaCurve::NistP256 => 256,
                ssh_key::EcdsaCurve::NistP384 => 384,
                ssh_key::EcdsaCurve::NistP521 => 521,
            },
            _ => 0,
        }
    }

    /// Check if key is in Agent
    pub async fn is_key_in_agent(key_path: &str) -> SshResult<bool> {
        // Validate path
        let path = PathBuf::from(key_path);
        if !path.exists() {
            return Err(SshBuddyError::KeyNotFound {
                path: key_path.to_string(),
            });
        }

        // Read public key to get fingerprint
        let pub_key_path = if key_path.ends_with(".pub") {
            path.clone()
        } else {
            PathBuf::from(format!("{}.pub", key_path))
        };

        let pub_key_content = fs::read_to_string(&pub_key_path).await.map_err(|_| {
            SshBuddyError::KeyNotFound {
                path: pub_key_path.to_string_lossy().to_string(),
            }
        })?;

        let pub_key = PublicKey::from_openssh(&pub_key_content)?;
        let target_fingerprint = pub_key.fingerprint(ssh_key::HashAlg::Sha256).to_string();

        // Get key list from Agent
        let agent_keys = Self::list_keys().await?;

        // Check if there's a matching fingerprint
        Ok(agent_keys
            .iter()
            .any(|k| k.fingerprint == target_fingerprint))
    }

    /// Check if private key requires passphrase
    /// Uses multiple methods to ensure correct encryption detection
    fn is_key_encrypted(key_path: &str) -> bool {
        // Read private key file
        let content = match std::fs::read_to_string(key_path) {
            Ok(c) => c,
            Err(e) => {
                log::warn!("[agent_service] Failed to read key file: {}", e);
                return false;
            }
        };

        // Method 1: Legacy PEM format keys (RSA PRIVATE KEY etc.)
        // Encrypted legacy format contains "ENCRYPTED" or "Proc-Type: 4,ENCRYPTED"
        if content.contains("ENCRYPTED") || content.contains("Proc-Type: 4,ENCRYPTED") {
            log::info!("[agent_service] Key is encrypted (PEM format with ENCRYPTED header)");
            return true;
        }

        // Method 2: New OpenSSH format keys - decode base64 and check cipher
        if content.contains("-----BEGIN OPENSSH PRIVATE KEY-----") {
            // Extract base64 content
            let base64_content: String = content
                .lines()
                .filter(|line| {
                    !line.starts_with("-----") && !line.is_empty()
                })
                .collect();

            // Decode base64
            if let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(&base64_content) {
                // OpenSSH private key format:
                // "openssh-key-v1\0" (15 bytes magic)
                // Then: cipher name length (4 bytes) + cipher name
                // Unencrypted cipher is "none"

                // Check magic header
                if decoded.len() > 15 && decoded.starts_with(b"openssh-key-v1\0") {
                    // Skip magic (15 bytes), read cipher name length
                    let cipher_len_bytes = &decoded[15..19];
                    if cipher_len_bytes.len() == 4 {
                        let cipher_len = u32::from_be_bytes([
                            cipher_len_bytes[0],
                            cipher_len_bytes[1],
                            cipher_len_bytes[2],
                            cipher_len_bytes[3],
                        ]) as usize;

                        // Read cipher name
                        if decoded.len() >= 19 + cipher_len {
                            let cipher_name = &decoded[19..19 + cipher_len];
                            if let Ok(cipher_str) = std::str::from_utf8(cipher_name) {
                                log::info!(
                                    "[agent_service] OpenSSH key cipher: '{}'",
                                    cipher_str
                                );

                                if cipher_str == "none" {
                                    log::info!("[agent_service] Key is NOT encrypted (cipher=none)");
                                    return false;
                                } else {
                                    log::info!(
                                        "[agent_service] Key IS encrypted (cipher={})",
                                        cipher_str
                                    );
                                    return true;
                                }
                            }
                        }
                    }
                }
            }

            // If unable to parse, try using ssh_key crate
            log::info!("[agent_service] Could not parse cipher from binary, trying ssh_key crate");
        }

        // Method 3: Try parsing without password using ssh_key crate
        // If successful, not encrypted; if failed, possibly encrypted
        match PrivateKey::from_openssh(&content) {
            Ok(_) => {
                log::info!("[agent_service] Key parsed without passphrase - not encrypted");
                false
            }
            Err(e) => {
                let err_str = e.to_string().to_lowercase();
                log::info!("[agent_service] Key parse error: {}", err_str);
                // Check if it explicitly mentions encryption
                if err_str.contains("decrypt")
                    || err_str.contains("passphrase")
                    || err_str.contains("cipher")
                    || err_str.contains("encrypted")
                {
                    log::info!("[agent_service] Key is encrypted (parse error indicates encryption)");
                    true
                } else {
                    // Other errors - possibly format issue rather than encryption
                    log::warn!("[agent_service] Key parse failed for unknown reason, assuming encrypted for safety");
                    true
                }
            }
        }
    }

    /// Add key to Agent (using ssh-add command, as it handles passphrase)
    /// If passphrase is Some, it will be passed via stdin
    pub async fn add_key(key_path: &str, passphrase: Option<&str>) -> SshResult<AddKeyResult> {
        // Validate key path
        let path = PathBuf::from(key_path);
        if !path.exists() {
            return Err(SshBuddyError::KeyNotFound {
                path: key_path.to_string(),
            });
        }

        // First check if already in agent
        if Self::is_key_in_agent(key_path).await.unwrap_or(false) {
            return Ok(AddKeyResult {
                success: true,
                message: "Key is already loaded in the agent".to_string(),
                needs_passphrase: false,
            });
        }

        // Check if key requires passphrase
        let is_encrypted = Self::is_key_encrypted(key_path);

        // If key is encrypted but no passphrase provided, request input
        if is_encrypted && passphrase.is_none() {
            log::info!(
                "[agent_service] Key is encrypted, needs passphrase: {}",
                key_path
            );
            return Ok(AddKeyResult {
                success: false,
                message: "This key requires a passphrase.".to_string(),
                needs_passphrase: true,
            });
        }

        // If passphrase provided, use SSH_ASKPASS environment variable approach
        if let Some(pass) = passphrase {
            log::info!(
                "[agent_service] Adding encrypted key with passphrase: {}",
                key_path
            );
            return Self::add_key_with_passphrase(key_path, pass).await;
        }

        // Key has no passphrase, add using ssh-add command
        // Use tokio with timeout for async command to avoid any blocking
        log::info!("[agent_service] Running ssh-add for unencrypted key: {}", key_path);

        let key_path_owned = key_path.to_string();
        let result = tokio::time::timeout(
            Duration::from_secs(5),
            tokio::task::spawn_blocking(move || {
                Command::new("ssh-add")
                    .arg(&key_path_owned)
                    .stdin(Stdio::null())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .output()
            })
        ).await;

        match result {
            Ok(Ok(Ok(output))) => {
                if output.status.success() {
                    log::info!("[agent_service] Key added to agent: {}", key_path);
                    Ok(AddKeyResult {
                        success: true,
                        message: "Key added to SSH agent successfully".to_string(),
                        needs_passphrase: false,
                    })
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    log::warn!(
                        "[agent_service] Failed to add key: {}, stderr: {}",
                        key_path,
                        stderr
                    );
                    // If ssh-add failed and mentions passphrase, mark as needs passphrase
                    let stderr_lower = stderr.to_lowercase();
                    if stderr_lower.contains("passphrase") || stderr_lower.contains("password") {
                        Ok(AddKeyResult {
                            success: false,
                            message: "This key requires a passphrase. Please run 'ssh-add' manually in terminal.".to_string(),
                            needs_passphrase: true,
                        })
                    } else {
                        Ok(AddKeyResult {
                            success: false,
                            message: stderr.to_string(),
                            needs_passphrase: false,
                        })
                    }
                }
            }
            Ok(Ok(Err(e))) => {
                log::error!("[agent_service] ssh-add command error: {}", e);
                Ok(AddKeyResult {
                    success: false,
                    message: format!("Failed to run ssh-add: {}", e),
                    needs_passphrase: false,
                })
            }
            Ok(Err(e)) => {
                log::error!("[agent_service] spawn_blocking error: {}", e);
                Ok(AddKeyResult {
                    success: false,
                    message: format!("Internal error: {}", e),
                    needs_passphrase: false,
                })
            }
            Err(_) => {
                // Timeout - possibly waiting for passphrase input
                log::warn!("[agent_service] ssh-add timed out, key likely needs passphrase: {}", key_path);
                Ok(AddKeyResult {
                    success: false,
                    message: "This key requires a passphrase. Please run 'ssh-add' manually in terminal.".to_string(),
                    needs_passphrase: true,
                })
            }
        }
    }

    /// Add key to Agent with passphrase
    /// Uses SSH_ASKPASS environment variable mechanism to provide password
    async fn add_key_with_passphrase(key_path: &str, passphrase: &str) -> SshResult<AddKeyResult> {
        use std::io::Write;

        // Create temporary script to provide passphrase
        // SSH_ASKPASS will execute this script to get the password
        let temp_dir = std::env::temp_dir();
        let script_path = temp_dir.join(format!("ssh_askpass_{}.sh", std::process::id()));

        // Write script
        {
            let mut file = std::fs::File::create(&script_path).map_err(|e| {
                SshBuddyError::IoError {
                    message: format!("Failed to create askpass script: {}", e),
                }
            })?;

            // Script content: output passphrase
            writeln!(file, "#!/bin/sh").map_err(|e| SshBuddyError::IoError {
                message: format!("Failed to write askpass script: {}", e),
            })?;
            writeln!(file, "echo '{}'", passphrase.replace('\'', "'\"'\"'")).map_err(|e| {
                SshBuddyError::IoError {
                    message: format!("Failed to write askpass script: {}", e),
                }
            })?;
        }

        // Set execution permissions
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&script_path, std::fs::Permissions::from_mode(0o700))
                .map_err(|e| SshBuddyError::IoError {
                    message: format!("Failed to set script permissions: {}", e),
                })?;
        }

        let script_path_str = script_path.to_string_lossy().to_string();
        let key_path_owned = key_path.to_string();

        // Execute ssh-add with SSH_ASKPASS
        let result = tokio::time::timeout(
            Duration::from_secs(10),
            tokio::task::spawn_blocking(move || {
                Command::new("ssh-add")
                    .arg(&key_path_owned)
                    .env("SSH_ASKPASS", &script_path_str)
                    .env("SSH_ASKPASS_REQUIRE", "force") // Force use of SSH_ASKPASS
                    .env("DISPLAY", ":0") // DISPLAY must be set for SSH_ASKPASS to work
                    .stdin(Stdio::null())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .output()
            }),
        )
        .await;

        // Clean up temporary script
        let _ = std::fs::remove_file(&script_path);

        match result {
            Ok(Ok(Ok(output))) => {
                if output.status.success() {
                    log::info!(
                        "[agent_service] Key added to agent with passphrase: {}",
                        key_path
                    );
                    Ok(AddKeyResult {
                        success: true,
                        message: "Key added to SSH agent successfully".to_string(),
                        needs_passphrase: false,
                    })
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    log::warn!(
                        "[agent_service] Failed to add key with passphrase: {}",
                        stderr
                    );

                    // Check if it's a wrong passphrase error
                    let stderr_lower = stderr.to_lowercase();
                    if stderr_lower.contains("bad passphrase")
                        || stderr_lower.contains("incorrect passphrase")
                        || stderr_lower.contains("wrong passphrase")
                    {
                        Ok(AddKeyResult {
                            success: false,
                            message: "Incorrect passphrase. Please try again.".to_string(),
                            needs_passphrase: true,
                        })
                    } else {
                        Ok(AddKeyResult {
                            success: false,
                            message: stderr.to_string(),
                            needs_passphrase: false,
                        })
                    }
                }
            }
            Ok(Ok(Err(e))) => {
                log::error!("[agent_service] ssh-add command error: {}", e);
                Ok(AddKeyResult {
                    success: false,
                    message: format!("Failed to run ssh-add: {}", e),
                    needs_passphrase: false,
                })
            }
            Ok(Err(e)) => {
                log::error!("[agent_service] spawn_blocking error: {}", e);
                Ok(AddKeyResult {
                    success: false,
                    message: format!("Internal error: {}", e),
                    needs_passphrase: false,
                })
            }
            Err(_) => {
                log::warn!("[agent_service] ssh-add with passphrase timed out");
                Ok(AddKeyResult {
                    success: false,
                    message: "Operation timed out. Please try again.".to_string(),
                    needs_passphrase: true,
                })
            }
        }
    }

    /// Remove key from Agent
    pub async fn remove_key(key_path: &str) -> SshResult<RemoveKeyResult> {
        let path = PathBuf::from(key_path);
        if !path.exists() {
            return Err(SshBuddyError::KeyNotFound {
                path: key_path.to_string(),
            });
        }

        // Use ssh-add -d command to remove
        let output = std::process::Command::new("ssh-add")
            .arg("-d")
            .arg(key_path)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| SshBuddyError::IoError {
                message: e.to_string(),
            })?;

        if output.status.success() {
            log::info!("[agent_service] Key removed from agent: {}", key_path);
            return Ok(RemoveKeyResult {
                success: true,
                message: "Key removed from SSH agent".to_string(),
            });
        }

        let stderr = String::from_utf8_lossy(&output.stderr);
        log::warn!(
            "[agent_service] Failed to remove key: {}, stderr: {}",
            key_path,
            stderr
        );
        Ok(RemoveKeyResult {
            success: false,
            message: stderr.to_string(),
        })
    }
}

/// Result of adding key
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddKeyResult {
    pub success: bool,
    pub message: String,
    pub needs_passphrase: bool,
}

/// Result of removing key
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveKeyResult {
    pub success: bool,
    pub message: String,
}
