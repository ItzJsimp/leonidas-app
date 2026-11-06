//! Groq key storage. The key lives in the OS credential store, never in a file or a log.
//! `GROQ_API_KEY` in the environment overrides the store (dev and CI).

use std::sync::Mutex;

pub trait KeyStore: Send + Sync {
    fn get(&self) -> Option<String>;
    fn set(&self, key: &str) -> Result<(), String>;
    fn delete(&self) -> Result<(), String>;
}

/// In-memory store for tests.
#[derive(Default)]
pub struct MemoryKeyStore(Mutex<Option<String>>);

impl KeyStore for MemoryKeyStore {
    fn get(&self) -> Option<String> {
        self.0.lock().unwrap().clone()
    }
    fn set(&self, key: &str) -> Result<(), String> {
        *self.0.lock().unwrap() = Some(key.to_owned());
        Ok(())
    }
    fn delete(&self) -> Result<(), String> {
        *self.0.lock().unwrap() = None;
        Ok(())
    }
}

/// OS credential store (Windows Credential Manager, macOS Keychain).
pub struct OsKeyStore(keyring::Entry);

impl OsKeyStore {
    pub fn new() -> Result<Self, String> {
        // Entry::new initializes the platform store once through keyring's LazyLock.
        Self::with_service("leonidas-scribe")
    }

    /// Another provider's key, for example `deepgram` or `gemini`.
    pub fn for_account(account: &str) -> Result<Self, String> {
        keyring::Entry::new("leonidas-scribe", account)
            .map(Self)
            .map_err(|_| "Cannot open the credential store".into())
    }

    fn with_service(service: &str) -> Result<Self, String> {
        keyring::Entry::new(service, "groq")
            .map(Self)
            .map_err(|_| "Cannot open the credential store".into())
    }
}

impl KeyStore for OsKeyStore {
    fn get(&self) -> Option<String> {
        self.0.get_password().ok()
    }
    fn set(&self, key: &str) -> Result<(), String> {
        let key = key.trim();
        if key.is_empty() {
            return Err("The key is empty".into());
        }
        self.0
            .set_password(key)
            .map_err(|_| "Cannot save the key".into())
    }
    fn delete(&self) -> Result<(), String> {
        match self.0.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("Cannot delete the key".into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "Uses the real OS credential store with a separate test service"]
    fn os_store_round_trip() {
        let service = format!("leonidas-scribe-test-{}", std::process::id());
        let store = OsKeyStore::with_service(&service).unwrap();
        store.delete().unwrap();
        assert_eq!(store.get(), None);
        assert!(store.set(" \t\n").is_err());
        store.set("  scribe-test-value  ").unwrap();
        let value = store.get();
        let deletion = store.delete();
        assert_eq!(value.as_deref(), Some("scribe-test-value"));
        deletion.unwrap();
        assert_eq!(store.get(), None);
        store.delete().unwrap();
    }
}
