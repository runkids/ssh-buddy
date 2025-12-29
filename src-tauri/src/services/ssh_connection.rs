use crate::models::{SshBuddyError, SshResult};
use crate::utils::{HostConfig, SshConfigParser};
use async_trait::async_trait;
use russh::keys::key::PublicKey;
use russh::{client, ChannelMsg};
use russh_keys::agent::client::AgentClient;
use russh_keys::PublicKeyBase64;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::fs;
use tokio::net::UnixStream;
use tokio::sync::Mutex;
use tokio::time::timeout;

/// SSH error type
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SshErrorType {
    HostKeyChanged,
    HostKeyUnknown,
    PermissionDenied,
    PermissionDeniedKeyPermissions,
    PermissionDeniedKeyNotInAgent,
    PermissionDeniedWrongKey,
    PermissionDeniedPassphrase,
    PermissionDeniedAuthMethod,
    ConnectionRefused,
    Timeout,
    DnsFailed,
    IdentityFileNotFound,
    PublicKeyMissing,
    Unknown,
}

/// SSH error details
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshErrorDetails {
    #[serde(rename = "type")]
    pub error_type: SshErrorType,
    pub raw_message: String,
    pub suggestion: String,
    pub can_auto_fix: bool,
    pub fix_type: Option<String>,
    pub fix_params: Option<std::collections::HashMap<String, String>>,
}

/// SSH connection test result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub success: bool,
    pub output: String,
    pub platform: Option<String>,
    pub error_type: Option<SshErrorType>,
    pub error_details: Option<SshErrorDetails>,
    pub host_to_remove: Option<String>,
    pub host_to_add: Option<String>,
    pub identity_file: Option<String>,
    pub debug_log: Option<String>,
}

/// Known hosts check result
#[derive(Debug, Clone, PartialEq)]
enum KnownHostStatus {
    /// Host is in known_hosts and key matches
    Matched,
    /// Host is not in known_hosts (first connection)
    Unknown,
    /// Host is in known_hosts but key is different (possible attack or server reinstall)
    Changed,
}

/// Shared Host Key check state
#[derive(Debug, Clone)]
struct SharedHostKeyState {
    status: KnownHostStatus,
    server_key_fingerprint: Option<String>,
}

impl Default for SharedHostKeyState {
    fn default() -> Self {
        Self {
            status: KnownHostStatus::Unknown,
            server_key_fingerprint: None,
        }
    }
}

/// SSH client handler
struct ClientHandler {
    server_public_key: Option<PublicKey>,
    auth_banner: Option<String>,
    /// Hostname (for checking known_hosts)
    hostname: String,
    /// Port
    port: u16,
    /// Pre-loaded keys from known_hosts
    known_host_keys: HashMap<String, Vec<String>>,
    /// Shared state (readable from outside)
    shared_state: Arc<Mutex<SharedHostKeyState>>,
}

impl ClientHandler {
    fn new(
        hostname: &str,
        port: u16,
        known_host_keys: HashMap<String, Vec<String>>,
        shared_state: Arc<Mutex<SharedHostKeyState>>,
    ) -> Self {
        Self {
            server_public_key: None,
            auth_banner: None,
            hostname: hostname.to_string(),
            port,
            known_host_keys,
            shared_state,
        }
    }
}

