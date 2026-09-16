use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::{ChildStderr, ChildStdout};

use crate::model::{OutputStream, RunOutput};

pub(super) struct StreamOutput {
    text: String,
    error: Option<String>,
}

pub(super) async fn consume_stream<R>(
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

pub(super) async fn collect_output(
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

pub(super) fn record_error(target: &mut Option<String>, message: String) {
    if let Some(existing) = target {
        existing.push_str("; ");
        existing.push_str(&message);
    } else {
        *target = Some(message);
    }
}

pub(super) fn spawn_output_readers(
    app: &AppHandle,
    run_id: &str,
    stdout: Option<ChildStdout>,
    stderr: Option<ChildStderr>,
) -> (
    Option<tauri::async_runtime::JoinHandle<StreamOutput>>,
    Option<tauri::async_runtime::JoinHandle<StreamOutput>>,
) {
    let stdout_task = stdout.map(|stream| {
        let app = app.clone();
        let run_id = run_id.to_string();
        tauri::async_runtime::spawn(consume_stream(app, run_id, OutputStream::Stdout, stream))
    });
    let stderr_task = stderr.map(|stream| {
        let app = app.clone();
        let run_id = run_id.to_string();
        tauri::async_runtime::spawn(consume_stream(app, run_id, OutputStream::Stderr, stream))
    });
    (stdout_task, stderr_task)
}
