import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const maxAttempts = 3;
const transientErrorPattern = new RegExp(
  [
    "audit endpoint returned an error",
    "invalid package tree",
    "service unavailable",
    "bad gateway",
    "gateway timeout",
    "\\b429\\b",
    "\\b502\\b",
    "\\b503\\b",
    "\\b504\\b",
    "EAI_AGAIN",
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "EIDLETIMEOUT",
    "ERR_SOCKET_TIMEOUT",
    "FETCH_ERROR",
    "ENETUNREACH",
    "ENOTFOUND"
  ].join("|"),
  "i"
);

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const result = await runAudit();

  if (result.status === 0) {
    process.stdout.write(result.output);
    process.exit(0);
  }

  if (!transientErrorPattern.test(result.output)) {
    process.stderr.write(result.output);
    process.exit(result.status ?? 1);
  }

  if (attempt < maxAttempts) {
    console.warn(`npm audit 审计接口暂时不可用，将在稍后重试（${attempt}/${maxAttempts}）。`);
    await delay(attempt * 3000);
    continue;
  }

  console.warn(`npm audit 审计接口连续 ${maxAttempts} 次返回临时错误，本次仅告警，不阻断构建。`);
  console.warn(result.output.trim());
  process.exit(0);
}

function runAudit() {
  return new Promise((resolve) => {
    let child;
    let output = "";

    try {
      child = spawn(
        npmCommand,
        [
          "audit",
          "--audit-level=high",
          "--registry=https://registry.npmjs.org",
          "--fetch-timeout=30000",
          "--fetch-retries=0"
        ],
        {
          env: process.env,
          shell: process.platform === "win32",
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true
        }
      );
    } catch (error) {
      resolve({ status: null, output: `${error.message}\n` });
      return;
    }

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", (error) => {
      output += `${error.message}\n`;
      resolve({ status: null, output });
    });
    child.on("close", (status) => {
      resolve({ status, output });
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