#[async_trait]
impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        self.server_public_key = Some(server_public_key.clone());

        // Convert server public key to base64 format for comparison
        let server_key_type = server_public_key.name();
        let server_key_base64 = server_public_key.public_key_base64();
        let server_key_full = format!("{} {}", server_key_type, server_key_base64);

        log::info!(
            "[ssh_connection] check_server_key called for host: {}:{}",
            self.hostname,
            self.port
        );
        log::info!(
            "[ssh_connection] Server key type: {}, base64 (first 50 chars): {}...",
            server_key_type,
            &server_key_base64[..server_key_base64.len().min(50)]
        );

        // Construct possible host key names
        let host_variants = if self.port == 22 {
            vec![self.hostname.clone()]
        } else {
            vec![
                format!("[{}]:{}", self.hostname, self.port),
                self.hostname.clone(),
            ]
        };

        log::info!(
            "[ssh_connection] Looking for host variants: {:?}",
            host_variants
        );
        log::info!(
            "[ssh_connection] Known hosts keys count: {}",
            self.known_host_keys.len()
        );

        // Check if in known_hosts
        let mut found_host = false;
        let mut key_matched = false;

        for variant in &host_variants {
            log::info!("[ssh_connection] Checking variant: {}", variant);
            if let Some(known_keys) = self.known_host_keys.get(variant) {
                found_host = true;
                log::info!(
                    "[ssh_connection] Found {} keys for host {}",
                    known_keys.len(),
                    variant
                );
                // Check if key matches
                for (idx, known_key) in known_keys.iter().enumerate() {
                    log::info!(
                        "[ssh_connection] Comparing with known key {}: {}...",
                        idx,
                        &known_key[..known_key.len().min(80)]
                    );
                    log::info!(
                        "[ssh_connection] Server key base64 (first 80): {}...",
                        &server_key_base64[..server_key_base64.len().min(80)]
                    );

                    let contains_base64 = known_key.contains(&server_key_base64);
                    let exact_match = server_key_full == *known_key;
                    let type_and_base64 = known_key.starts_with(&format!("{} ", server_key_type))
                        && known_key.contains(&server_key_base64);

                    log::info!(
                        "[ssh_connection] Check results - contains_base64: {}, exact_match: {}, type_and_base64: {}",
                        contains_base64, exact_match, type_and_base64
                    );

                    if contains_base64 || exact_match || type_and_base64 {
                        log::info!("[ssh_connection] Key MATCHED!");
                        key_matched = true;
                        break;
                    }
                }
                if key_matched {
                    break;
                }
            } else {
                log::info!("[ssh_connection] No keys found for variant: {}", variant);
            }
        }

        // Update shared state
        let status = if key_matched {
            log::info!("[ssh_connection] Host key matched for {}", self.hostname);
            KnownHostStatus::Matched
        } else if found_host {
            log::warn!(
                "[ssh_connection] Host key CHANGED for {}!",
                self.hostname
            );
            KnownHostStatus::Changed
        } else {
            log::info!(
                "[ssh_connection] Host key unknown for {} (first time)",
                self.hostname
            );
            KnownHostStatus::Unknown
        };

        // Store state in shared Arc
        {
            let mut state = self.shared_state.lock().await;
            state.status = status;
            state.server_key_fingerprint = Some(server_key_full);
        }

        // Still return true to continue connection, but we'll check state later
        Ok(true)
    }

    async fn auth_banner(
        &mut self,
        banner: &str,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        self.auth_banner = Some(banner.to_string());
        Ok(())
    }
}

/// SSH connection service
pub struct SshConnectionService;

impl SshConnectionService {
    /// Get SSH directory path
    fn get_ssh_dir() -> PathBuf {
        dirs::home_dir()
            .map(|h| h.join(".ssh"))
            .unwrap_or_else(|| PathBuf::from("~/.ssh"))
    }

    /// Load known_hosts file
    async fn load_known_hosts() -> HashMap<String, Vec<String>> {
        let mut known_hosts: HashMap<String, Vec<String>> = HashMap::new();
        let known_hosts_path = Self::get_ssh_dir().join("known_hosts");

        log::info!(
            "[ssh_connection] Loading known_hosts from: {:?}",
            known_hosts_path
        );

        if !known_hosts_path.exists() {
            log::warn!("[ssh_connection] known_hosts file does not exist");
            return known_hosts;
        }

        let content = match fs::read_to_string(&known_hosts_path).await {
            Ok(c) => c,
            Err(e) => {
                log::error!("[ssh_connection] Failed to read known_hosts: {}", e);
                return known_hosts;
            }
        };

        log::info!(
            "[ssh_connection] known_hosts content length: {} bytes",
            content.len()
        );

        let mut line_count = 0;
        let mut parsed_count = 0;

        for line in content.lines() {
            line_count += 1;
            let line = line.trim();
            // Skip empty lines and comments
            if line.is_empty() || line.starts_with('#') {
                continue;
            }

            // Skip hashed format (starts with |1|)
            if line.starts_with("|1|") {
                log::debug!("[ssh_connection] Skipping hashed entry at line {}", line_count);
                continue;
            }

            // Format: hostname[,hostname2,...] key-type key [comment]
            let parts: Vec<&str> = line.splitn(3, ' ').collect();
            if parts.len() < 2 {
                log::debug!("[ssh_connection] Skipping malformed line {}", line_count);
                continue;
            }

            let hostnames = parts[0];
            let key_data = if parts.len() >= 2 {
                parts[1..].join(" ")
            } else {
                continue;
            };

            // There may be multiple hostnames
            for hostname in hostnames.split(',') {
                let hostname = hostname.trim();
                known_hosts
                    .entry(hostname.to_string())
                    .or_default()
                    .push(key_data.clone());
                parsed_count += 1;
            }
        }

        log::info!(
            "[ssh_connection] Parsed {} entries from {} lines. Hosts: {:?}",
            parsed_count,
            line_count,
            known_hosts.keys().collect::<Vec<_>>()
        );

        known_hosts
    }

