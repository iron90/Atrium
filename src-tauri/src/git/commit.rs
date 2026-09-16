use crate::model::GitCommit;

pub(super) fn parse_commit_records(raw: &str) -> Vec<GitCommit> {
    raw.split('\u{1e}')
        .filter_map(|record| {
            let fields: Vec<&str> = record.trim().split('\u{1f}').collect();
            if fields.len() != 5 {
                return None;
            }
            Some(GitCommit {
                sha: fields[0].to_string(),
                short_sha: fields[1].to_string(),
                author: fields[2].to_string(),
                timestamp: git_timestamp_millis(fields[3]),
                subject: fields[4].to_string(),
            })
        })
        .collect()
}

pub(super) fn git_timestamp_millis(value: &str) -> i64 {
    value
        .parse::<i64>()
        .unwrap_or_default()
        .saturating_mul(1_000)
}

#[cfg(test)]
mod tests {
    use super::git_timestamp_millis;

    #[test]
    fn converts_git_seconds_to_ui_milliseconds() {
        assert_eq!(git_timestamp_millis("1700000000"), 1_700_000_000_000);
    }
}
