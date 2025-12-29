use crate::models::{SshBuddyError, SshResult};
use std::path::Path;

/// Validate SSH key name to prevent path traversal attacks
pub fn validate_key_name(key_name: &str) -> SshResult<()> {
    // Check for empty value
    if key_name.is_empty() {
        return Err(SshBuddyError::InvalidKeyName {
            message: "Key name cannot be empty".to_string(),
        });
    }

    // Check for path separators
    if key_name.contains('/') || key_name.contains('\\') {
        return Err(SshBuddyError::PathTraversalDetected {
            path: key_name.to_string(),
        });
    }

    // Check for special path names
    if key_name == "." || key_name == ".." || key_name.starts_with('.') && key_name.len() == 2 {
        return Err(SshBuddyError::PathTraversalDetected {
            path: key_name.to_string(),
        });
    }

    // Check for null bytes
    if key_name.contains('\0') {
        return Err(SshBuddyError::InvalidKeyName {
            message: "Key name contains null bytes".to_string(),
        });
    }

    // Check length limit
    if key_name.len() > 255 {
        return Err(SshBuddyError::InvalidKeyName {
            message: "Key name too long (max 255 characters)".to_string(),
        });
    }

    Ok(())
}

/// Validate path is within SSH directory
#[allow(dead_code)]
pub fn validate_path_in_ssh_dir(path: &Path, ssh_dir: &Path) -> SshResult<()> {
    // Canonicalize path
    let canonical_path = path.canonicalize().map_err(|_| SshBuddyError::InvalidPath {
        message: format!("Cannot resolve path: {}", path.display()),
    })?;

    let canonical_ssh_dir = ssh_dir
        .canonicalize()
        .map_err(|_| SshBuddyError::InvalidPath {
            message: format!("Cannot resolve SSH directory: {}", ssh_dir.display()),
        })?;

    // Ensure path is within SSH directory
    if !canonical_path.starts_with(&canonical_ssh_dir) {
        return Err(SshBuddyError::PathTraversalDetected {
            path: path.display().to_string(),
        });
    }

    Ok(())
}

/// Validate hostname to prevent command injection
#[allow(dead_code)]
pub fn validate_hostname(hostname: &str) -> SshResult<()> {
    // Check for empty value
    if hostname.is_empty() {
        return Err(SshBuddyError::InvalidPath {
            message: "Hostname cannot be empty".to_string(),
        });
    }

    // Check length
    if hostname.len() > 255 {
        return Err(SshBuddyError::InvalidPath {
            message: "Hostname too long".to_string(),
        });
    }

    // Only allow safe characters: letters, numbers, dots, hyphens, underscores, colons (IPv6), brackets (IPv6)
    let is_valid = hostname.chars().all(|c| {
        c.is_ascii_alphanumeric()
            || c == '.'
            || c == '-'
            || c == '_'
            || c == ':'
            || c == '['
            || c == ']'
    });

    if !is_valid {
        return Err(SshBuddyError::InvalidPath {
            message: format!("Hostname contains invalid characters: {}", hostname),
        });
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_key_name_valid() {
        assert!(validate_key_name("id_ed25519").is_ok());
        assert!(validate_key_name("my-key").is_ok());
        assert!(validate_key_name("key_2024").is_ok());
    }

    #[test]
    fn test_validate_key_name_path_traversal() {
        assert!(validate_key_name("../etc/passwd").is_err());
        assert!(validate_key_name("..").is_err());
        assert!(validate_key_name("foo/bar").is_err());
        assert!(validate_key_name("foo\\bar").is_err());
    }

    #[test]
    fn test_validate_key_name_empty() {
        assert!(validate_key_name("").is_err());
    }

    #[test]
    fn test_validate_hostname_valid() {
        assert!(validate_hostname("example.com").is_ok());
        assert!(validate_hostname("192.168.1.1").is_ok());
        assert!(validate_hostname("my-server").is_ok());
        assert!(validate_hostname("[::1]").is_ok());
    }

    #[test]
    fn test_validate_hostname_invalid() {
        assert!(validate_hostname("").is_err());
        assert!(validate_hostname("host; rm -rf /").is_err());
        assert!(validate_hostname("host`whoami`").is_err());
    }
}
