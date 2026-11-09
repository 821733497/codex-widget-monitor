export function isMacOSUserAgent(userAgent) {
  return typeof userAgent === "string" && /Macintosh|Mac OS X/i.test(userAgent);
}

export function detectMacOS() {
  return typeof navigator !== "undefined" && isMacOSUserAgent(navigator.userAgent);
}

export function detectWindows() {
  return typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
}