    /// Read SSH config and resolve host
    async fn resolve_host(host_alias: &str) -> SshResult<HostConfig> {
        let ssh_dir = Self::get_ssh_dir();
        let config_path = ssh_dir.join("config");

        let config = if config_path.exists() {
            fs::read_to_string(&config_path).await.unwrap_or_default()
        } else {
            String::new()
        };

        let hosts = SshConfigParser::parse(&config);
        let merged = SshConfigParser::merge_configs(&hosts, host_alias);

        Ok(merged)
    }

    /// Detect Git platform
    fn detect_platform(hostname: &str) -> Option<String> {
        let lower = hostname.to_lowercase();
        if lower.contains("github.com") {
            Some("github".to_string())
        } else if lower.contains("bitbucket.org") {
            Some("bitbucket".to_string())
        } else if lower.contains("gitlab.com") || lower.contains("gitlab") {
            Some("gitlab".to_string())
        } else {
            None
        }
    }

    /// Check if it's a successful authentication response
    fn is_auth_success(output: &str) -> bool {
        let lower = output.to_lowercase();
        output.contains("You've successfully authenticated")
            || output.contains("Welcome to GitLab")
            || lower.contains("logged in as")
            || (lower.contains("authenticated") && !lower.contains("not authenticated"))
            || lower.contains("welcome")
    }

    /// Load private key
    async fn load_private_key(
        key_path: &PathBuf,
    ) -> SshResult<russh_keys::key::KeyPair> {
        let key_content = fs::read_to_string(key_path).await.map_err(|_| {
            SshBuddyError::KeyNotFound {
                path: key_path.to_string_lossy().to_string(),
            }
        })?;

        // Try loading without password
        russh_keys::decode_secret_key(&key_content, None).map_err(|e| {
            if e.to_string().contains("passphrase") || e.to_string().contains("decrypt") {
                SshBuddyError::Unknown {
                    message: "Key requires passphrase".to_string(),
                }
            } else {
                SshBuddyError::InvalidKeyFormat {
                    message: e.to_string(),
                }
            }
        })
    }

