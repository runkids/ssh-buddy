use crate::models::SshBuddyError;
use crate::services::{KnownHostAddResult, KnownHostRemoveResult, KnownHostsService};

/// Remove a host from known_hosts
#[tauri::command]
pub async fn remove_known_host(hostname: String) -> Result<KnownHostRemoveResult, SshBuddyError> {
    log::info!("[known_hosts] Removing host: {}", hostname);
    let result = KnownHostsService::remove_host(&hostname).await?;
    log::info!("[known_hosts] Remove result: {:?}", result);
    Ok(result)
}

/// Add a host to known_hosts
#[tauri::command]
pub async fn add_known_host(
    hostname: String,
    port: Option<u16>,
) -> Result<KnownHostAddResult, SshBuddyError> {
    log::info!("[known_hosts] Adding host: {}:{}", hostname, port.unwrap_or(22));
    let result = KnownHostsService::add_host(&hostname, port).await?;
    log::info!("[known_hosts] Add result: {:?}", result);
    Ok(result)
}
