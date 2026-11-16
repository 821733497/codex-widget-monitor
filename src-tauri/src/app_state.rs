use tokio::sync::Mutex;

#[cfg(windows)]
use crate::logging::AppLogger;
use crate::quota::QuotaService;

pub struct AppState {
    pub(crate) quota_service: Mutex<QuotaService>,
    #[cfg(windows)]
    pub(crate) logger: AppLogger,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            quota_service: Mutex::new(QuotaService::new()),
            #[cfg(windows)]
            logger: AppLogger,
        }
    }
}