    /// Authenticate using SSH agent
    async fn authenticate_with_agent(
        session: &mut client::Handle<ClientHandler>,
        user: &str,
        key_path: &PathBuf,
    ) -> Result<bool, String> {
        // Connect to SSH agent
        let agent_path = std::env::var("SSH_AUTH_SOCK")
            .map_err(|_| "SSH_AUTH_SOCK not set. SSH agent may not be running.".to_string())?;

        let stream = UnixStream::connect(&agent_path)
            .await
            .map_err(|e| format!("Failed to connect to SSH agent: {}", e))?;

        let mut agent = AgentClient::connect(stream);

        // Get all keys from agent
        let identities = agent
            .request_identities()
            .await
            .map_err(|e| format!("Failed to request identities from agent: {}", e))?;

        log::info!(
            "[ssh_connection] Agent has {} identities",
            identities.len()
        );

        if identities.is_empty() {
            return Err("No keys in SSH agent".to_string());
        }

        // Read target key's public key for comparison
        let pub_key_path = format!("{}.pub", key_path.to_string_lossy());
        let target_pubkey = match fs::read_to_string(&pub_key_path).await {
            Ok(content) => {
                // Parse public key to get fingerprint or base64
                let parts: Vec<&str> = content.trim().split_whitespace().collect();
                if parts.len() >= 2 {
                    Some(parts[1].to_string()) // base64 part
                } else {
                    None
                }
            }
            Err(_) => None,
        };

        // Try to find a matching key
        for identity in identities {
            let identity_base64 = identity.public_key_base64();
            log::debug!(
                "[ssh_connection] Agent identity: {}...",
                &identity_base64[..identity_base64.len().min(50)]
            );

            // If target public key exists, check if it matches
            let should_try = match &target_pubkey {
                Some(target) => identity_base64 == *target,
                None => true, // Try all keys when no target
            };

            if should_try {
                log::info!("[ssh_connection] Trying agent key for authentication");

                // Use authenticate_future with agent for authentication
                let (returned_agent, auth_result) = session
                    .authenticate_future(user, identity, agent)
                    .await;

                // Take back agent ownership for subsequent use
                agent = returned_agent;

                match auth_result {
                    Ok(true) => {
                        log::info!("[ssh_connection] Agent authentication successful");
                        return Ok(true);
                    }
                    Ok(false) => {
                        log::debug!("[ssh_connection] Agent key not accepted, trying next...");
                    }
                    Err(e) => {
                        log::warn!("[ssh_connection] Agent auth error: {}", e);
                        return Err(format!("Agent auth error: {}", e));
                    }
                }
            }
        }

        Err("No matching key found in SSH agent".to_string())
    }

