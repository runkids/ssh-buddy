use crate::models::{KeyDetails, KeyType, SSHKeyInfo, SshBuddyError, SshResult};
use crate::utils::validate_key_name;
use rand::rngs::OsRng;
use serde::Deserialize;
use ssh_key::{Algorithm, LineEnding, PrivateKey, PublicKey};
use std::path::PathBuf;
use tokio::fs;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

/// 密鑰生成選項
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateKeyOptions {
    pub name: String,
    pub key_type: String, // "ed25519" | "rsa"
    pub comment: Option<String>,
    pub passphrase: Option<String>,
}

/// SSH 密鑰管理服務
pub struct KeyManager {
    ssh_dir: PathBuf,
}

impl KeyManager {
    /// 建立新的 KeyManager 實例
    pub fn new() -> SshResult<Self> {
        let home = dirs::home_dir().ok_or(SshBuddyError::HomeDirNotFound)?;
        let ssh_dir = home.join(".ssh");
        Ok(Self { ssh_dir })
    }

    /// 取得 SSH 目錄路徑
    pub fn ssh_dir(&self) -> &PathBuf {
        &self.ssh_dir
    }

    /// 列出所有 SSH 密鑰
    pub async fn list_keys(&self) -> SshResult<Vec<SSHKeyInfo>> {
        let mut keys = Vec::new();

        // 確保 SSH 目錄存在
        if !self.ssh_dir.exists() {
            return Ok(keys);
        }

        let mut entries = fs::read_dir(&self.ssh_dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();

            // 只處理 .pub 檔案
            if path.extension().map_or(false, |ext| ext == "pub") {
                if let Some(key_info) = self.parse_public_key_file(&path).await {
                    keys.push(key_info);
                }
            }
        }

        // 按名稱排序
        keys.sort_by(|a, b| a.name.cmp(&b.name));

        Ok(keys)
    }

    /// 解析公鑰檔案並建立 SSHKeyInfo
    async fn parse_public_key_file(&self, pub_key_path: &PathBuf) -> Option<SSHKeyInfo> {
        let file_name = pub_key_path.file_stem()?.to_str()?;
        let private_key_path = self.ssh_dir.join(file_name);

        // 讀取公鑰內容
        let pub_key_content = fs::read_to_string(pub_key_path).await.ok()?;

        // 解析公鑰
        let (key_type, fingerprint, comment, bit_size) =
            match PublicKey::from_openssh(&pub_key_content) {
                Ok(pub_key) => {
                    let key_type = KeyType::from(pub_key.algorithm().as_str());
                    let fingerprint = pub_key.fingerprint(ssh_key::HashAlg::Sha256).to_string();
                    let comment = pub_key.comment().to_string();
                    let bit_size = self.get_key_bit_size(&pub_key);
                    (key_type, Some(fingerprint), Some(comment), bit_size)
                }
                Err(_) => {
                    // 無法解析，嘗試從檔案名稱推斷類型
                    let key_type = self.infer_key_type_from_name(file_name);
                    (key_type, None, None, None)
                }
            };

        Some(SSHKeyInfo {
            name: file_name.to_string(),
            key_type,
            has_public_key: true,
            public_key_path: pub_key_path.to_string_lossy().to_string(),
            private_key_path: private_key_path.to_string_lossy().to_string(),
            fingerprint,
            comment,
            bit_size,
        })
    }

    /// 從公鑰取得 bit size
    fn get_key_bit_size(&self, pub_key: &PublicKey) -> Option<u32> {
        match pub_key.key_data() {
            ssh_key::public::KeyData::Rsa(rsa) => {
                // RSA 密鑰的 bit size 是 modulus 的位數
                Some((rsa.n.as_bytes().len() * 8) as u32)
            }
            ssh_key::public::KeyData::Ed25519(_) => Some(256),
            ssh_key::public::KeyData::Ecdsa(ecdsa) => {
                // ECDSA 密鑰的 bit size 取決於曲線
                match ecdsa.curve() {
                    ssh_key::EcdsaCurve::NistP256 => Some(256),
                    ssh_key::EcdsaCurve::NistP384 => Some(384),
                    ssh_key::EcdsaCurve::NistP521 => Some(521),
                }
            }
            _ => None,
        }
    }

