use std::process::ExitStatus;

use futures_util::future::{select, Either};
use futures_util::pin_mut;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::{Child, ChildStderr, ChildStdout};
use tokio::sync::oneshot;

use crate::model::{OutputStream, RunFinished, RunOutput, RunStatus};
use crate::run_context::RunContext;

struct StreamOutput {
    text: String,
    error: Option<String>,
}

pub(crate) async fn supervise_process(
    app: AppHandle,
    context: RunContext,
    child: &mut Child,
    stdout: Option<ChildStdout>,
    stderr: Option<ChildStderr>,
    stop_rx: oneshot::Receiver<()>,
) -> RunFinished {
    let stdout_task = stdout.map(|stream| {
        let app = app.clone();
        let run_id = context.run_id().to_string();
        tauri::async_runtime::spawn(consume_stream(app, run_id, OutputStream::Stdout, stream))
    });
    let stderr_task = stderr.map(|stream| {
        let app = app.clone();
        let run_id = context.run_id().to_string();
        tauri::async_runtime::spawn(consume_stream(app, run_id, OutputStream::Stderr, stream))
    });

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
        match wait_result.expect("a process wait result is present") {
            Ok(status) => (Some(status), false),
            Err(error) => {
                record_error(
                    &mut supervision_error,
                    format!("Process wait failed: {error}"),
                );
                (None, false)
            }
        }
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
    let run_status = if cancelled {
        RunStatus::Cancelled
    } else if supervision_error.is_some() {
        RunStatus::Failed
    } else if status.as_ref().is_some_and(ExitStatus::success) {
        RunStatus::Succeeded
    } else {
        RunStatus::Failed
    };

    context.finished(
        run_status,
        status.and_then(|status| status.code()),
        stdout_text,
        stderr_text,
    )
}

async fn consume_stream<R>(
    app: AppHandle,
    run_id: String,
    stream: OutputStream,
    reader: R,
) -> StreamOutput
where
    R: AsyncRead + Unpin,
{
    let stream_name = match stream {
        OutputStream::Stdout => "stdout",
        OutputStream::Stderr => "stderr",
    };
    let mut lines = BufReader::new(reader).lines();
    let mut output = String::new();
    let mut stream_error = None;
    loop {
        match lines.next_line().await {
            Ok(Some(line)) => {
                output.push_str(&line);
                output.push('\n');
                if let Err(error) = app.emit(
                    "run-output",
                    RunOutput {
                        run_id: run_id.clone(),
                        stream: stream.clone(),
                        line,
                    },
                ) {
                    if stream_error.is_none() {
                        stream_error = Some(format!("Cannot emit {stream_name} output: {error}"));
                    }
                }
            }
            Ok(None) => break,
            Err(error) => {
                stream_error = Some(format!("Cannot read {stream_name} output: {error}"));
                break;
            }
        }
    }
    StreamOutput {
        text: output,
        error: stream_error,
    }
}

async fn collect_output(
    task: Option<tauri::async_runtime::JoinHandle<StreamOutput>>,
    supervision_error: &mut Option<String>,
) -> String {
    match task {
        Some(task) => match task.await {
            Ok(output) => {
                if let Some(error) = output.error {
                    record_error(supervision_error, error);
                }
                output.text
            }
            Err(error) => {
                record_error(
                    supervision_error,
                    format!("Output reader task failed: {error}"),
                );
                String::new()
            }
        },
        None => String::new(),
    }
}

fn record_error(target: &mut Option<String>, message: String) {
    if let Some(existing) = target {
        existing.push_str("; ");
        existing.push_str(&message);
    } else {
        *target = Some(message);
    }
}
