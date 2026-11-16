#[derive(Clone, Copy)]
pub enum LogLevel {
    Warn,
}

pub struct AppLogger;

impl AppLogger {
    pub fn write_best_effort(&self, _level: LogLevel, source: &str, message: &str) {
        eprintln!("{source}: {message}");
    }
}