    /// 從檔案名稱推斷密鑰類型
    fn infer_key_type_from_name(&self, name: &str) -> KeyType {
        let name_lower = name.to_lowercase();
        if name_lower.contains("ed25519") {
            KeyType::Ed25519
        } else if name_lower.contains("ecdsa") {
            KeyType::Ecdsa
        } else if name_lower.contains("dsa") {
            KeyType::Dsa
        } else if name_lower.contains("rsa") {
            KeyType::Rsa
        } else {
            KeyType::Unknown
        }
    }

    /// 讀取公鑰內容
    pub async fn read_public_key(&self, key_name: &str) -> SshResult<String> {
        // 驗證密鑰名稱，防止路徑遍歷
        validate_key_name(key_name)?;

        let pub_key_path = self.ssh_dir.join(format!("{}.pub", key_name));

        if !pub_key_path.exists() {
            return Err(SshBuddyError::KeyNotFound {
                path: pub_key_path.to_string_lossy().to_string(),
            });
        }

        let content = fs::read_to_string(&pub_key_path).await?;
        Ok(content.trim().to_string())
    }

    /// 取得密鑰詳細資訊
    pub async fn get_key_details(&self, key_path: &str) -> SshResult<KeyDetails> {
        let path = PathBuf::from(key_path);

        // 確保路徑在 SSH 目錄內
        let canonical_path = path.canonicalize().map_err(|_| SshBuddyError::KeyNotFound {
            path: key_path.to_string(),
        })?;

        let canonical_ssh_dir = self
            .ssh_dir
            .canonicalize()
            .map_err(|_| SshBuddyError::HomeDirNotFound)?;

        if !canonical_path.starts_with(&canonical_ssh_dir) {
            return Err(SshBuddyError::PathTraversalDetected {
                path: key_path.to_string(),
            });
        }

        // 讀取公鑰
        let content = fs::read_to_string(&path).await.map_err(|_| {
            SshBuddyError::KeyNotFound {
                path: key_path.to_string(),
            }
        })?;

        // 解析公鑰
        let pub_key = PublicKey::from_openssh(&content)?;

        let key_type = KeyType::from(pub_key.algorithm().as_str());
        let fingerprint = pub_key.fingerprint(ssh_key::HashAlg::Sha256).to_string();
        let comment = pub_key.comment().to_string();
        let bit_size = self.get_key_bit_size(&pub_key).unwrap_or(0);

        Ok(KeyDetails {
            bit_size,
            fingerprint,
            comment,
            key_type,
        })
    }

