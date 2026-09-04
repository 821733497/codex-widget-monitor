use std::sync::atomic::AtomicBool;

use tokio::sync::Mutex;

use crate::logging::AppLogger;
use crate::quota::{QuotaEstimator, QuotaService};

pub struct AppState {
    pub(crate) quota_service: Mutex<QuotaService>,
    pub(crate) quota_estimator: QuotaEstimator,
    pub(crate) settings_lock: Mutex<()>,
    pub(crate) always_on_top: AtomicBool,
    pub(crate) logger: AppLogger,
    /// 当前激活的数据源名称，由前端在切换数据源后同步写入，用于托盘菜单动态标签。
    pub(crate) active_source: Mutex<String>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            quota_service: Mutex::new(QuotaService::new()),
            quota_estimator: QuotaEstimator::new(),
            settings_lock: Mutex::new(()),
            always_on_top: AtomicBool::new(true),
            logger: AppLogger::new(),
            active_source: Mutex::new("官方".to_string()),
        }
    }
}
