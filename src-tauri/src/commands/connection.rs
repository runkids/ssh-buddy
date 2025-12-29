use crate::models::SshBuddyError;
use crate::services::{ConnectionTestResult, SshConnectionService};

/// Test SSH connection
#[tauri::command]
pub async fn test_ssh_connection(
    host_alias: String,
) -> Result<ConnectionTestResult, SshBuddyError> {
    log::info!("[connection] Testing SSH connection to: {}", host_alias);
    let result = SshConnectionService::test_connection(&host_alias).await?;
    log::info!(
        "[connection] Test result: success={}, output={}",
        result.success,
        result.output.chars().take(100).collect::<String>()
    );
    Ok(result)
}
