use crate::model::RunStatus;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct ProcessOutcome {
    pub(super) cancelled: bool,
    pub(super) succeeded: bool,
    pub(super) exit_code: Option<i32>,
}

pub(super) fn status_for(outcome: ProcessOutcome, has_supervision_error: bool) -> RunStatus {
    if outcome.cancelled {
        RunStatus::Cancelled
    } else if has_supervision_error || !outcome.succeeded {
        RunStatus::Failed
    } else {
        RunStatus::Succeeded
    }
}

#[cfg(test)]
mod tests {
    use super::{status_for, ProcessOutcome};
    use crate::model::RunStatus;

    #[test]
    fn cancellation_takes_precedence_over_other_outcomes() {
        let outcome = ProcessOutcome {
            cancelled: true,
            succeeded: true,
            exit_code: Some(0),
        };

        assert_eq!(status_for(outcome, true), RunStatus::Cancelled);
    }

    #[test]
    fn supervision_errors_fail_an_exit_that_would_otherwise_succeed() {
        let outcome = ProcessOutcome {
            cancelled: false,
            succeeded: true,
            exit_code: Some(0),
        };

        assert_eq!(status_for(outcome, true), RunStatus::Failed);
    }

    #[test]
    fn successful_exit_is_succeeded() {
        let outcome = ProcessOutcome {
            cancelled: false,
            succeeded: true,
            exit_code: Some(0),
        };

        assert_eq!(status_for(outcome, false), RunStatus::Succeeded);
    }

    #[test]
    fn unsuccessful_exit_is_failed() {
        let outcome = ProcessOutcome {
            cancelled: false,
            succeeded: false,
            exit_code: Some(1),
        };

        assert_eq!(status_for(outcome, false), RunStatus::Failed);
    }
}
