mod commands;
mod models;
mod services;
mod utils;

use commands::{
    add_key_to_agent, add_known_host, check_key_permissions, check_ssh_dir_permissions,
    delete_ssh_key, fix_key_permissions, fix_ssh_dir_permissions, generate_ssh_key,
    get_key_details, is_agent_running, is_key_in_agent, list_agent_keys, list_ssh_keys,
    read_public_key, remove_key_from_agent, remove_known_host, test_ssh_connection,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            // Key management
            list_ssh_keys,
            read_public_key,
            get_key_details,
            generate_ssh_key,
            delete_ssh_key,
            // SSH Agent
            is_agent_running,
            list_agent_keys,
            is_key_in_agent,
            add_key_to_agent,
            remove_key_from_agent,
            // SSH connection test
            test_ssh_connection,
            // Known Hosts
            add_known_host,
            remove_known_host,
            // Permission management
            check_key_permissions,
            fix_key_permissions,
            check_ssh_dir_permissions,
            fix_ssh_dir_permissions,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
