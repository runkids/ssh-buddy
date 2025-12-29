use crate::models::{SshBuddyError, SshResult};
use std::path::Path;

/// 驗證 SSH 密鑰名稱，防止路徑遍歷攻擊
pub fn validate_key_name(key_name: &str) -> SshResult<()> {
    // 檢查空值
    if key_name.is_empty() {
        return Err(SshBuddyError::InvalidKeyName {
            message: "Key name cannot be empty".to_string(),
        });
    }

    // 檢查路徑分隔符
    if key_name.contains('/') || key_name.contains('\\') {
        return Err(SshBuddyError::PathTraversalDetected {
            path: key_name.to_string(),
        });
    }

    // 檢查特殊路徑名稱
    if key_name == "." || key_name == ".." || key_name.starts_with('.') && key_name.len() == 2 {
        return Err(SshBuddyError::PathTraversalDetected {
            path: key_name.to_string(),
        });
    }

    // 檢查 null 字節
    if key_name.contains('\0') {
        return Err(SshBuddyError::InvalidKeyName {
            message: "Key name contains null bytes".to_string(),
        });
    }

    // 檢查長度限制
    if key_name.len() > 255 {
        return Err(SshBuddyError::InvalidKeyName {
            message: "Key name too long (max 255 characters)".to_string(),
        });
    }

    Ok(())
}

/// 驗證路徑是否在 SSH 目錄內
pub fn validate_path_in_ssh_dir(path: &Path, ssh_dir: &Path) -> SshResult<()> {
    // 規範化路徑
    let canonical_path = path.canonicalize().map_err(|_| SshBuddyError::InvalidPath {
        message: format!("Cannot resolve path: {}", path.display()),
    })?;

    let canonical_ssh_dir = ssh_dir
        .canonicalize()
        .map_err(|_| SshBuddyError::InvalidPath {
            message: format!("Cannot resolve SSH directory: {}", ssh_dir.display()),
        })?;

    // 確保路徑在 SSH 目錄內
    if !canonical_path.starts_with(&canonical_ssh_dir) {
        return Err(SshBuddyError::PathTraversalDetected {
            path: path.display().to_string(),
        });
    }

    Ok(())
}

/// 驗證主機名，防止命令注入
pub fn validate_hostname(hostname: &str) -> SshResult<()> {
    // 檢查空值
    if hostname.is_empty() {
        return Err(SshBuddyError::InvalidPath {
            message: "Hostname cannot be empty".to_string(),
        });
    }

    // 檢查長度
    if hostname.len() > 255 {
        return Err(SshBuddyError::InvalidPath {
            message: "Hostname too long".to_string(),
        });
    }

    // 只允許安全字符：字母、數字、點、連字符、下劃線、冒號（IPv6）、方括號（IPv6）
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
