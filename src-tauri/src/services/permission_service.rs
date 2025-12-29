use crate::models::{SshBuddyError, SshResult};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

/// Permission check result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionCheckResult {
    pub is_valid: bool,
    pub current_mode: Option<String>,
    pub expected_mode: String,
    pub message: String,
}

/// Permission fix result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionFixResult {
    pub success: bool,
    pub message: String,
    pub new_mode: Option<String>,
}

/// Permission service
pub struct PermissionService;

impl PermissionService {
    /// Check key file permissions
    #[cfg(unix)]
    pub async fn check_key_permissions(key_path: &str) -> SshResult<PermissionCheckResult> {
        let path = Path::new(key_path);

        if !path.exists() {
            return Err(SshBuddyError::KeyNotFound {
                path: key_path.to_string(),
            });
        }

        let metadata = std::fs::metadata(path).map_err(|e| SshBuddyError::IoError {
            message: format!("Failed to read file metadata: {}", e),
        })?;

        let mode = metadata.permissions().mode();
        let file_mode = mode & 0o777; // Only get file permission bits
        let mode_str = format!("{:03o}", file_mode);

        // Private key should be 600 (rw-------)
        let is_valid = file_mode == 0o600;
        let expected_mode = "600".to_string();

        Ok(PermissionCheckResult {
            is_valid,
            current_mode: Some(mode_str.clone()),
            expected_mode,
            message: if is_valid {
                "Key permissions are correct".to_string()
            } else {
                format!(
                    "Key permissions are {} but should be 600. File is too accessible.",
                    mode_str
                )
            },
        })
    }

    #[cfg(not(unix))]
    pub async fn check_key_permissions(key_path: &str) -> SshResult<PermissionCheckResult> {
        let path = Path::new(key_path);

        if !path.exists() {
            return Err(SshBuddyError::KeyNotFound {
                path: key_path.to_string(),
            });
        }

        // Windows doesn't use Unix permission mode
        // We could check ACL, but that's more complex
        // For now, assume valid
        Ok(PermissionCheckResult {
            is_valid: true,
            current_mode: None,
            expected_mode: "N/A".to_string(),
            message: "Windows permission check not fully implemented".to_string(),
        })
    }

    /// Fix key file permissions
    #[cfg(unix)]
    pub async fn fix_key_permissions(key_path: &str) -> SshResult<PermissionFixResult> {
        let path = Path::new(key_path);

        if !path.exists() {
            return Err(SshBuddyError::KeyNotFound {
                path: key_path.to_string(),
            });
        }

        // Set permissions to 600
        let permissions = std::fs::Permissions::from_mode(0o600);
        std::fs::set_permissions(path, permissions).map_err(|e| SshBuddyError::IoError {
            message: format!("Failed to set permissions: {}", e),
        })?;

        // Verify new permissions
        let metadata = std::fs::metadata(path).map_err(|e| SshBuddyError::IoError {
            message: format!("Failed to verify permissions: {}", e),
        })?;

        let new_mode = metadata.permissions().mode() & 0o777;
        let mode_str = format!("{:03o}", new_mode);

        Ok(PermissionFixResult {
            success: new_mode == 0o600,
            message: format!("Permissions set to {}", mode_str),
            new_mode: Some(mode_str),
        })
    }

    #[cfg(not(unix))]
    pub async fn fix_key_permissions(key_path: &str) -> SshResult<PermissionFixResult> {
        let path = Path::new(key_path);

        if !path.exists() {
            return Err(SshBuddyError::KeyNotFound {
                path: key_path.to_string(),
            });
        }

        // Windows requires icacls or PowerShell to set ACL
        // Use icacls command to restrict permissions
        let output = std::process::Command::new("icacls")
            .args([
                key_path,
                "/inheritance:r",  // Remove inheritance
                "/grant:r",
                &format!("{}:F", whoami::username()), // Only give current user full control
            ])
            .output()
            .map_err(|e| SshBuddyError::IoError {
                message: format!("Failed to run icacls: {}", e),
            })?;

        if output.status.success() {
            Ok(PermissionFixResult {
                success: true,
                message: "Permissions restricted to current user only".to_string(),
                new_mode: None,
            })
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Ok(PermissionFixResult {
                success: false,
                message: format!("Failed to set permissions: {}", stderr),
                new_mode: None,
            })
        }
    }

    /// Check SSH directory permissions
    #[cfg(unix)]
    pub async fn check_ssh_dir_permissions() -> SshResult<PermissionCheckResult> {
        let ssh_dir = dirs::home_dir()
            .ok_or(SshBuddyError::HomeDirNotFound)?
            .join(".ssh");

        if !ssh_dir.exists() {
            return Ok(PermissionCheckResult {
                is_valid: false,
                current_mode: None,
                expected_mode: "700".to_string(),
                message: "SSH directory does not exist".to_string(),
            });
        }

        let metadata = std::fs::metadata(&ssh_dir).map_err(|e| SshBuddyError::IoError {
            message: format!("Failed to read directory metadata: {}", e),
        })?;

        let mode = metadata.permissions().mode();
        let dir_mode = mode & 0o777;
        let mode_str = format!("{:03o}", dir_mode);

        // .ssh directory should be 700 (rwx------)
        let is_valid = dir_mode == 0o700;

        Ok(PermissionCheckResult {
            is_valid,
            current_mode: Some(mode_str.clone()),
            expected_mode: "700".to_string(),
            message: if is_valid {
                "SSH directory permissions are correct".to_string()
            } else {
                format!(
                    "SSH directory permissions are {} but should be 700",
                    mode_str
                )
            },
        })
    }

    #[cfg(not(unix))]
    pub async fn check_ssh_dir_permissions() -> SshResult<PermissionCheckResult> {
        Ok(PermissionCheckResult {
            is_valid: true,
            current_mode: None,
            expected_mode: "N/A".to_string(),
            message: "Windows permission check not fully implemented".to_string(),
        })
    }

    /// Fix SSH directory permissions
    #[cfg(unix)]
    pub async fn fix_ssh_dir_permissions() -> SshResult<PermissionFixResult> {
        let ssh_dir = dirs::home_dir()
            .ok_or(SshBuddyError::HomeDirNotFound)?
            .join(".ssh");

        if !ssh_dir.exists() {
            // Create directory
            std::fs::create_dir_all(&ssh_dir).map_err(|e| SshBuddyError::IoError {
                message: format!("Failed to create SSH directory: {}", e),
            })?;
        }

        // Set permissions to 700
        let permissions = std::fs::Permissions::from_mode(0o700);
        std::fs::set_permissions(&ssh_dir, permissions).map_err(|e| SshBuddyError::IoError {
            message: format!("Failed to set directory permissions: {}", e),
        })?;

        Ok(PermissionFixResult {
            success: true,
            message: "SSH directory permissions set to 700".to_string(),
            new_mode: Some("700".to_string()),
        })
    }

    #[cfg(not(unix))]
    pub async fn fix_ssh_dir_permissions() -> SshResult<PermissionFixResult> {
        Ok(PermissionFixResult {
            success: true,
            message: "Windows permission fix not implemented".to_string(),
            new_mode: None,
        })
    }
}
