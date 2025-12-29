use crate::models::{SshBuddyError, SshResult};
use serde::{Deserialize, Serialize};
use std::net::ToSocketAddrs;
use std::path::PathBuf;
use tokio::fs;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};

/// Known Hosts service
pub struct KnownHostsService;

impl KnownHostsService {
    /// Get known_hosts file path
    fn get_known_hosts_path() -> SshResult<PathBuf> {
        let ssh_dir = dirs::home_dir()
            .ok_or(SshBuddyError::HomeDirNotFound)?
            .join(".ssh");
        Ok(ssh_dir.join("known_hosts"))
    }

    /// Remove host from known_hosts
    pub async fn remove_host(hostname: &str) -> SshResult<RemoveHostResult> {
        let known_hosts_path = Self::get_known_hosts_path()?;

        if !known_hosts_path.exists() {
            return Ok(RemoveHostResult {
                success: true,
                message: "known_hosts file does not exist".to_string(),
                removed_count: 0,
            });
        }

        // Read existing content
        let content = fs::read_to_string(&known_hosts_path).await.map_err(|e| {
            SshBuddyError::IoError {
                message: format!("Failed to read known_hosts: {}", e),
            }
        })?;

        // Filter out matching lines
        let hostname_lower = hostname.to_lowercase();
        let mut removed_count = 0;
        let new_lines: Vec<&str> = content
            .lines()
            .filter(|line| {
                let line_trimmed = line.trim();
                if line_trimmed.is_empty() || line_trimmed.starts_with('#') {
                    return true; // Keep empty lines and comments
                }

                // Check if hostname matches
                // known_hosts format: hostname[,hostname2,...] key-type key [comment]
                // or hashed format: |1|base64|base64 key-type key
                let first_field = line_trimmed.split_whitespace().next().unwrap_or("");

                // Check if hashed format
                if first_field.starts_with("|1|") {
                    // Cannot directly match hashed entries, needs special handling
                    // We keep it since we cannot determine if it matches
                    return true;
                }

                // Check hostname list
                let hostnames: Vec<&str> = first_field.split(',').collect();
                let matches = hostnames.iter().any(|h| {
                    let h_clean = h.trim_start_matches('[').split(':').next().unwrap_or(h);
                    h_clean.to_lowercase() == hostname_lower
                        || h_clean.to_lowercase().contains(&hostname_lower)
                });

                if matches {
                    removed_count += 1;
                    false // Remove this line
                } else {
                    true // Keep this line
                }
            })
            .collect();

        // Write back to file
        let new_content = new_lines.join("\n");
        fs::write(&known_hosts_path, new_content)
            .await
            .map_err(|e| SshBuddyError::IoError {
                message: format!("Failed to write known_hosts: {}", e),
            })?;

        Ok(RemoveHostResult {
            success: true,
            message: if removed_count > 0 {
                format!("Removed {} entries for {}", removed_count, hostname)
            } else {
                format!("No entries found for {}", hostname)
            },
            removed_count,
        })
    }

    /// Scan and add host's SSH public key to known_hosts
    pub async fn add_host(hostname: &str, port: Option<u16>) -> SshResult<AddHostResult> {
        let port = port.unwrap_or(22);
        let known_hosts_path = Self::get_known_hosts_path()?;

        // Connect to host and retrieve host key
        let host_keys = Self::scan_host_keys(hostname, port).await?;

        if host_keys.is_empty() {
            return Ok(AddHostResult {
                success: false,
                message: format!("Could not retrieve host keys from {}:{}", hostname, port),
                keys_added: 0,
            });
        }

        // Ensure known_hosts file exists
        let mut existing_content = if known_hosts_path.exists() {
            fs::read_to_string(&known_hosts_path)
                .await
                .unwrap_or_default()
        } else {
            // Ensure .ssh directory exists
            if let Some(parent) = known_hosts_path.parent() {
                fs::create_dir_all(parent).await.ok();
            }
            String::new()
        };

        // Add new host keys
        let mut keys_added = 0;
        for key in &host_keys {
            // Check if already exists
            let entry = if port == 22 {
                format!("{} {}", hostname, key)
            } else {
                format!("[{}]:{} {}", hostname, port, key)
            };

            if !existing_content.contains(&entry) {
                if !existing_content.is_empty() && !existing_content.ends_with('\n') {
                    existing_content.push('\n');
                }
                existing_content.push_str(&entry);
                existing_content.push('\n');
                keys_added += 1;
            }
        }

        // Write back to file
        fs::write(&known_hosts_path, &existing_content)
            .await
            .map_err(|e| SshBuddyError::IoError {
                message: format!("Failed to write known_hosts: {}", e),
            })?;

        Ok(AddHostResult {
            success: true,
            message: format!("Added {} key(s) for {}", keys_added, hostname),
            keys_added,
        })
    }

