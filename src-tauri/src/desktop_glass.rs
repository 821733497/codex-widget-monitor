use std::{
    slice,
    sync::Mutex,
    time::{Duration, Instant},
};

use anyhow::{Context, Result};
use tauri::{ipc::Response, Manager, State, WebviewWindow, WindowEvent};
use windows::{
    core::{factory, Interface},
    Graphics::{
        Capture::{
            Direct3D11CaptureFrame, Direct3D11CaptureFramePool, GraphicsCaptureItem,
            GraphicsCaptureSession,
        },
        DirectX::DirectXPixelFormat,
    },
    Win32::{
        Foundation::{E_POINTER, HWND, POINT, RECT},
        Graphics::{
            Direct3D::{D3D_DRIVER_TYPE, D3D_DRIVER_TYPE_UNKNOWN, D3D_DRIVER_TYPE_WARP},
            Direct3D11::{
                D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Multithread,
                ID3D11Texture2D, D3D11_BOX, D3D11_CPU_ACCESS_READ,
                D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE, D3D11_MAP_READ,
                D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
            },
            Dxgi::{
                Common::DXGI_SAMPLE_DESC, CreateDXGIFactory1, IDXGIAdapter, IDXGIDevice,
                IDXGIFactory1,
            },
            Gdi::{
                ClientToScreen, GetMonitorInfoW, MonitorFromWindow, HMONITOR, MONITORINFO,
                MONITOR_DEFAULTTONULL,
            },
        },
        System::WinRT::{
            Direct3D11::{CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess},
            Graphics::Capture::IGraphicsCaptureItemInterop,
        },
        UI::WindowsAndMessaging::{
            GetAncestor, GetClientRect, GetForegroundWindow, GetWindowDisplayAffinity,
            GetWindowThreadProcessId, IsWindowVisible, SetWindowDisplayAffinity, GA_ROOT,
            WDA_EXCLUDEFROMCAPTURE, WINDOW_DISPLAY_AFFINITY,
        },
    },
};

const IDLE_TIMEOUT: Duration = Duration::from_secs(2);
const MAX_PIXELS: u64 = 1920 * 1440;