    /// Test SSH connection
    pub async fn test_connection(host_alias: &str) -> SshResult<ConnectionTestResult> {
        let mut debug_log = Vec::new();
        debug_log.push(format!("Testing connection to: {}", host_alias));

        // Resolve host configuration
        let host_config = Self::resolve_host(host_alias).await?;
        let hostname = host_config.get_hostname().to_string();
        let port = host_config.get_port();
        let user = host_config.get_user().unwrap_or("git").to_string();

        debug_log.push(format!("Resolved: {}@{}:{}", user, hostname, port));

        let platform = Self::detect_platform(&hostname);

        // Determine which key to use
        let identity_file = if let Some(ref path) = host_config.identity_file {
            if path.exists() {
                Some(path.clone())
            } else {
                return Ok(ConnectionTestResult {
                    success: false,
                    output: format!("Identity file not found: {}", path.display()),
                    platform,
                    error_type: Some(SshErrorType::IdentityFileNotFound),
                    error_details: Some(SshErrorDetails {
                        error_type: SshErrorType::IdentityFileNotFound,
                        raw_message: format!("Identity file not found: {}", path.display()),
                        suggestion: "Check your SSH config and ensure the key file exists.".to_string(),
                        can_auto_fix: false,
                        fix_type: None,
                        fix_params: None,
                    }),
                    host_to_remove: None,
                    host_to_add: None,
                    identity_file: Some(path.to_string_lossy().to_string()),
                    debug_log: Some(debug_log.join("\n")),
                });
            }
        } else {
            // Try default keys
            let ssh_dir = Self::get_ssh_dir();
            let default_keys = ["id_ed25519", "id_rsa", "id_ecdsa"];
            default_keys
                .iter()
                .map(|k| ssh_dir.join(k))
                .find(|p| p.exists())
        };

        let key_path = match identity_file {
            Some(path) => path,
            None => {
                return Ok(ConnectionTestResult {
                    success: false,
                    output: "No SSH key found".to_string(),
                    platform,
                    error_type: Some(SshErrorType::IdentityFileNotFound),
                    error_details: Some(SshErrorDetails {
                        error_type: SshErrorType::IdentityFileNotFound,
                        raw_message: "No SSH key found in ~/.ssh directory".to_string(),
                        suggestion: "Generate an SSH key using 'ssh-keygen' or configure IdentityFile in your SSH config.".to_string(),
                        can_auto_fix: false,
                        fix_type: None,
                        fix_params: None,
                    }),
                    host_to_remove: None,
                    host_to_add: None,
                    identity_file: None,
                    debug_log: Some(debug_log.join("\n")),
                });
            }
        };

        debug_log.push(format!("Using key: {}", key_path.display()));

        // === Step 1: Connect and check host key first, before loading private key ===
        // This allows detecting unknown/changed host before any key issues

        // Load known_hosts
        let known_host_keys = Self::load_known_hosts().await;
        debug_log.push(format!(
            "Loaded {} known hosts entries",
            known_host_keys.len()
        ));
        log::info!(
            "[ssh_connection] Loaded {} known hosts. Looking for: {}",
            known_host_keys.len(),
            hostname
        );
        // List some known hostnames (for debugging)
        for (host, _) in known_host_keys.iter().take(5) {
            log::debug!("[ssh_connection] Known host: {}", host);
        }

        // Create shared state
        let shared_state = Arc::new(Mutex::new(SharedHostKeyState::default()));

        // SSH client configuration
        let config = client::Config {
            inactivity_timeout: Some(Duration::from_secs(10)),
            ..Default::default()
        };

        let addr = format!("{}:{}", hostname, port);
        debug_log.push(format!("Connecting to {}", addr));

        // Establish connection (with timeout)
        let handler = ClientHandler::new(&hostname, port, known_host_keys, shared_state.clone());
        let connect_result = timeout(
            Duration::from_secs(10),
            client::connect(Arc::new(config), &addr, handler),
        )
        .await;

        let mut session = match connect_result {
            Ok(Ok(session)) => session,
            Ok(Err(e)) => {
                let error_msg = e.to_string();
                let (error_type, suggestion) = if error_msg.contains("Connection refused") {
                    (
                        SshErrorType::ConnectionRefused,
                        "Connection refused. The SSH server may not be running or a firewall is blocking.".to_string(),
                    )
                } else if error_msg.contains("No such host") || error_msg.contains("resolve") {
                    (
                        SshErrorType::DnsFailed,
                        "Hostname could not be resolved. Check the hostname spelling.".to_string(),
                    )
                } else {
                    (SshErrorType::Unknown, format!("Connection failed: {}", error_msg))
                };

                return Ok(ConnectionTestResult {
                    success: false,
                    output: error_msg.clone(),
                    platform,
                    error_type: Some(error_type.clone()),
                    error_details: Some(SshErrorDetails {
                        error_type,
                        raw_message: error_msg,
                        suggestion,
                        can_auto_fix: false,
                        fix_type: None,
                        fix_params: None,
                    }),
                    host_to_remove: None,
                    host_to_add: None,
                    identity_file: Some(key_path.to_string_lossy().to_string()),
                    debug_log: Some(debug_log.join("\n")),
                });
            }
            Err(_) => {
                return Ok(ConnectionTestResult {
                    success: false,
                    output: "Connection timed out".to_string(),
                    platform,
                    error_type: Some(SshErrorType::Timeout),
                    error_details: Some(SshErrorDetails {
                        error_type: SshErrorType::Timeout,
                        raw_message: "Connection timed out after 10 seconds".to_string(),
                        suggestion: "Check your network connection and firewall settings.".to_string(),
                        can_auto_fix: false,
                        fix_type: None,
                        fix_params: None,
                    }),
                    host_to_remove: None,
                    host_to_add: None,
                    identity_file: Some(key_path.to_string_lossy().to_string()),
                    debug_log: Some(debug_log.join("\n")),
                });
            }
        };

        debug_log.push("Connected, checking host key...".to_string());

        // Check host key status
        let host_key_state = shared_state.lock().await.clone();
        match host_key_state.status {
            KnownHostStatus::Unknown => {
                debug_log.push("Host key is unknown (first time connection)".to_string());
                return Ok(ConnectionTestResult {
                    success: false,
                    output: "This is the first time connecting to this server. SSH needs to verify the server's identity.".to_string(),
                    platform,
                    error_type: Some(SshErrorType::HostKeyUnknown),
                    error_details: Some(SshErrorDetails {
                        error_type: SshErrorType::HostKeyUnknown,
                        raw_message: "Host key verification failed".to_string(),
                        suggestion: "Add this host to your known_hosts file to continue.".to_string(),
                        can_auto_fix: true,
                        fix_type: Some("add-known-host".to_string()),
                        fix_params: Some({
                            let mut params = std::collections::HashMap::new();
                            params.insert("hostname".to_string(), hostname.clone());
                            params.insert("port".to_string(), port.to_string());
                            params
                        }),
                    }),
                    host_to_remove: None,
                    host_to_add: Some(hostname.clone()),
                    identity_file: Some(key_path.to_string_lossy().to_string()),
                    debug_log: Some(debug_log.join("\n")),
                });
            }
            KnownHostStatus::Changed => {
                debug_log.push("Host key has CHANGED!".to_string());
                return Ok(ConnectionTestResult {
                    success: false,
                    output: "WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!".to_string(),
                    platform,
                    error_type: Some(SshErrorType::HostKeyChanged),
                    error_details: Some(SshErrorDetails {
                        error_type: SshErrorType::HostKeyChanged,
                        raw_message: "Host key verification failed. The server key has changed.".to_string(),
                        suggestion: "If this is expected (server reinstall), remove the old key from known_hosts.".to_string(),
                        can_auto_fix: true,
                        fix_type: Some("remove-known-host".to_string()),
                        fix_params: Some({
                            let mut params = std::collections::HashMap::new();
                            params.insert("hostname".to_string(), hostname.clone());
                            params
                        }),
                    }),
                    host_to_remove: Some(hostname.clone()),
                    host_to_add: None,
                    identity_file: Some(key_path.to_string_lossy().to_string()),
                    debug_log: Some(debug_log.join("\n")),
                });
            }
            KnownHostStatus::Matched => {
                debug_log.push("Host key verified".to_string());
            }
        }

        // === Step 2: After host key verification, try authentication ===
        // Strategy: Try loading key directly first, use SSH agent if encrypted

        debug_log.push("Loading private key...".to_string());

        // Try loading key directly
        let direct_key_result = Self::load_private_key(&key_path).await;

        let auth_result = match direct_key_result {
            Ok(key_pair) => {
                // Key can be loaded directly, use it for authentication
                debug_log.push("Key loaded directly, authenticating...".to_string());
                session.authenticate_publickey(&user, Arc::new(key_pair)).await
            }
            Err(e) => {
                let error_msg = e.to_string();
                let is_encrypted = error_msg.contains("passphrase")
                    || error_msg.contains("encrypted")
                    || error_msg.contains("decrypt");

                if is_encrypted {
                    // Key is encrypted, try using SSH agent
                    debug_log.push("Key is encrypted, trying SSH agent...".to_string());
                    log::info!("[ssh_connection] Key is encrypted, attempting SSH agent authentication");

                    match Self::authenticate_with_agent(&mut session, &user, &key_path).await {
                        Ok(authenticated) => Ok(authenticated),
                        Err(agent_err) => {
                            // Agent authentication failed, return original encryption error
                            log::warn!("[ssh_connection] Agent auth failed: {}", agent_err);
                            debug_log.push(format!("Agent auth failed: {}", agent_err));

                            return Ok(ConnectionTestResult {
                                success: false,
                                output: "Key requires passphrase and is not in SSH agent".to_string(),
                                platform,
                                error_type: Some(SshErrorType::PermissionDeniedPassphrase),
                                error_details: Some(SshErrorDetails {
                                    error_type: SshErrorType::PermissionDeniedPassphrase,
                                    raw_message: format!("Key encrypted: {}. Agent error: {}", error_msg, agent_err),
                                    suggestion: "Add your key to the SSH agent first.".to_string(),
                                    can_auto_fix: true,
                                    fix_type: Some("ssh-add".to_string()),
                                    fix_params: Some({
                                        let mut params = std::collections::HashMap::new();
                                        params.insert("keyPath".to_string(), key_path.to_string_lossy().to_string());
                                        params
                                    }),
                                }),
                                host_to_remove: None,
                                host_to_add: None,
                                identity_file: Some(key_path.to_string_lossy().to_string()),
                                debug_log: Some(debug_log.join("\n")),
                            });
                        }
                    }
                } else {
                    // Other errors (not encryption related)
                    return Ok(ConnectionTestResult {
                        success: false,
                        output: error_msg.clone(),
                        platform,
                        error_type: Some(SshErrorType::PermissionDenied),
                        error_details: Some(SshErrorDetails {
                            error_type: SshErrorType::PermissionDenied,
                            raw_message: error_msg,
                            suggestion: "Failed to load private key.".to_string(),
                            can_auto_fix: false,
                            fix_type: None,
                            fix_params: None,
                        }),
                        host_to_remove: None,
                        host_to_add: None,
                        identity_file: Some(key_path.to_string_lossy().to_string()),
                        debug_log: Some(debug_log.join("\n")),
                    });
                }
            }
        };

        match auth_result {
            Ok(authenticated) => {
                if authenticated {
                    debug_log.push("Authentication successful".to_string());

                    // Try opening channel to get welcome message
                    let output = match session.channel_open_session().await {
                        Ok(mut channel) => {
                            // For Git platforms, requesting shell returns welcome message
                            let _ = channel.request_shell(false).await;

                            // Wait for response (with timeout)
                            let mut output = String::new();
                            let wait_result = timeout(Duration::from_secs(3), async {
                                while let Some(msg) = channel.wait().await {
                                    match msg {
                                        ChannelMsg::Data { data } => {
                                            output.push_str(&String::from_utf8_lossy(&data));
                                        }
                                        ChannelMsg::ExtendedData { data, .. } => {
                                            output.push_str(&String::from_utf8_lossy(&data));
                                        }
                                        ChannelMsg::Eof | ChannelMsg::Close => break,
                                        _ => {}
                                    }
                                }
                            }).await;

                            // Ignore timeout error, as some servers don't close connection
                            let _ = wait_result;
                            output
                        }
                        Err(_) => "Authentication successful".to_string(),
                    };

                    let success = Self::is_auth_success(&output) || authenticated;

                    Ok(ConnectionTestResult {
                        success,
                        output: if output.is_empty() {
                            "Authentication successful".to_string()
                        } else {
                            output
                        },
                        platform,
                        error_type: None,
                        error_details: None,
                        host_to_remove: None,
                        host_to_add: None,
                        identity_file: Some(key_path.to_string_lossy().to_string()),
                        debug_log: Some(debug_log.join("\n")),
                    })
                } else {
                    debug_log.push("Authentication failed".to_string());

                    Ok(ConnectionTestResult {
                        success: false,
                        output: "Permission denied (publickey)".to_string(),
                        platform,
                        error_type: Some(SshErrorType::PermissionDenied),
                        error_details: Some(SshErrorDetails {
                            error_type: SshErrorType::PermissionDenied,
                            raw_message: "Authentication failed".to_string(),
                            suggestion: "Check that your public key is added to the server.".to_string(),
                            can_auto_fix: false,
                            fix_type: None,
                            fix_params: None,
                        }),
                        host_to_remove: None,
                        host_to_add: None,
                        identity_file: Some(key_path.to_string_lossy().to_string()),
                        debug_log: Some(debug_log.join("\n")),
                    })
                }
            }
            Err(e) => {
                let error_msg = e.to_string();
                debug_log.push(format!("Authentication error: {}", error_msg));

                Ok(ConnectionTestResult {
                    success: false,
                    output: format!("Authentication failed: {}", error_msg),
                    platform,
                    error_type: Some(SshErrorType::PermissionDenied),
                    error_details: Some(SshErrorDetails {
                        error_type: SshErrorType::PermissionDenied,
                        raw_message: error_msg,
                        suggestion: "Check that your public key is added to the server.".to_string(),
                        can_auto_fix: false,
                        fix_type: None,
                        fix_params: None,
                    }),
                    host_to_remove: None,
                    host_to_add: None,
                    identity_file: Some(key_path.to_string_lossy().to_string()),
                    debug_log: Some(debug_log.join("\n")),
                })
            }
        }
    }
}