    /// Scan host's SSH public keys (similar to ssh-keyscan)
    async fn scan_host_keys(hostname: &str, port: u16) -> SshResult<Vec<String>> {
        let addr = format!("{}:{}", hostname, port);

        // Parse address
        let socket_addr = addr
            .to_socket_addrs()
            .map_err(|e| SshBuddyError::DnsResolutionFailed {
                hostname: format!("{}: {}", hostname, e),
            })?
            .next()
            .ok_or_else(|| SshBuddyError::DnsResolutionFailed {
                hostname: hostname.to_string(),
            })?;

        // Connect to SSH server
        let stream = timeout(Duration::from_secs(10), TcpStream::connect(socket_addr))
            .await
            .map_err(|_| SshBuddyError::ConnectionTimeout)?
            .map_err(|e| SshBuddyError::ConnectionRefused {
                message: e.to_string(),
            })?;

        // Read SSH version identification
        let mut reader = BufReader::new(stream);
        let mut version_line = String::new();
        timeout(
            Duration::from_secs(5),
            reader.read_line(&mut version_line),
        )
        .await
        .map_err(|_| SshBuddyError::ConnectionTimeout)?
        .map_err(|e| SshBuddyError::IoError {
            message: e.to_string(),
        })?;

        // Send our version
        let mut stream = reader.into_inner();
        stream
            .write_all(b"SSH-2.0-SSH_Buddy_KeyScan\r\n")
            .await
            .map_err(|e| SshBuddyError::IoError {
                message: e.to_string(),
            })?;

        // Using russh to get host key would be more complete,
        // but for simplicity, we use system's ssh-keyscan (if available)
        // If not available, return empty list to let caller know
        drop(stream);

        // Use ssh-keyscan as fallback (still exists, but controlled by Rust)
        Self::scan_with_keyscan(hostname, port).await
    }

    /// Scan using ssh-keyscan command (fallback)
    async fn scan_with_keyscan(hostname: &str, port: u16) -> SshResult<Vec<String>> {
        use std::process::Command;

        let port_str = port.to_string();
        let mut args = vec!["-T", "5"]; // 5 second timeout
        if port != 22 {
            args.push("-p");
            args.push(&port_str);
        }
        args.push(hostname);

        let output = Command::new("ssh-keyscan")
            .args(&args)
            .output()
            .map_err(|e| SshBuddyError::IoError {
                message: format!("Failed to run ssh-keyscan: {}", e),
            })?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let keys: Vec<String> = stdout
            .lines()
            .filter(|line| !line.starts_with('#') && !line.is_empty())
            .map(|line| {
                // Remove hostname prefix, keep only key-type and key
                let parts: Vec<&str> = line.splitn(2, ' ').collect();
                if parts.len() > 1 {
                    parts[1].to_string()
                } else {
                    line.to_string()
                }
            })
            .collect();

        Ok(keys)
    }
}

/// Result of removing host
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveHostResult {
    pub success: bool,
    pub message: String,
    pub removed_count: usize,
}

