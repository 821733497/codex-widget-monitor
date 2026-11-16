export function formatResetCountdown(value, locale = "zh", now = Date.now()) {
  if (!value) return "--";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "--";
  const en = locale === "en";
  const diff = time - now;
  if (diff <= 0) return en ? "0m" : "0分";
  const totalMinutes = Math.max(1, Math.ceil(diff / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return en ? `${days}d ${hours}h ${minutes}m` : `${days}天 ${hours}时 ${minutes}分`;
  if (hours) return en ? `${hours}h ${minutes}m` : `${hours}时 ${minutes}分`;
  return en ? `${minutes}m` : `${minutes}分`;
}
