// 汇率获取与缓存（6 小时过期），供 content script 和 popup 使用
const CACHE_KEY = "usdCnyRate";
const TTL_MS = 6 * 60 * 60 * 1000;

// 多源兜底：腾讯行情（国内可达、无需密钥）优先，国外免费 API 作后备
const SOURCES = [
  {
    // v_whUSDCNY="310~美元人民币~USDCNY~现价~..."，取第 4 个字段
    url: "https://qt.gtimg.cn/q=whUSDCNY",
    parse: (text) => {
      const m = text.match(/"([^"]+)"/);
      return m ? Number(m[1].split("~")[3]) : null;
    },
  },
  {
    url: "https://open.er-api.com/v6/latest/USD",
    parse: (text) => {
      try {
        return Number(JSON.parse(text)?.rates?.CNY);
      } catch {
        return null;
      }
    },
  },
  {
    url: "https://api.frankfurter.app/latest?from=USD&to=CNY",
    parse: (text) => {
      try {
        return Number(JSON.parse(text)?.rates?.CNY);
      } catch {
        return null;
      }
    },
  },
];

async function fetchRate() {
  for (const src of SOURCES) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(src.url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const rate = Number(src.parse(await res.text()));
      // 合理性校验：USD/CNY 正常区间约 6~8
      if (Number.isFinite(rate) && rate > 1 && rate < 20) return rate;
    } catch {
      // 尝试下一个数据源
    }
  }
  return null;
}

async function getRate(force = false) {
  const { [CACHE_KEY]: cached } = await chrome.storage.local.get(CACHE_KEY);
  // 手动汇率优先：不自动刷新，除非用户点了“手动刷新”（force）
  if (!force && cached?.manual) return cached;
  if (!force && cached && Date.now() - cached.updatedAt < TTL_MS) return cached;
  const rate = await fetchRate();
  if (rate == null) return cached ?? null;
  const entry = { rate, updatedAt: Date.now() };
  await chrome.storage.local.set({ [CACHE_KEY]: entry }); // 自动结果不带 manual 标记
  return entry;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "getRate") {
    getRate(msg.force).then(sendResponse);
    return true; // 异步响应
  }
});