/// Result of adding host
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddHostResult {
    pub success: bool,
    pub message: String,
    pub keys_added: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use tokio::fs;

    /// Create a mock SSH directory with known_hosts
    async fn create_mock_ssh_dir(known_hosts_content: &str) -> TempDir {
        let temp = TempDir::new().expect("Failed to create temp dir");
        let ssh_dir = temp.path().join(".ssh");
        fs::create_dir_all(&ssh_dir)
            .await
            .expect("Failed to create .ssh dir");
        let known_hosts_path = ssh_dir.join("known_hosts");
        fs::write(&known_hosts_path, known_hosts_content)
            .await
            .expect("Failed to write known_hosts");
        temp
    }

    // Note: These tests are more of integration tests and would require
    // mocking the home directory. For now, we test the filtering logic.

    /// Test the hostname matching logic used in remove_host
    fn matches_hostname(line: &str, target_hostname: &str) -> bool {
        let line_trimmed = line.trim();
        if line_trimmed.is_empty() || line_trimmed.starts_with('#') {
            return false;
        }

        let first_field = line_trimmed.split_whitespace().next().unwrap_or("");

        if first_field.starts_with("|1|") {
            return false;
        }

        let hostnames: Vec<&str> = first_field.split(',').collect();
        let target_lower = target_hostname.to_lowercase();

        hostnames.iter().any(|h| {
            let h_clean = h.trim_start_matches('[').split(':').next().unwrap_or(h);
            h_clean.to_lowercase() == target_lower || h_clean.to_lowercase().contains(&target_lower)
        })
    }

    #[test]
    fn test_matches_hostname_standard() {
        assert!(matches_hostname("github.com ssh-ed25519 AAAA...", "github.com"));
        assert!(!matches_hostname("github.com ssh-ed25519 AAAA...", "gitlab.com"));
    }

    #[test]
    fn test_matches_hostname_with_port() {
        assert!(matches_hostname("[example.com]:2222 ssh-ed25519 AAAA...", "example.com"));
    }

    #[test]
    fn test_matches_hostname_multiple() {
        assert!(matches_hostname("github.com,192.168.1.1 ssh-ed25519 AAAA...", "github.com"));
        assert!(matches_hostname("github.com,192.168.1.1 ssh-ed25519 AAAA...", "192.168.1.1"));
    }

    #[test]
    fn test_matches_hostname_skip_hashed() {
        assert!(!matches_hostname("|1|hash1|hash2 ssh-ed25519 AAAA...", "anything"));
    }

    #[test]
    fn test_matches_hostname_skip_comments() {
        assert!(!matches_hostname("# github.com ssh-ed25519 AAAA...", "github.com"));
        assert!(!matches_hostname("", "github.com"));
    }

    #[test]
    fn test_matches_hostname_case_insensitive() {
        assert!(matches_hostname("GITHUB.COM ssh-ed25519 AAAA...", "github.com"));
        assert!(matches_hostname("github.com ssh-ed25519 AAAA...", "GITHUB.COM"));
    }

    // ========================================
    // Format generation tests
    // ========================================

    #[test]
    fn test_known_hosts_entry_format_standard_port() {
        let hostname = "github.com";
        let port = 22;
        let key = "ssh-ed25519 AAAA...";

        let entry = if port == 22 {
            format!("{} {}", hostname, key)
        } else {
            format!("[{}]:{} {}", hostname, port, key)
        };

        assert_eq!(entry, "github.com ssh-ed25519 AAAA...");
    }

    #[test]
    fn test_known_hosts_entry_format_non_standard_port() {
        let hostname = "example.com";
        let port = 2222;
        let key = "ssh-ed25519 AAAA...";

        let entry = if port == 22 {
            format!("{} {}", hostname, key)
        } else {
            format!("[{}]:{} {}", hostname, port, key)
        };

        assert_eq!(entry, "[example.com]:2222 ssh-ed25519 AAAA...");
    }
}
