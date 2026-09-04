//! Turn-failure dedup keys shared across SessionFailure / Error / TurnComplete.

/// Stable fingerprint for the same underlying network fault.
pub fn error_fingerprint(text: &str) -> String {
    let normalized: String = text
        .chars()
        .filter(|c| !c.is_whitespace())
        .take(160)
        .collect::<String>()
        .to_ascii_lowercase();
    if normalized.len() <= 64 {
        normalized
    } else {
        format!("{:x}", fnv1a_hash(normalized.as_bytes()))
    }
}

pub fn turn_failure_dedup_key(
    conversation_id: i32,
    turn_session_id: &str,
    failure_record_id: Option<&str>,
    text: &str,
) -> String {
    let fp = error_fingerprint(text);
    match failure_record_id {
        Some(id) => format!("tf:{conversation_id}:{turn_session_id}:{id}:{fp}"),
        None => format!("tf:{conversation_id}:{turn_session_id}:{fp}"),
    }
}

fn fnv1a_hash(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in bytes {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_tls_text_produces_same_fingerprint() {
        let a = error_fingerprint("RetriableError: TLS handshake failed");
        let b = error_fingerprint("RetriableError:  TLS\nhandshake failed");
        assert_eq!(a, b);
    }

    #[test]
    fn dedup_key_includes_conversation_turn_and_record() {
        let key = turn_failure_dedup_key(42, "sess-1", Some("fail-9"), "TLS error");
        assert!(key.starts_with("tf:42:sess-1:fail-9:"));
    }
}
