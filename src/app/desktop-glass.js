import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import liquidGL from "liquid-gl";
import "./desktop-glass.css";

const FRAME_INTERVAL = 83;

export function connectDesktopGlass(panel, isOpen = () => true) {
  const scene = document.createElement("div");
  scene.className = "desktop-glass-scene";
  scene.setAttribute("aria-hidden", "true");
  scene.hidden = true;
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  scene.append(video);
  document.body.prepend(scene);

  const surface = document.createElement("div");
  surface.className = "desktop-glass-surface";
  surface.setAttribute("aria-hidden", "true");
  panel.prepend(surface);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  const dark = matchMedia("(prefers-color-scheme: dark)");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let lens;
  let track;
  let timer;
  let generation = 0;
  let running = false;
  let focused = false;

  function releaseFrame() {
    lens?.destroy();
    lens = null;
    track?.stop();
    track = null;
    video.srcObject = null;
    scene.hidden = true;
  }

  function mountLens() {
    if (!running || scene.hidden || video.readyState < 2) return;
    lens?.destroy();
    lens = liquidGL({
      target: ".desktop-glass-surface",
      snapshot: ".desktop-glass-scene",
      content: false,
      resolution: 1,
      refraction: 0.045,
      aberration: 0.55,
      bevelDepth: 0.12,
      bevelWidth: 0.15,
      frost: 0,
      magnify: 1.06,
      tint: dark.matches
        ? "rgba(18, 22, 32, 0.22)"
        : "rgba(255, 255, 255, 0.16)",
      shadow: false,
      specular: !reduced.matches,
      interaction: "fluid",
      interactionStrength: 0.35,
      interactionRadius: 0.28,
      interactionViscosity: 0.65,
      reveal: "none",
    });
  }

  function paint(result) {
    const bytes =
      result instanceof ArrayBuffer ? result : Uint8Array.from(result).buffer;
    if (bytes.byteLength === 1) releaseFrame();
    if (bytes.byteLength < 8) return;

    const header = new DataView(bytes);
    const width = header.getUint32(0, true);
    const height = header.getUint32(4, true);
    if (!width || !height || bytes.byteLength !== 8 + width * height * 4)
      return;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    context.putImageData(
      new ImageData(new Uint8ClampedArray(bytes, 8), width, height),
      0,
      0,
    );

    if (!track) {
      const stream = canvas.captureStream(0);
      [track] = stream.getVideoTracks();
      scene.hidden = false;
      video.srcObject = stream;
      void video.play().catch((error) => {
        if (running && video.srcObject === stream) {
          console.warn("桌面玻璃视频启动失败", error);
          stop();
        }
      });
    }
    track.requestFrame();
  }

  function eligible() {
    return isOpen() && focused && !document.hidden;
  }

  async function poll(token) {
    if (!running || token !== generation) return;
    if (!eligible()) {
      stop();
      return;
    }
    const started = performance.now();
    try {
      const frame = await invoke("desktop_glass_frame", { active: true });
      if (running && token === generation) paint(frame);
    } catch (error) {
      if (running && token === generation) {
        console.warn("读取桌面玻璃画面失败", error);
        stop();
      }
    }
    if (running && token === generation) {
      timer = setTimeout(
        () => void poll(token),
        Math.max(0, FRAME_INTERVAL - (performance.now() - started)),
      );
    }
  }

  function stop() {
    if (!running) return;
    running = false;
    generation++;
    clearTimeout(timer);
    releaseFrame();
    void invoke("desktop_glass_frame", { active: false }).catch(() => {});
  }

  function refresh() {
    if (!eligible()) {
      stop();
    } else if (
      !running &&
      context &&
      typeof canvas.captureStream === "function"
    ) {
      running = true;
      void poll(++generation);
    }
  }

  video.addEventListener("loadeddata", mountLens);
  dark.addEventListener("change", mountLens);
  reduced.addEventListener("change", mountLens);
  document.addEventListener("visibilitychange", refresh);
  const currentWindow = getCurrentWindow();
  const unlisten = currentWindow.onFocusChanged(({ payload }) => {
    focused = payload;
    refresh();
  });
  void unlisten
    .then(() => currentWindow.isFocused())
    .then((value) => {
      focused = value;
      refresh();
    })
    .catch((error) => console.warn("读取玻璃窗口焦点失败", error));
  window.addEventListener(
    "pagehide",
    () => {
      focused = false;
      stop();
      void unlisten.then((dispose) => dispose()).catch(() => {});
    },
    { once: true },
  );
  return refresh;
}