#[derive(Clone, Copy, PartialEq, Eq)]
struct Region {
    monitor: isize,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

fn region(hwnd: HWND) -> Option<Region> {
    let mut client = RECT::default();
    let mut origin = POINT::default();
    let mut info = MONITORINFO {
        cbSize: std::mem::size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    unsafe {
        let fg = GetForegroundWindow();
        let is_fg = fg == hwnd || GetAncestor(fg, GA_ROOT) == hwnd;
        let mut fg_pid = 0;
        GetWindowThreadProcessId(fg, Some(&mut fg_pid));
        let is_our_process = fg_pid == std::process::id();
        if (!is_fg && !is_our_process) || !IsWindowVisible(hwnd).as_bool() {
            return None;
        }
        GetClientRect(hwnd, &mut client).ok()?;
        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONULL);
        if monitor.0.is_null()
            || !ClientToScreen(hwnd, &mut origin).as_bool()
            || !GetMonitorInfoW(monitor, &mut info).as_bool()
        {
            return None;
        }
        let x = (origin.x - info.rcMonitor.left).try_into().ok()?;
        let y = (origin.y - info.rcMonitor.top).try_into().ok()?;
        let width: u32 = client.right.try_into().ok()?;
        let height: u32 = client.bottom.try_into().ok()?;
        let monitor_width = (info.rcMonitor.right - info.rcMonitor.left) as u32;
        let monitor_height = (info.rcMonitor.bottom - info.rcMonitor.top) as u32;
        if width == 0
            || height == 0
            || x + width > monitor_width
            || y + height > monitor_height
            || u64::from(width) * u64::from(height) > MAX_PIXELS
        {
            return None;
        }
        Some(Region {
            monitor: monitor.0 as isize,
            x,
            y,
            width,
            height,
        })
    }
}

fn adapter_for_monitor(monitor: HMONITOR) -> Option<IDXGIAdapter> {
    let factory: IDXGIFactory1 = unsafe { CreateDXGIFactory1().ok()? };
    (0..)
        .map_while(|index| unsafe { factory.EnumAdapters1(index).ok() })
        .find(|adapter| {
            (0..)
                .map_while(|index| unsafe { adapter.EnumOutputs(index).ok() })
                .filter_map(|output| unsafe { output.GetDesc().ok() })
                .any(|desc| desc.Monitor == monitor)
        })?
        .cast()
        .ok()
}

fn create_device(
    adapter: Option<&IDXGIAdapter>,
    driver: D3D_DRIVER_TYPE,
) -> Result<(ID3D11Device, ID3D11DeviceContext)> {
    let mut device: Option<ID3D11Device> = None;
    let mut context: Option<ID3D11DeviceContext> = None;
    unsafe {
        D3D11CreateDevice(
            adapter,
            driver,
            Default::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )?;
    }
    let device = device.context("Direct3D 设备为空")?;
    let context = context.context("Direct3D 上下文为空")?;
    if let Ok(multithread) = context.cast::<ID3D11Multithread>() {
        unsafe {
            let _ = multithread.SetMultithreadProtected(true);
        }
    }
    Ok((device, context))
}

struct Capture {
    session: GraphicsCaptureSession,
    pool: Direct3D11CaptureFramePool,
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    staging: Option<(u32, u32, ID3D11Texture2D)>,
}

impl Capture {
    fn start(monitor: HMONITOR) -> Result<Self> {
        let interop = factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()?;
        let item: GraphicsCaptureItem = unsafe { interop.CreateForMonitor(monitor)? };
        let hardware = adapter_for_monitor(monitor)
            .and_then(|adapter| create_device(Some(&adapter), D3D_DRIVER_TYPE_UNKNOWN).ok());
        let (device, context) = match hardware {
            Some(device) => device,
            None => {
                create_device(None, D3D_DRIVER_TYPE_WARP).context("无法初始化捕获用的 Direct3D")?
            }
        };
        let dxgi: IDXGIDevice = device.cast()?;
        let winrt: windows::Graphics::DirectX::Direct3D11::IDirect3DDevice =
            unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi)? }.cast()?;
        let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
            &winrt,
            DirectXPixelFormat::R8G8B8A8UIntNormalized,
            2,
            item.Size()?,
        )?;
        let session = pool.CreateCaptureSession(&item)?;
        let capture = Self {
            session,
            pool,
            device,
            context,
            staging: None,
        };
        capture.session.SetIsCursorCaptureEnabled(false)?;
        capture.session.StartCapture()?;
        Ok(capture)
    }

    fn read(&mut self, region: Region) -> Result<Vec<u8>> {
        let mut newest: Option<Direct3D11CaptureFrame> = None;
        for _ in 0..2 {
            match self.pool.TryGetNextFrame() {
                Ok(frame) => {
                    if let Some(previous) = newest.replace(frame) {
                        previous.Close()?;
                    }
                }
                // WinRT 成功返回空接口时，windows-rs 用成功状态表示没有下一帧。
                Err(error) if error.code() == E_POINTER || error.code().is_ok() => break,
                Err(error) => return Err(error.into()),
            }
        }
        let Some(frame) = newest else {
            return Ok(Vec::new());
        };
        let result = self.crop(&frame, region);
        frame.Close()?;
        result
    }

    fn crop(&mut self, frame: &Direct3D11CaptureFrame, region: Region) -> Result<Vec<u8>> {
        let Region {
            x,
            y,
            width,
            height,
            ..
        } = region;
        let size = frame.ContentSize()?;
        if x + width > size.Width as u32 || y + height > size.Height as u32 {
            return Ok(vec![0]);
        }
        let surface: IDirect3DDxgiInterfaceAccess = frame.Surface()?.cast()?;
        let texture: ID3D11Texture2D = unsafe { surface.GetInterface()? };
        if self
            .staging
            .as_ref()
            .is_none_or(|(w, h, _)| (*w, *h) != (width, height))
        {
            let mut desc = D3D11_TEXTURE2D_DESC::default();
            unsafe {
                texture.GetDesc(&mut desc);
            }
            desc.Width = width;
            desc.Height = height;
            desc.MipLevels = 1;
            desc.ArraySize = 1;
            desc.SampleDesc = DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            };
            desc.Usage = D3D11_USAGE_STAGING;
            desc.BindFlags = 0;
            desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
            desc.MiscFlags = 0;
            let mut staging = None;
            unsafe {
                self.device
                    .CreateTexture2D(&desc, None, Some(&mut staging))?;
            }
            self.staging = Some((width, height, staging.context("桌面采样缓冲区为空")?));
        }
        let (_, _, staging) = self.staging.as_ref().unwrap();
        let area = D3D11_BOX {
            left: x,
            top: y,
            front: 0,
            right: x + width,
            bottom: y + height,
            back: 1,
        };
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        let row_bytes = width as usize * 4;
        let mut bytes = Vec::with_capacity(8 + row_bytes * height as usize);
        bytes.extend_from_slice(&width.to_le_bytes());
        bytes.extend_from_slice(&height.to_le_bytes());
        unsafe {
            self.context
                .CopySubresourceRegion(staging, 0, 0, 0, 0, &texture, 0, Some(&area));
            self.context
                .Map(staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))?;
            for row in 0..height as usize {
                let pixels = mapped
                    .pData
                    .cast::<u8>()
                    .add(row * mapped.RowPitch as usize);
                bytes.extend_from_slice(slice::from_raw_parts(pixels, row_bytes));
            }
            self.context.Unmap(staging, 0);
        }
        Ok(bytes)
    }
}

