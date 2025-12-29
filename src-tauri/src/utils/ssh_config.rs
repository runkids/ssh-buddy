use std::collections::HashMap;
use std::path::PathBuf;

/// SSH Host configuration
#[derive(Debug, Clone, Default)]
pub struct HostConfig {
    /// Host alias pattern
    pub host_pattern: String,
    /// Actual hostname
    pub hostname: Option<String>,
    /// Port number
    pub port: Option<u16>,
    /// Username
    pub user: Option<String>,
    /// Identity file path
    pub identity_file: Option<PathBuf>,
    /// Other options
    pub options: HashMap<String, String>,
}

impl HostConfig {
    /// Get actual hostname (falls back to host pattern if not set)
    pub fn get_hostname(&self) -> &str {
        self.hostname.as_deref().unwrap_or(&self.host_pattern)
    }

    /// Get port number (defaults to 22)
    pub fn get_port(&self) -> u16 {
        self.port.unwrap_or(22)
    }

    /// Get username
    pub fn get_user(&self) -> Option<&str> {
        self.user.as_deref()
    }
}

/// SSH Config parser
pub struct SshConfigParser;

impl SshConfigParser {
    /// Parse SSH config file content
    pub fn parse(content: &str) -> Vec<HostConfig> {
        let mut hosts = Vec::new();
        let mut current_host: Option<HostConfig> = None;

        for line in content.lines() {
            let line = line.trim();

            // Skip empty lines and comments
            if line.is_empty() || line.starts_with('#') {
                continue;
            }

            // Parse key = value or key value format
            let (key, value) = if let Some((k, v)) = line.split_once('=') {
                (k.trim().to_lowercase(), v.trim().to_string())
            } else if let Some((k, v)) = line.split_once(char::is_whitespace) {
                (k.trim().to_lowercase(), v.trim().to_string())
            } else {
                continue;
            };

            match key.as_str() {
                "host" => {
                    // Save previous host
                    if let Some(host) = current_host.take() {
                        hosts.push(host);
                    }
                    // Start new host
                    current_host = Some(HostConfig {
                        host_pattern: value,
                        ..Default::default()
                    });
                }
                "hostname" => {
                    if let Some(ref mut host) = current_host {
                        host.hostname = Some(value);
                    }
                }
                "port" => {
                    if let Some(ref mut host) = current_host {
                        host.port = value.parse().ok();
                    }
                }
                "user" => {
                    if let Some(ref mut host) = current_host {
                        host.user = Some(value);
                    }
                }
                "identityfile" => {
                    if let Some(ref mut host) = current_host {
                        // Expand ~ to home directory
                        let path = if value.starts_with("~/") {
                            if let Some(home) = dirs::home_dir() {
                                home.join(&value[2..])
                            } else {
                                PathBuf::from(&value)
                            }
                        } else {
                            PathBuf::from(&value)
                        };
                        host.identity_file = Some(path);
                    }
                }
                _ => {
                    // Store other options
                    if let Some(ref mut host) = current_host {
                        host.options.insert(key, value);
                    }
                }
            }
        }

        // Save the last host
        if let Some(host) = current_host {
            hosts.push(host);
        }

        hosts
    }

    /// Find host configuration by alias
    #[allow(dead_code)]
    pub fn find_host<'a>(hosts: &'a [HostConfig], alias: &str) -> Option<&'a HostConfig> {
        hosts.iter().find(|h| Self::match_pattern(&h.host_pattern, alias))
    }

    /// Match host pattern (supports * wildcard)
    fn match_pattern(pattern: &str, alias: &str) -> bool {
        if pattern == "*" {
            return true;
        }

        if pattern.contains('*') {
            // Simple wildcard matching
            let parts: Vec<&str> = pattern.split('*').collect();
            if parts.len() == 2 {
                let prefix = parts[0];
                let suffix = parts[1];
                return alias.starts_with(prefix) && alias.ends_with(suffix);
            }
        }

        pattern == alias
    }

    /// Merge multiple host configurations (for handling Host * and other global configs)
    pub fn merge_configs(hosts: &[HostConfig], alias: &str) -> HostConfig {
        let mut merged = HostConfig {
            host_pattern: alias.to_string(),
            ..Default::default()
        };

        // Apply matching configs in order (later ones override earlier ones)
        for host in hosts {
            if Self::match_pattern(&host.host_pattern, alias) {
                if host.hostname.is_some() {
                    merged.hostname = host.hostname.clone();
                }
                if host.port.is_some() {
                    merged.port = host.port;
                }
                if host.user.is_some() {
                    merged.user = host.user.clone();
                }
                if host.identity_file.is_some() {
                    merged.identity_file = host.identity_file.clone();
                }
                for (k, v) in &host.options {
                    merged.options.insert(k.clone(), v.clone());
                }
            }
        }

        merged
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_basic_config() {
        let config = r#"
Host github
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519

Host bitbucket
    HostName bitbucket.org
    User git
    Port 22
"#;

        let hosts = SshConfigParser::parse(config);
        assert_eq!(hosts.len(), 2);

        let github = &hosts[0];
        assert_eq!(github.host_pattern, "github");
        assert_eq!(github.hostname.as_deref(), Some("github.com"));
        assert_eq!(github.user.as_deref(), Some("git"));
    }

    #[test]
    fn test_find_host() {
        let config = r#"
Host github
    HostName github.com
"#;
        let hosts = SshConfigParser::parse(config);
        let found = SshConfigParser::find_host(&hosts, "github");
        assert!(found.is_some());
        assert_eq!(found.unwrap().get_hostname(), "github.com");
    }

    #[test]
    fn test_wildcard_pattern() {
        assert!(SshConfigParser::match_pattern("*", "anything"));
        assert!(SshConfigParser::match_pattern("*.example.com", "test.example.com"));
        assert!(!SshConfigParser::match_pattern("*.example.com", "test.other.com"));
    }
}
