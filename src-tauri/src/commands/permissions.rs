use crate::models::SshBuddyError;
use crate::services::{PermissionCheckResult, PermissionFixResult, PermissionService};

/// Check key file permissions
#[tauri::command]
pub async fn check_key_permissions(key_path: String) -> Result<PermissionCheckResult, SshBuddyError> {
    log::info!("[permissions] Checking permissions for: {}", key_path);
    let result = PermissionService::check_key_permissions(&key_path).await?;
    log::info!("[permissions] Check result: {:?}", result);
    Ok(result)
}

/// Fix key file permissions
#[tauri::command]
pub async fn fix_key_permissions(key_path: String) -> Result<PermissionFixResult, SshBuddyError> {
    log::info!("[permissions] Fixing permissions for: {}", key_path);
    let result = PermissionService::fix_key_permissions(&key_path).await?;
    log::info!("[permissions] Fix result: {:?}", result);
    Ok(result)
}

/// Check SSH directory permissions
#[tauri::command]
pub async fn check_ssh_dir_permissions() -> Result<PermissionCheckResult, SshBuddyError> {
    log::info!("[permissions] Checking SSH directory permissions");
    let result = PermissionService::check_ssh_dir_permissions().await?;
    log::info!("[permissions] Check result: {:?}", result);
    Ok(result)
}

/// Fix SSH directory permissions
#[tauri::command]
pub async fn fix_ssh_dir_permissions() -> Result<PermissionFixResult, SshBuddyError> {
    log::info!("[permissions] Fixing SSH directory permissions");
    let result = PermissionService::fix_ssh_dir_permissions().await?;
    log::info!("[permissions] Fix result: {:?}", result);
    Ok(result)
}
