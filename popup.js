const RATE_KEY = "usdCnyRate";
const TRANSLATE_KEY = "orTranslate";
const TTL_MS = 6 * 60 * 60 * 1000;

const rateEl = document.getElementById("rate");
const metaEl = document.getElementById("meta");
const errorEl = document.getElementById("error");
const refreshBtn = document.getElementById("refresh");
const rateInput = document.getElementById("rateInput");
const applyRateBtn = document.getElementById("applyRate");
const translateChk = document.getElementById("translate");

function fmtTime(ts) {
  return new Date(ts).toLocaleString("zh-CN", { hour12: false });
}

function showError(msg) {
  errorEl.hidden = false;
  errorEl.textContent = msg;
}

function hideError() {
  errorEl.hidden = true;
}

// 直接读缓存渲染，不经过 background/网络，避免长时间“加载中”
async function renderFromStorage() {
  const { [RATE_KEY]: r } = await chrome.storage.local.get(RATE_KEY);
  if (r?.rate) {
    rateEl.textContent = `1 USD = ¥${r.rate.toFixed(2)}`;
    if (r.manual) {
      metaEl.textContent = `手动设置，更新于 ${fmtTime(r.updatedAt)}（点“手动刷新”恢复自动）`;
    } else {
      const fresh = Date.now() - r.updatedAt < TTL_MS;
      metaEl.textContent =
        `更新于 ${fmtTime(r.updatedAt)}${fresh ? "" : "（已过期，稍后自动更新）"}，每 6 小时自动刷新`;
    }
    return true;
  }
  rateEl.textContent = "—";
  metaEl.textContent = "";
  return false;
}

// 带超时的消息请求：background 最坏要依次尝试 3 个源（每个 5s），这里留足余量
function sendWithTimeout(msg, ms = 25000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    chrome.runtime.sendMessage(msg)
      .then((r) => {
        clearTimeout(t);
        resolve(r ?? null);
      })
      .catch(() => {
        clearTimeout(t);
        resolve(null);
      });
  });
}

async function refresh() {
  refreshBtn.disabled = true;
  hideError();
  const res = await sendWithTimeout({ type: "getRate", force: true });
  if (res?.rate) {
    await renderFromStorage();
  } else {
    showError("获取汇率失败，请检查网络，或手动输入汇率");
    await renderFromStorage(); // 仍展示旧缓存
  }
  refreshBtn.disabled = false;
}

async function applyManualRate() {
  const v = Number(rateInput.value);
  if (!Number.isFinite(v) || v <= 1 || v >= 20) {
    showError("请输入 1~20 之间的数字汇率");
    return;
  }
  hideError();
  await chrome.storage.local.set({
    [RATE_KEY]: { rate: v, updatedAt: Date.now(), manual: true },
  });
  rateInput.value = "";
  await renderFromStorage();
}

async function init() {
  // 有缓存直接显示；过期（且非手动）则静默后台刷新；无缓存才主动拉取
  const has = await renderFromStorage();
  if (has) {
    const { [RATE_KEY]: r } = await chrome.storage.local.get(RATE_KEY);
    if (!r?.manual && Date.now() - r.updatedAt >= TTL_MS) {
      sendWithTimeout({ type: "getRate" }).then(() => renderFromStorage());
    }
  } else {
    const res = await sendWithTimeout({ type: "getRate" });
    if (res?.rate) {
      await renderFromStorage();
    } else {
      showError("获取汇率失败，请检查网络，或手动输入汇率");
    }
  }

  const { [TRANSLATE_KEY]: t } = await chrome.storage.local.get(TRANSLATE_KEY);
  translateChk.checked = t !== false; // 默认开启
  translateChk.addEventListener("change", () => {
    chrome.storage.local.set({ [TRANSLATE_KEY]: translateChk.checked });
  });
}

refreshBtn.addEventListener("click", () => refresh());
applyRateBtn.addEventListener("click", () => applyManualRate());
rateInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") applyManualRate();
});
init();