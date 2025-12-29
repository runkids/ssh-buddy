use crate::models::SshBuddyError;
use crate::services::{AddKeyResult, AgentKeyInfo, AgentService, RemoveKeyResult};

/// Check if SSH Agent is running
#[tauri::command]
pub async fn is_agent_running() -> bool {
    log::info!("[agent] Checking if SSH agent is running");
    let running = AgentService::is_running().await;
    log::info!("[agent] SSH agent running: {}", running);
    running
}

/// List all keys in the Agent
#[tauri::command]
pub async fn list_agent_keys() -> Result<Vec<AgentKeyInfo>, SshBuddyError> {
    log::info!("[agent] Listing agent keys");
    let keys = AgentService::list_keys().await?;
    log::info!("[agent] Found {} keys in agent", keys.len());
    Ok(keys)
}

/// Check if a key is in the Agent
#[tauri::command]
pub async fn is_key_in_agent(key_path: String) -> Result<bool, SshBuddyError> {
    log::info!("[agent] Checking if key is in agent: {}", key_path);
    let in_agent = AgentService::is_key_in_agent(&key_path).await?;
    log::info!("[agent] Key in agent: {}", in_agent);
    Ok(in_agent)
}

/// Add a key to the Agent
/// Passphrase is optional. If the key requires a passphrase but none is provided,
/// returns needs_passphrase: true
#[tauri::command]
pub async fn add_key_to_agent(
    key_path: String,
    passphrase: Option<String>,
) -> Result<AddKeyResult, SshBuddyError> {
    log::info!("[agent] Adding key to agent: {}", key_path);
    let result = AgentService::add_key(&key_path, passphrase.as_deref()).await?;
    log::info!("[agent] Add key result: {:?}", result);
    Ok(result)
}

/// Remove a key from the Agent
#[tauri::command]
pub async fn remove_key_from_agent(key_path: String) -> Result<RemoveKeyResult, SshBuddyError> {
    log::info!("[agent] Removing key from agent: {}", key_path);
    let result = AgentService::remove_key(&key_path).await?;
    log::info!("[agent] Remove key result: {:?}", result);
    Ok(result)
}
