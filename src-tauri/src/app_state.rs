use tokio::sync::Mutex;

use crate::{logging::AppLogger, quota::QuotaService};

pub struct AppState {
    pub(crate) quota_service: Mutex<QuotaService>,
    pub(crate) logger: AppLogger,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            quota_service: Mutex::new(QuotaService::new()),
            logger: AppLogger,
        }
    }
}
