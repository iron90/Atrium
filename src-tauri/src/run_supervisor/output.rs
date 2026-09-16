use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::{ChildStderr, ChildStdout};

use crate::model::{OutputStream, RunOutput};

const READ_BUFFER_SIZE: usize = 8 * 1024;
const MAX_CAPTURED_LINE_BYTES: usize = 16 * 1024;
const MAX_CAPTURED_OUTPUT_BYTES: usize = 256 * 1024;
const LINE_TRUNCATION_SUFFIX: &str = " … [line truncated]";
const OUTPUT_TRUNCATION_LINE: &str = "[output truncated by Atrium after 256 KiB]";
const OUTPUT_TRUNCATION_MARKER: &str = "[output truncated by Atrium after 256 KiB]\n";

pub(super) struct StreamOutput {
    text: String,
    error: Option<String>,
}

#[derive(Default)]
struct LineBuffer {
    bytes: Vec<u8>,
    truncated: bool,
}

impl LineBuffer {
    fn push_byte(&mut self, byte: u8) -> Option<String> {
        if byte == b'\n' {
            return self.finish();
        }

        if self.bytes.len() < MAX_CAPTURED_LINE_BYTES {
            self.bytes.push(byte);
        } else {
            self.truncated = true;
        }
        None
    }

    fn finish(&mut self) -> Option<String> {
        if self.bytes.is_empty() && !self.truncated {
            return None;
        }

        if self.bytes.last() == Some(&b'\r') {
            self.bytes.pop();
        }

        let mut line = String::from_utf8_lossy(&self.bytes).into_owned();
        if self.truncated {
            line.push_str(LINE_TRUNCATION_SUFFIX);
        }

        self.bytes.clear();
        self.truncated = false;
        Some(line)
    }
}

#[derive(Default)]
struct OutputCapture {
    text: String,
    truncated: bool,
}

impl OutputCapture {
    fn push_line(&mut self, line: &str) -> Option<String> {
        if self.truncated {
            return None;
        }

        let content_limit = MAX_CAPTURED_OUTPUT_BYTES - OUTPUT_TRUNCATION_MARKER.len();
        if self.text.len() + line.len() < content_limit {
            self.text.push_str(line);
            self.text.push('\n');
            Some(line.to_string())
        } else {
            self.text.push_str(OUTPUT_TRUNCATION_MARKER);
            self.truncated = true;
            Some(OUTPUT_TRUNCATION_LINE.to_string())
        }
    }
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
    let mut reader = reader;
    let mut bytes = [0; READ_BUFFER_SIZE];
    let mut line_buffer = LineBuffer::default();
    let mut capture = OutputCapture::default();
    let mut stream_error = None;
    loop {
        match reader.read(&mut bytes).await {
            Ok(0) => {
                emit_line(
                    &app,
                    &run_id,
                    &stream,
                    stream_name,
                    line_buffer.finish(),
                    &mut capture,
                    &mut stream_error,
                );
                break;
            }
            Ok(length) => {
                for byte in &bytes[..length] {
                    emit_line(
                        &app,
                        &run_id,
                        &stream,
                        stream_name,
                        line_buffer.push_byte(*byte),
                        &mut capture,
                        &mut stream_error,
                    );
                }
            }
            Err(error) => {
                emit_line(
                    &app,
                    &run_id,
                    &stream,
                    stream_name,
                    line_buffer.finish(),
                    &mut capture,
                    &mut stream_error,
                );
                if stream_error.is_none() {
                    stream_error = Some(format!("Cannot read {stream_name} output: {error}"));
                }
                break;
            }
        }
    }
    StreamOutput {
        text: capture.text,
        error: stream_error,
    }
}

fn emit_line(
    app: &AppHandle,
    run_id: &str,
    stream: &OutputStream,
    stream_name: &str,
    line: Option<String>,
    capture: &mut OutputCapture,
    stream_error: &mut Option<String>,
) {
    let Some(line) = line else {
        return;
    };
    let Some(line) = capture.push_line(&line) else {
        return;
    };

    if let Err(error) = app.emit(
        "run-output",
        RunOutput {
            run_id: run_id.to_string(),
            stream: stream.clone(),
            line,
        },
    ) {
        if stream_error.is_none() {
            *stream_error = Some(format!("Cannot emit {stream_name} output: {error}"));
        }
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

#[cfg(test)]
mod tests {
    use super::{
        LineBuffer, OutputCapture, LINE_TRUNCATION_SUFFIX, MAX_CAPTURED_LINE_BYTES,
        MAX_CAPTURED_OUTPUT_BYTES, OUTPUT_TRUNCATION_LINE, OUTPUT_TRUNCATION_MARKER,
    };

    #[test]
    fn line_buffer_bounds_unterminated_lines() {
        let mut buffer = LineBuffer::default();
        for _ in 0..(MAX_CAPTURED_LINE_BYTES + 1_024) {
            assert!(buffer.push_byte(b'x').is_none());
        }

        let line = buffer
            .finish()
            .expect("unterminated line should be returned");

        assert!(line.len() <= MAX_CAPTURED_LINE_BYTES + LINE_TRUNCATION_SUFFIX.len());
        assert!(line.ends_with(LINE_TRUNCATION_SUFFIX));
    }

    #[test]
    fn line_buffer_preserves_line_boundaries_and_crlf_behavior() {
        let mut buffer = LineBuffer::default();

        assert!(buffer.push_byte(b'o').is_none());
        assert!(buffer.push_byte(b'k').is_none());
        assert_eq!(buffer.push_byte(b'\r'), None);
        assert_eq!(buffer.push_byte(b'\n').as_deref(), Some("ok"));
    }

    #[test]
    fn output_capture_bounds_history_and_emits_one_marker() {
        let mut capture = OutputCapture::default();
        let line = "x".repeat(8 * 1024);
        let mut marker = None;

        for _ in 0..64 {
            if let Some(event_line) = capture.push_line(&line) {
                if event_line == OUTPUT_TRUNCATION_LINE {
                    marker = Some(event_line);
                    break;
                }
            }
        }

        assert_eq!(marker.as_deref(), Some(OUTPUT_TRUNCATION_LINE));
        assert!(capture.truncated);
        assert!(capture.text.len() <= MAX_CAPTURED_OUTPUT_BYTES);
        assert!(capture.text.ends_with(OUTPUT_TRUNCATION_MARKER));
        assert_eq!(capture.push_line("later"), None);
    }
}
