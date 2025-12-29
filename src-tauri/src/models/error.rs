use serde::Deserialize;
use thiserror::Error;

#[derive(Error, Debug, Deserialize, Clone)]
pub enum SshBuddyError {
    // Key errors
    #[error("Key not found: {path}")]
    KeyNotFound { path: String },

    #[error("Invalid key format: {message}")]
    InvalidKeyFormat { message: String },

    #[error("Key already exists: {name}")]
    KeyAlreadyExists { name: String },

    #[error("Key permissions too open: {path}")]
    KeyPermissionsTooOpen { path: String },

    // Security errors
    #[error("Invalid path: {message}")]
    InvalidPath { message: String },

    #[error("Path traversal detected: {path}")]
    PathTraversalDetected { path: String },

    #[error("Invalid key name: {message}")]
    InvalidKeyName { message: String },

    // Connection errors
    #[error("Host key changed: {hostname}")]
    HostKeyChanged { hostname: String },

    #[error("Host key unknown: {hostname}")]
    HostKeyUnknown { hostname: String },

    #[error("Connection refused: {message}")]
    ConnectionRefused { message: String },

    #[error("Connection timeout")]
    ConnectionTimeout,

    #[error("DNS resolution failed: {hostname}")]
    DnsResolutionFailed { hostname: String },

    // Authentication errors
    #[error("Permission denied: {reason}")]
    PermissionDenied { reason: String },

    #[error("Passphrase required for key: {path}")]
    PassphraseRequired { path: String },

    #[error("Key not in agent: {path}")]
    KeyNotInAgent { path: String },

    // System errors
    #[error("IO error: {message}")]
    IoError { message: String },

    #[error("Agent not running")]
    AgentNotRunning,

    #[error("Home directory not found")]
    HomeDirNotFound,

    #[error("Unknown error: {message}")]
    Unknown { message: String },
}

impl From<std::io::Error> for SshBuddyError {
    fn from(e: std::io::Error) -> Self {
        SshBuddyError::IoError {
            message: e.to_string(),
        }
    }
}

impl From<ssh_key::Error> for SshBuddyError {
    fn from(e: ssh_key::Error) -> Self {
        SshBuddyError::InvalidKeyFormat {
            message: e.to_string(),
        }
    }
}

// Result type for Tauri command returns
pub type SshResult<T> = Result<T, SshBuddyError>;

// Implement Serialize for Tauri IPC
impl serde::Serialize for SshBuddyError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        // Serialize as a struct containing type and message
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("SshBuddyError", 2)?;
        state.serialize_field("type", &self.error_type())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

impl SshBuddyError {
    pub fn error_type(&self) -> &'static str {
        match self {
            SshBuddyError::KeyNotFound { .. } => "KeyNotFound",
            SshBuddyError::InvalidKeyFormat { .. } => "InvalidKeyFormat",
            SshBuddyError::KeyAlreadyExists { .. } => "KeyAlreadyExists",
            SshBuddyError::KeyPermissionsTooOpen { .. } => "KeyPermissionsTooOpen",
            SshBuddyError::InvalidPath { .. } => "InvalidPath",
            SshBuddyError::PathTraversalDetected { .. } => "PathTraversalDetected",
            SshBuddyError::InvalidKeyName { .. } => "InvalidKeyName",
            SshBuddyError::HostKeyChanged { .. } => "HostKeyChanged",
            SshBuddyError::HostKeyUnknown { .. } => "HostKeyUnknown",
            SshBuddyError::ConnectionRefused { .. } => "ConnectionRefused",
            SshBuddyError::ConnectionTimeout => "ConnectionTimeout",
            SshBuddyError::DnsResolutionFailed { .. } => "DnsResolutionFailed",
            SshBuddyError::PermissionDenied { .. } => "PermissionDenied",
            SshBuddyError::PassphraseRequired { .. } => "PassphraseRequired",
            SshBuddyError::KeyNotInAgent { .. } => "KeyNotInAgent",
            SshBuddyError::IoError { .. } => "IoError",
            SshBuddyError::AgentNotRunning => "AgentNotRunning",
            SshBuddyError::HomeDirNotFound => "HomeDirNotFound",
            SshBuddyError::Unknown { .. } => "Unknown",
        }
    }
}
