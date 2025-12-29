use crate::models::{KeyDetails, SSHKeyInfo, SshBuddyError};
use crate::services::{GenerateKeyOptions, KeyManager};

/// List all SSH keys
#[tauri::command]
pub async fn list_ssh_keys() -> Result<Vec<SSHKeyInfo>, SshBuddyError> {
    log::info!("[keys] Listing SSH keys");
    let manager = KeyManager::new()?;
    let keys = manager.list_keys().await?;
    log::info!("[keys] Found {} keys", keys.len());
    Ok(keys)
}

/// Read public key content
#[tauri::command]
pub async fn read_public_key(key_name: String) -> Result<String, SshBuddyError> {
    log::info!("[keys] Reading public key: {}", key_name);
    let manager = KeyManager::new()?;
    let content = manager.read_public_key(&key_name).await?;
    Ok(content)
}

/// Get key details
#[tauri::command]
pub async fn get_key_details(key_path: String) -> Result<KeyDetails, SshBuddyError> {
    log::info!("[keys] Getting key details: {}", key_path);
    let manager = KeyManager::new()?;
    let details = manager.get_key_details(&key_path).await?;
    Ok(details)
}

/// Generate a new SSH key pair
#[tauri::command]
pub async fn generate_ssh_key(options: GenerateKeyOptions) -> Result<SSHKeyInfo, SshBuddyError> {
    log::info!(
        "[keys] Generating {} key: {}",
        options.key_type,
        options.name
    );
    let manager = KeyManager::new()?;
    let key_info = manager.generate_key(options).await?;
    log::info!("[keys] Key generated successfully");
    Ok(key_info)
}

/// Delete an SSH key pair
#[tauri::command]
pub async fn delete_ssh_key(key_name: String) -> Result<(), SshBuddyError> {
    log::info!("[keys] Deleting key: {}", key_name);
    let manager = KeyManager::new()?;
    manager.delete_key(&key_name).await?;
    log::info!("[keys] Key deleted successfully");
    Ok(())
}
