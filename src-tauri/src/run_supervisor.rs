use std::process::ExitStatus;

use futures_util::future::{select, Either};
use futures_util::pin_mut;
use tauri::AppHandle;
use tokio::process::Child;
use tokio::sync::oneshot;

use crate::model::RunFinished;
use crate::run_context::RunContext;

mod outcome;
mod output;

use self::outcome::{status_for, ProcessOutcome};
use self::output::{collect_output, record_error, spawn_output_readers};

pub(crate) async fn supervise_process(
    app: AppHandle,
    context: RunContext,
    child: &mut Child,
    stdout: Option<tokio::process::ChildStdout>,
    stderr: Option<tokio::process::ChildStderr>,
    stop_rx: oneshot::Receiver<()>,
) -> RunFinished {
    let (stdout_task, stderr_task) = spawn_output_readers(&app, context.run_id(), stdout, stderr);

    let mut supervision_error = None;
    let (wait_result, cancellation_requested) = {
        let wait_future = child.wait();
        pin_mut!(wait_future);
        pin_mut!(stop_rx);
        match select(wait_future, stop_rx).await {
            Either::Left((result, _)) => (Some(result), false),
            Either::Right((_, _)) => (None, true),
        }
    };
    let (status, cancelled) = if cancellation_requested {
        let status = match child.kill().await {
            Ok(()) => match child.wait().await {
                Ok(status) => Some(status),
                Err(error) => {
                    record_error(
                        &mut supervision_error,
                        format!("Process wait after cancellation failed: {error}"),
                    );
                    None
                }
            },
            Err(kill_error) => match child.try_wait() {
                Ok(Some(status)) => Some(status),
                Ok(None) => {
                    record_error(
                        &mut supervision_error,
                        format!("Process cancellation failed: {kill_error}"),
                    );
                    None
                }
                Err(wait_error) => {
                    record_error(
                        &mut supervision_error,
                        format!(
                            "Process cancellation failed: {kill_error}; follow-up wait failed: {wait_error}"
                        ),
                    );
                    None
                }
            },
        };
        (status, true)
    } else {
        let status = match wait_result {
            Some(Ok(status)) => Some(status),
            Some(Err(error)) => {
                record_error(
                    &mut supervision_error,
                    format!("Process wait failed: {error}"),
                );
                None
            }
            None => {
                record_error(
                    &mut supervision_error,
                    "Process wait result was unavailable".to_string(),
                );
                None
            }
        };
        (status, false)
    };

    let stdout_text = collect_output(stdout_task, &mut supervision_error).await;
    let stderr_text = collect_output(stderr_task, &mut supervision_error).await;
    let stderr_text = match supervision_error.as_ref() {
        Some(error) => {
            if stderr_text.is_empty() {
                format!("Atrium supervisor error: {error}\n")
            } else {
                format!("{stderr_text}\nAtrium supervisor error: {error}\n")
            }
        }
        None => stderr_text,
    };
    let process_outcome = ProcessOutcome {
        cancelled,
        succeeded: status.as_ref().is_some_and(ExitStatus::success),
        exit_code: status.as_ref().and_then(ExitStatus::code),
    };
    let run_status = status_for(process_outcome, supervision_error.is_some());

    context.finished(
        run_status,
        process_outcome.exit_code,
        stdout_text,
        stderr_text,
    )
}
