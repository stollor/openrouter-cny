// OpenRouter 全站增强：模型页美元价格 → 人民币（仅显示人民币）+ 全站界面术语翻译
// 安全原则：只修改文本内容，绝不改动属性/DOM 结构，避免破坏 React 协调导致报错
// 词典见 dict.js（OR_DICT）
const RATE_KEY = "usdCnyRate";
const TRANSLATE_KEY = "orTranslate";
const PRICE_RE_LIST = /^\$\d[\d,]*\.?\d*\/M\s*(input|output)\s*tokens$/;
const PRICE_RE_TABLE = /^\$\d[\d,]*\.?\d*$/;
const IS_MODELS_PAGE = location.pathname.startsWith("/models");

let rate = null;
let translateOn = true;

// ---------- 汇率转换（仅模型页生效） ----------
function toCnyText(usd) {
  if (usd === 0) return "0";
  const v = usd * rate;
  // 小于 1 保留两位小数，其余去掉末尾多余的 0
  return v < 1 ? v.toFixed(2) : v.toFixed(2).replace(/\.?0+$/, "");
}

function parseUsd(s) {
  const n = parseFloat(s.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// List 视图：整行文本匹配 "$x.xx/M input tokens"，取最内层（不含同样匹配的后代 span）
function convertListView() {
  const spans = [...document.querySelectorAll("span")].filter(
    (el) =>
      PRICE_RE_LIST.test(el.textContent) &&
      ![...el.querySelectorAll("span")].some((s) => PRICE_RE_LIST.test(s.textContent)),
  );
  for (const span of spans) {
    const nodes = span.childNodes; // ["$", "0.0603", "/M", " ", "input", " ", "tokens", ...]
    const usd = parseUsd(nodes[1]?.textContent ?? "");
    if (usd == null) continue;
    span.dataset.usd = String(usd);
    span.dataset.view = "list";
    nodes[0].textContent = "¥";
    nodes[1].textContent = toCnyText(usd);
  }
}

// Table 视图：文本节点形如 "$x.xx"，且所在元素除价格外没有其他文本
function convertTableView() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const targets = [];
  let node;
  while ((node = walker.nextNode())) {
    const t = node.textContent.trim();
    if (!PRICE_RE_TABLE.test(t)) continue;
    const el = node.parentElement;
    if (!el || el.textContent.trim() !== t) continue;
    const usd = parseUsd(t);
    if (usd == null) continue;
    targets.push({ node, el, usd });
  }
  for (const { node, el, usd } of targets) {
    el.dataset.usd = String(usd);
    el.dataset.view = "table";
    node.textContent = "¥" + toCnyText(usd);
  }
}

function convertAll() {
  if (rate == null || !IS_MODELS_PAGE) return;
  convertListView();
  convertTableView();
}

// popup 手动刷新汇率后，按新汇率重算已转换的价格
function refreshConverted() {
  if (!IS_MODELS_PAGE) return;
  for (const el of document.querySelectorAll("[data-usd]")) {
    const usd = Number(el.dataset.usd);
    if (el.dataset.view === "list") {
      el.childNodes[0].textContent = "¥";
      el.childNodes[1].textContent = toCnyText(usd);
    } else if (el.firstChild) {
      el.firstChild.textContent = "¥" + toCnyText(usd);
    }
  }
}

// ---------- 界面术语翻译（全站） ----------
// 带动态数字的规则
const T_RULES = [
  { re: /^(\d+)% off$/, to: (m) => `省 ${m[1]}%` },
  { re: /^(\d+)d ago$/, to: (m) => `${m[1]} 天前` },
  { re: /^(\d+)w ago$/, to: (m) => `${m[1]} 周前` },
  { re: /^(\d+)mo ago$/, to: (m) => `${m[1]} 个月前` },
  { re: /^(\d+)y ago$/, to: (m) => `${m[1]} 年前` },
  { re: /^(Text|Image|Embeddings|Audio|Video|Rerank|Speech|Transcription)(\d+)$/, to: (m) => (OR_DICT[m[1]] ?? m[1]) + " " + m[2] },
  { re: /^(Text|Image|Embeddings|Audio|Video|Rerank|Speech|Transcription)\s+(\d+)$/, to: (m) => (OR_DICT[m[1]] ?? m[1]) + " " + m[2] },
  { re: /^Show (\d+) more$/, to: (m) => `显示另外 ${m[1]} 个` },
];

// 类型 Tab（Text414 等）：标签是图标旁的独立文本节点，不在叶子元素里
const TYPE_WORDS = ["Text", "Image", "Embeddings", "Audio", "Video", "Rerank", "Speech", "Transcription"];

function translateTabLabels() {
  for (const el of document.querySelectorAll("[role='tab']")) {
    if (!/^(Text|Image|Embeddings|Audio|Video|Rerank|Speech|Transcription)\d+$/.test(el.textContent.trim())) continue;
    for (const parent of [el, ...el.querySelectorAll("span")]) {
      if (parent.dataset.tTab) continue;
      const fixes = [];
      for (let i = 0; i < parent.childNodes.length; i++) {
        const n = parent.childNodes[i];
        if (n.nodeType !== 3) continue;
        const w = n.textContent;
        if (TYPE_WORDS.includes(w) && OR_DICT[w]) fixes.push({ i, from: w, to: OR_DICT[w] });
      }
      if (!fixes.length) continue;
      parent.dataset.tTab = JSON.stringify(fixes);
      for (const f of fixes) parent.childNodes[f.i].textContent = f.to;
    }
  }
}

function restoreTabs() {
  for (const el of document.querySelectorAll("[data-t-tab]")) {
    try {
      for (const f of JSON.parse(el.dataset.tTab)) {
        const n = el.childNodes[f.i];
        if (n && n.nodeType === 3) n.textContent = f.from;
      }
    } catch {
      // 忽略损坏的标记数据
    }
    delete el.dataset.tTab;
  }
}

function translateAll() {
  if (!translateOn) return;
  for (const el of document.querySelectorAll("*")) {
    if (el.childElementCount > 0) continue; // 只处理叶子元素，避免破坏结构
    const tag = el.tagName;
    if (
      tag === "SCRIPT" || tag === "STYLE" || tag === "TITLE" || tag === "META" ||
      tag === "LINK" || tag === "NOSCRIPT" || tag === "PRE" || tag === "CODE" ||
      tag === "KBD" || tag === "SAMP"
    ) continue;
    const text = el.textContent.trim();
    if (!text || text.length > 40) continue;
    if (el.dataset.tOrig) continue; // 已翻译
    let target = OR_DICT[text];
    if (target == null) {
      for (const r of T_RULES) {
        const m = text.match(r.re);
        if (m) {
          target = r.to(m);
          break;
        }
      }
    }
    if (target == null) target = commonFallback(text);
    if (target == null || target === text) continue;
    el.dataset.tOrig = text;
    el.textContent = target;
  }
  translateTabLabels();
  translateLabelNodes();
}

// 关闭翻译时恢复原文（仅恢复仍由本插件持有的节点）
function restoreAll() {
  restoreTabs();
  restoreTextNodes();
  for (const el of document.querySelectorAll("[data-t-orig]")) {
    el.textContent = el.dataset.tOrig;
    delete el.dataset.tOrig;
  }
}

// 图标 + 文本节点标签（侧边栏导航、头像菜单等非叶子元素里的标签文本节点）
function translateLabelNodes() {
  for (const el of document.querySelectorAll("*")) {
    if (el.childElementCount === 0) continue; // 叶子由主循环处理
    const tag = el.tagName;
    if (tag === "PRE" || tag === "CODE" || tag === "KBD" || tag === "SAMP") continue;
    if (el.closest("pre,code,script,style")) continue;
    if (el.dataset.tNodes) continue;
    const fixes = [];
    for (let i = 0; i < el.childNodes.length; i++) {
      const n = el.childNodes[i];
      if (n.nodeType !== 3) continue;
      const w = n.textContent;
      const trimmed = w.trim();
      if (!trimmed || trimmed.length > 40) continue;
      if (w !== trimmed) continue; // 节点前后带空白的不动，避免破坏排版
      let target = OR_DICT[trimmed];
      if (target == null) {
        for (const r of T_RULES) {
          const m = trimmed.match(r.re);
          if (m) {
            target = r.to(m);
            break;
          }
        }
      }
      if (target == null) target = commonFallback(trimmed);
      if (target == null || target === trimmed) continue;
      fixes.push({ i, from: trimmed, to: target });
    }
    if (!fixes.length) continue;
    el.dataset.tNodes = JSON.stringify(fixes);
    for (const f of fixes) el.childNodes[f.i].textContent = f.to;
  }
}

function restoreTextNodes() {
  for (const el of document.querySelectorAll("[data-t-nodes]")) {
    try {
      for (const f of JSON.parse(el.dataset.tNodes)) {
        const n = el.childNodes[f.i];
        if (n && n.nodeType === 3) n.textContent = f.from;
      }
    } catch {
      // 忽略损坏的标记数据
    }
    delete el.dataset.tNodes;
  }
}

// ---------- 常用词兜底翻译 ----------
// 每个词都必须在 OR_COMMON 中才整体翻译，任一未知词（专有名词等）直接跳过
function commonFallback(text) {
  if (/\d/.test(text)) return null; // 含数字交给动态规则处理
  const tokens = text.split(/\s+/);
  const parts = [];
  for (const tok of tokens) {
    if (!/^[A-Za-z]+$/.test(tok)) return null; // 含标点/符号不兜底
    const w = tok.toLowerCase();
    if (OR_DROP.has(w)) continue;
    const t = OR_COMMON[w];
    if (!t) return null;
    parts.push(t);
  }
  if (!parts.length) return null;
  const out = parts.join("");
  return out === text ? null : out;
}

// 首次翻译完成后解除页面隐藏，消除英文闪现
function revealPage() {
  if (!document.documentElement.dataset.orReady) {
    document.documentElement.dataset.orReady = "1";
  }
}
setTimeout(revealPage, 3000); // 兜底：即使脚本异常也不让页面一直隐藏

// ---------- 初始化 ----------
async function ensureRate() {
  try {
    const res = await chrome.runtime.sendMessage({ type: "getRate" });
    if (res?.rate) {
      rate = res.rate;
      convertAll();
    }
  } catch {
    // 扩展被卸载/上下文失效时静默退出
  }
}

// 翻译开关初始状态（默认开）
chrome.storage.local.get(TRANSLATE_KEY).then((v) => {
  translateOn = v[TRANSLATE_KEY] !== false;
  try {
    if (translateOn) {
      translateAll();
    } else {
      restoreAll(); // 关着开关时，把早期已翻译的内容还原回去
    }
  } finally {
    revealPage();
  }
});

// React 渲染/无限滚动/视图切换都会触发，防抖后整体重扫
const observer = new MutationObserver(() => {
  clearTimeout(observer.timer);
  observer.timer = setTimeout(() => {
    if (rate == null) {
      ensureRate();
    } else {
      convertAll();
    }
    translateAll();
  }, 150);
});
observer.observe(document.body, { childList: true, subtree: true, characterData: true });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[RATE_KEY]) {
    rate = changes[RATE_KEY].newValue?.rate ?? rate;
    refreshConverted();
  }
  if (changes[TRANSLATE_KEY]) {
    translateOn = changes[TRANSLATE_KEY].newValue !== false;
    if (translateOn) {
      translateAll();
    } else {
      restoreAll();
    }
  }
});

ensureRate();