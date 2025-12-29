//! Common test utilities and helpers

use std::path::{Path, PathBuf};
use tempfile::TempDir;

/// Get the fixtures directory path
pub fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
}

/// Get a specific fixture file path
pub fn fixture_path(relative_path: &str) -> PathBuf {
    fixtures_dir().join(relative_path)
}

/// Read fixture file content
pub fn read_fixture(relative_path: &str) -> String {
    std::fs::read_to_string(fixture_path(relative_path)).expect("Failed to read fixture file")
}

/// Create a temporary directory with a mock .ssh structure
pub struct MockSshDir {
    pub temp_dir: TempDir,
    pub ssh_dir: PathBuf,
}

impl MockSshDir {
    pub fn new() -> Self {
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let ssh_dir = temp_dir.path().join(".ssh");
        std::fs::create_dir_all(&ssh_dir).expect("Failed to create .ssh dir");
        Self { temp_dir, ssh_dir }
    }

    pub fn path(&self) -> &Path {
        &self.ssh_dir
    }

    pub fn write_file(&self, name: &str, content: &str) -> PathBuf {
        let path = self.ssh_dir.join(name);
        std::fs::write(&path, content).expect("Failed to write file");
        path
    }

    pub fn write_known_hosts(&self, content: &str) -> PathBuf {
        self.write_file("known_hosts", content)
    }
}

/// Sample known_hosts content for testing
pub const SAMPLE_KNOWN_HOSTS: &str = r#"github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl
gitlab.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAfuCHKVTjquxvt6CM6tdG4SLp1Btn/nOeHHE5UOzRdf
[example.com]:2222 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBbfLEjxQsxoGSqjKr3fYsL3MzN2fJqXNqjZzjBjwMv9
"#;

/// Sample unencrypted Ed25519 private key for testing
pub const SAMPLE_UNENCRYPTED_ED25519_KEY: &str = r#"-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACBZVzkJN+LZy3uIE1U4VW6EZfPYJeLAvcDXMPj7RqdTJAAAAJBAAAAAAAAAAA
AAAAtzc2gtZWQyNTUxOQAAACBZVzkJN+LZy3uIE1U4VW6EZfPYJeLAvcDXMPj7RqdTJAAA
AEBuxpPc0c+TFY4a3C4yg0l8s4axW9DdXdHuG9YpELVx2FlXOQk34tnLe4gTVThVboRl89
gl4sC9wNcw+PtGp1MkAAAADHRlc3RAZXhhbXBsZQE=
-----END OPENSSH PRIVATE KEY-----"#;

/// Sample encrypted Ed25519 private key for testing (passphrase: "test123")
pub const SAMPLE_ENCRYPTED_ED25519_KEY: &str = r#"-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAACmFlczI1Ni1jdHIAAAAGYmNyeXB0AAAAGAAAABCz7sB8Xy
ZFbpgxp3Rl+YPCAAAAEAAAAAEAAAAzAAAAC3NzaC1lZDI1NTE5AAAAIJdXFUzuH3JQTQRS
JK3e2hVJ3NrFxZbSNKMqL5+2j8VoAAAAkC1xhRv3VxY8f7t0JV9fKqyDZ4p5fK3xJ8k3dM
FqY9d5HqNW9RxZVn5JhqzYWk8J2xZ3X4nF8vQ0qK9pLmT2xRb4YnM3Kw2pQ5dH8zC3gXvB
mN0K4J9xP7R6qT2fS5hYkZ3L8nM2wX6vR0cQeKdH4zB7gXjF3K9wP8R5qT1fS4hYkZ2L7n
M1wX5vR0cQeKdH4zA=
-----END OPENSSH PRIVATE KEY-----"#;

/// Sample public key for testing
pub const SAMPLE_ED25519_PUBLIC_KEY: &str =
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFlXOQk34tnLe4gTVThVboRl89gl4sC9wNcw+PtGp1Mk test@example";
