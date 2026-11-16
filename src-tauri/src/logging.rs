#[cfg(windows)]
#[derive(Clone, Copy)]
pub enum LogLevel {
    Warn,
}

pub struct AppLogger;

impl AppLogger {
    #[cfg(windows)]
    pub fn write_best_effort(&self, _level: LogLevel, source: &str, message: &str) {
        eprintln!("{source}: {message}");
    }
}
