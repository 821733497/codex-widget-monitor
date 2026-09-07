import { describe, expect, it } from "vitest";

import packageJson from "../package.json";
import { APP_VERSION_LABEL } from "../src/app/constants.js";

describe("应用版本展示", () => {
  it("始终跟随 package.json 版本", () => {
    expect(APP_VERSION_LABEL).toBe(`v${packageJson.version}`);
  });
});
