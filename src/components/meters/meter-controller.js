import { mount as mountHoloMeter } from "./holo-meter.js";
import { mount as mountPyroMeter } from "./pyro-meter.js";
import { mount as mountEmeraldMeter } from "./emerald-meter.js";
import { mount as mountCyberMeter } from "./cyber-meter.js";
import { mount as mountObsidianMeter } from "./obsidian-meter.js";
import { mount as mountCrimsonMeter } from "./crimson-meter.js";
import { mount as mountSakuraMeter } from "./sakura-meter.js";

const METER_FACTORIES = {
  default: mountHoloMeter,
  holo: mountHoloMeter,
  pyro: mountPyroMeter,
  emerald: mountEmeraldMeter,
  cyber: mountCyberMeter,
  obsidian: mountObsidianMeter,
  crimson: mountCrimsonMeter,
  sakura: mountSakuraMeter,
};

export function createMeterController(root) {
  let activeTheme = null;
  let activeMeter = null;

  function update({ theme, ...payload }) {
    if (!root) return;

    const nextTheme = Object.hasOwn(METER_FACTORIES, theme) ? theme : "default";
    if (activeTheme !== nextTheme) {
      // 主题 SVG 的结构和渐变 ID 完全独立，切换时必须重建，避免残留旧主题节点。
      activeMeter?.destroy();
      root.replaceChildren();
      activeMeter = METER_FACTORIES[nextTheme](root);
      activeTheme = nextTheme;
    }

    activeMeter.update(payload);
  }

  function notifyDrag(screenX, screenY) {
    activeMeter?.notifyDrag?.(screenX, screenY);
  }

  function notifyDragEnd(vx, vy) {
    activeMeter?.notifyDragEnd?.(vx, vy);
  }

  function destroy() {
    activeMeter?.destroy();
    root?.replaceChildren();
    activeMeter = null;
    activeTheme = null;
  }

  return { update, destroy, notifyDrag, notifyDragEnd };
}