    /// 生成新的 SSH 密鑰對
    pub async fn generate_key(&self, options: GenerateKeyOptions) -> SshResult<SSHKeyInfo> {
        // 驗證密鑰名稱
        validate_key_name(&options.name)?;

        let private_key_path = self.ssh_dir.join(&options.name);
        let public_key_path = self.ssh_dir.join(format!("{}.pub", &options.name));

        // 檢查是否已存在
        if private_key_path.exists() || public_key_path.exists() {
            return Err(SshBuddyError::KeyAlreadyExists {
                name: options.name.clone(),
            });
        }

        // 確保 SSH 目錄存在
        if !self.ssh_dir.exists() {
            fs::create_dir_all(&self.ssh_dir).await?;
            #[cfg(unix)]
            {
                let perms = std::fs::Permissions::from_mode(0o700);
                fs::set_permissions(&self.ssh_dir, perms).await?;
            }
        }

        // 生成私鑰
        let private_key = match options.key_type.to_lowercase().as_str() {
            "ed25519" => {
                PrivateKey::random(&mut OsRng, Algorithm::Ed25519).map_err(|e| {
                    SshBuddyError::Unknown {
                        message: format!("Failed to generate Ed25519 key: {}", e),
                    }
                })?
            }
            "rsa" => {
                // 使用 rsa crate 生成 4096-bit RSA 密鑰，然後轉換為 ssh-key 格式
                use rsa::RsaPrivateKey;
                use ssh_key::private::RsaKeypair;

                let rsa_private = RsaPrivateKey::new(&mut OsRng, 4096).map_err(|e| {
                    SshBuddyError::Unknown {
                        message: format!("Failed to generate RSA key: {}", e),
                    }
                })?;

                // 轉換為 ssh-key 的 RsaKeypair
                let rsa_keypair = RsaKeypair::try_from(rsa_private).map_err(|e| {
                    SshBuddyError::Unknown {
                        message: format!("Failed to convert RSA key: {}", e),
                    }
                })?;

                PrivateKey::from(rsa_keypair)
            }
            _ => {
                return Err(SshBuddyError::InvalidKeyFormat {
                    message: format!("Unsupported key type: {}", options.key_type),
                })
            }
        };

        // 設定 comment
        let comment = options.comment.as_deref().unwrap_or("");

        // 序列化私鑰（可選加密）
        let private_key_pem = if let Some(passphrase) = &options.passphrase {
            if !passphrase.is_empty() {
                private_key
                    .encrypt(&mut OsRng, passphrase)
                    .map_err(|e| SshBuddyError::Unknown {
                        message: format!("Failed to encrypt key: {}", e),
                    })?
                    .to_openssh(LineEnding::LF)
                    .map_err(|e| SshBuddyError::Unknown {
                        message: format!("Failed to serialize encrypted key: {}", e),
                    })?
            } else {
                private_key
                    .to_openssh(LineEnding::LF)
                    .map_err(|e| SshBuddyError::Unknown {
                        message: format!("Failed to serialize key: {}", e),
                    })?
            }
        } else {
            private_key
                .to_openssh(LineEnding::LF)
                .map_err(|e| SshBuddyError::Unknown {
                    message: format!("Failed to serialize key: {}", e),
                })?
        };

        // 序列化公鑰
        let public_key = private_key.public_key();
        let public_key_openssh = public_key.to_openssh().map_err(|e| SshBuddyError::Unknown {
            message: format!("Failed to serialize public key: {}", e),
        })?;

        // 公鑰格式：<algorithm> <base64> <comment>
        let public_key_content = if comment.is_empty() {
            public_key_openssh
        } else {
            format!("{} {}", public_key_openssh.trim(), comment)
        };

        // 寫入私鑰
        fs::write(&private_key_path, private_key_pem.as_bytes()).await?;

        // 設定私鑰權限為 600
        #[cfg(unix)]
        {
            let perms = std::fs::Permissions::from_mode(0o600);
            fs::set_permissions(&private_key_path, perms).await?;
        }

        // 寫入公鑰
        fs::write(&public_key_path, format!("{}\n", public_key_content)).await?;

        // 設定公鑰權限為 644
        #[cfg(unix)]
        {
            let perms = std::fs::Permissions::from_mode(0o644);
            fs::set_permissions(&public_key_path, perms).await?;
        }

        // 取得密鑰資訊
        let key_type = KeyType::from(public_key.algorithm().as_str());
        let fingerprint = public_key.fingerprint(ssh_key::HashAlg::Sha256).to_string();
        let bit_size = self.get_key_bit_size(&public_key);

        log::info!(
            "[key_manager] Generated {} key: {}",
            options.key_type,
            options.name
        );

        Ok(SSHKeyInfo {
            name: options.name,
            key_type,
            has_public_key: true,
            public_key_path: public_key_path.to_string_lossy().to_string(),
            private_key_path: private_key_path.to_string_lossy().to_string(),
            fingerprint: Some(fingerprint),
            comment: if comment.is_empty() {
                None
            } else {
                Some(comment.to_string())
            },
            bit_size,
        })
    }

    /// 刪除 SSH 密鑰對
    pub async fn delete_key(&self, key_name: &str) -> SshResult<()> {
        // 驗證密鑰名稱
        validate_key_name(key_name)?;

        let private_key_path = self.ssh_dir.join(key_name);
        let public_key_path = self.ssh_dir.join(format!("{}.pub", key_name));

        let mut deleted = false;

        // 刪除私鑰
        if private_key_path.exists() {
            fs::remove_file(&private_key_path).await?;
            deleted = true;
            log::info!("[key_manager] Deleted private key: {}", key_name);
        }

        // 刪除公鑰
        if public_key_path.exists() {
            fs::remove_file(&public_key_path).await?;
            deleted = true;
            log::info!("[key_manager] Deleted public key: {}.pub", key_name);
        }

        if !deleted {
            return Err(SshBuddyError::KeyNotFound {
                path: key_name.to_string(),
            });
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_infer_key_type() {
        let manager = KeyManager {
            ssh_dir: PathBuf::from("/tmp/.ssh"),
        };

        assert_eq!(
            manager.infer_key_type_from_name("id_ed25519"),
            KeyType::Ed25519
        );
        assert_eq!(manager.infer_key_type_from_name("id_rsa"), KeyType::Rsa);
        assert_eq!(
            manager.infer_key_type_from_name("id_ecdsa"),
            KeyType::Ecdsa
        );
        assert_eq!(manager.infer_key_type_from_name("my_key"), KeyType::Unknown);
    }
}