impl Drop for Capture {
    fn drop(&mut self) {
        let _ = self.session.Close();
        let _ = self.pool.Close();
    }
}

struct Session {
    hwnd: isize,
    affinity: u32,
    monitor: isize,
    capture: Option<Capture>,
    requested: Instant,
    last_region: Option<Region>,
}

impl Session {
    fn start(hwnd: HWND, monitor: isize) -> Result<Self> {
        let mut affinity = 0;
        unsafe {
            GetWindowDisplayAffinity(hwnd, &mut affinity)?;
            SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)?;
        }
        let mut session = Self {
            hwnd: hwnd.0 as isize,
            affinity,
            monitor,
            capture: None,
            requested: Instant::now(),
            last_region: None,
        };
        session.capture = Some(Capture::start(HMONITOR(monitor as _))?);
        Ok(session)
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        drop(self.capture.take());
        let _ = unsafe {
            SetWindowDisplayAffinity(HWND(self.hwnd as _), WINDOW_DISPLAY_AFFINITY(self.affinity))
        };
    }
}
#[derive(Default)]
pub(crate) struct DesktopGlass(Mutex<Option<Session>>);

pub(crate) fn setup(app: &tauri::App) {
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_millis(500)).await;
            let state = handle.state::<DesktopGlass>();
            let mut session = state.0.lock().unwrap();
            if session.as_ref().is_some_and(|active| {
                active.requested.elapsed() > IDLE_TIMEOUT
                    || region(HWND(active.hwnd as _)).is_none()
            }) {
                *session = None;
            }
        }
    });
}

pub(crate) fn on_window_event(window: &tauri::Window, event: &WindowEvent) {
    if !matches!(window.label(), "main" | "taskbar-popup")
        || !matches!(event, WindowEvent::Focused(false) | WindowEvent::Destroyed)
    {
        return;
    }
    if let Ok(hwnd) = window.hwnd() {
        let state = window.state::<DesktopGlass>();
        let mut session = state.0.lock().unwrap();
        if session
            .as_ref()
            .is_some_and(|active| active.hwnd == hwnd.0 as isize)
        {
            *session = None;
        }
    }
}

#[tauri::command]
pub(crate) async fn desktop_glass_frame(
    window: WebviewWindow,
    state: State<'_, DesktopGlass>,
    active: bool,
) -> Result<Response, String> {
    if !matches!(window.label(), "main" | "taskbar-popup") {
        return Err("此窗口不支持桌面玻璃".into());
    }
    let hwnd = HWND(window.hwnd().map_err(|error| error.to_string())?.0);
    let mut session = state.0.lock().unwrap();
    let Some(rect) = active.then(|| region(hwnd)).flatten() else {
        if session
            .as_ref()
            .is_some_and(|open| open.hwnd == hwnd.0 as isize)
        {
            *session = None;
        }
        // 区分窗口位置不可采样与暂时没有新帧，让前端立即丢弃失效背景。
        return Ok(Response::new(vec![0]));
    };
    if session
        .as_ref()
        .is_none_or(|open| open.hwnd != hwnd.0 as isize || open.monitor != rect.monitor)
    {
        *session = None;
        *session = Some(Session::start(hwnd, rect.monitor).map_err(|error| error.to_string())?);
    }
    let open = session.as_mut().unwrap();
    open.requested = Instant::now();
    match open.capture.as_mut().unwrap().read(rect) {
        Ok(bytes) if bytes.len() > 8 => {
            open.last_region = Some(rect);
            Ok(Response::new(bytes))
        }
        Ok(_) if open.last_region != Some(rect) => Ok(Response::new(vec![0])),
        Ok(bytes) => Ok(Response::new(bytes)),
        Err(error) => {
            *session = None;
            Err(error.to_string())
        }
    }
}
