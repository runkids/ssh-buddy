pub mod agent;
pub mod connection;
pub mod keys;
pub mod known_hosts;
pub mod permissions;

pub use agent::{
    add_key_to_agent, is_agent_running, is_key_in_agent, list_agent_keys, remove_key_from_agent,
};
pub use connection::test_ssh_connection;
pub use keys::{delete_ssh_key, generate_ssh_key, get_key_details, list_ssh_keys, read_public_key};
pub use known_hosts::{add_known_host, remove_known_host};
pub use permissions::{
    check_key_permissions, check_ssh_dir_permissions, fix_key_permissions, fix_ssh_dir_permissions,
};
