use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum KeyType {
    Ed25519,
    Rsa,
    Ecdsa,
    Dsa,
    Unknown,
}

impl From<&str> for KeyType {
    fn from(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "ed25519" | "ssh-ed25519" => KeyType::Ed25519,
            "rsa" | "ssh-rsa" => KeyType::Rsa,
            "ecdsa" | "ecdsa-sha2-nistp256" | "ecdsa-sha2-nistp384" | "ecdsa-sha2-nistp521" => {
                KeyType::Ecdsa
            }
            "dsa" | "ssh-dss" => KeyType::Dsa,
            _ => KeyType::Unknown,
        }
    }
}

impl std::fmt::Display for KeyType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            KeyType::Ed25519 => write!(f, "ed25519"),
            KeyType::Rsa => write!(f, "rsa"),
            KeyType::Ecdsa => write!(f, "ecdsa"),
            KeyType::Dsa => write!(f, "dsa"),
            KeyType::Unknown => write!(f, "unknown"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SSHKeyInfo {
    pub name: String,
    pub key_type: KeyType,
    pub has_public_key: bool,
    pub public_key_path: String,
    pub private_key_path: String,
    pub fingerprint: Option<String>,
    pub comment: Option<String>,
    pub bit_size: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyDetails {
    pub bit_size: u32,
    pub fingerprint: String,
    pub comment: String,
    pub key_type: KeyType,
}
