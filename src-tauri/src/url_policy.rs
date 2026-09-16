use url::Url;

pub(crate) fn validate_browsable_url(value: &str) -> Result<(), String> {
    let value = value.trim();
    if value
        .chars()
        .any(|character| character.is_whitespace() || character.is_control())
    {
        return Err("must not contain whitespace or control characters".to_string());
    }
    let url = Url::parse(value).map_err(|_| "must be a valid absolute URL".to_string())?;

    if !matches!(url.scheme(), "http" | "https" | "file") {
        return Err("must use http://, https://, or file://".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("must not include embedded credentials".to_string());
    }
    match url.scheme() {
        "http" | "https" if url.host_str().is_none() => Err("must include a host name".to_string()),
        "file" if value.eq_ignore_ascii_case("file://") || url.path().is_empty() => {
            Err("must include a file path".to_string())
        }
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::validate_browsable_url;

    #[test]
    fn accepts_supported_absolute_urls() {
        assert!(validate_browsable_url("https://example.com/preview").is_ok());
        assert!(validate_browsable_url("http://127.0.0.1:3000").is_ok());
        assert!(validate_browsable_url("file:///tmp/preview.html").is_ok());
    }

    #[test]
    fn rejects_invalid_or_unsafe_urls() {
        for value in [
            "https://",
            "https://example.com/a path",
            "https://user:secret@example.com/private",
            "javascript:alert(1)",
            "file://",
        ] {
            assert!(
                validate_browsable_url(value).is_err(),
                "URL should be rejected: {value}"
            );
        }
    }
}
