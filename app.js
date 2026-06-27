const FOOD_KEY = "kidneyKunNikki_food_v1";
const BP_KEY = "kidneyKunNikki_bp_v1";
const SET_KEY = "kidneyKunNikki_settings_v1";
const SYNC_KEY = "kidneyKunNikki_sync_v1";

const bpTimes = [
  { key: "am", name: "朝" },
  { key: "noon", name: "昼" },
  { key: "pm", name: "夜" }
];

const metrics = [
  { key: "energy", name: "エネルギー", unit: "kcal", icon: "E", type: "range" },
  { key: "protein", name: "タンパク質", unit: "g", icon: "P", type: "upper" },
  { key: "salt", name: "塩分", unit: "g", icon: "S", type: "upper" },
  { key: "potassium", name: "カリウム", unit: "mg", icon: "K", type: "upper" },
  { key: "phosphorus", name: "リン", unit: "mg", icon: "R", type: "upper" },
  { key: "water", name: "水分", unit: "ml", icon: "W", type: "upper", optional: true }
];

const bpMetrics = [
  { key: "sys", name: "最高血圧", unit: "mmHg" },
  { key: "dia", name: "最低血圧", unit: "mmHg" }
];

const defaultSettings = {
  profile: { height: "", weight: "", standardWeight: "" },
  thresholds: {
    energy: { goodMin: 1000, goodMax: 1320, warnMax: 1900, mode: "range", enabled: true },
    protein: { goodMax: 51, warnMax: 70, mode: "upper", enabled: true },
    salt: { goodMax: 6, warnMax: 9, mode: "upper", enabled: true },
    potassium: { goodMax: 2000, warnMax: 2500, mode: "upper", enabled: true },
    phosphorus: { goodMax: 900, warnMax: 1200, mode: "upper", enabled: true },
    water: { goodMax: 99999, warnMax: 99999, mode: "upper", enabled: false }
  }
};

function today() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function jpDate(d) {
  const x = new Date(d + "T00:00:00");
  return `${x.getFullYear()}/${String(x.getMonth() + 1).padStart(2, "0")}/${String(x.getDate()).padStart(2, "0")}`;
}

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return structuredClone(fallback);
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function saveLocal(key, value) {
  save(key, value);
}

function deepMerge(base, override) {
  const out = structuredClone(base);
  Object.keys(override || {}).forEach((key) => {
    if (override[key] && typeof override[key] === "object" && !Array.isArray(override[key])) {
      out[key] = deepMerge(out[key] || {}, override[key]);
    } else {
      out[key] = override[key];
    }
  });
  return out;
}

function foodRecords() {
  return load(FOOD_KEY, {});
}

function bpRecords() {
  return normalizeBpRecords(load(BP_KEY, {}));
}

function settings() {
  return deepMerge(defaultSettings, load(SET_KEY, defaultSettings));
}

function syncSettings() {
  return load(SYNC_KEY, { url: "", enabled: false, lastSync: "", lastStatus: "" });
}

function saveSyncSettings(value) {
  saveLocal(SYNC_KEY, value);
}

function num(id) {
  const value = parseFloat(document.getElementById(id).value);
  return Number.isFinite(value) ? value : 0;
}

function optionalNum(id) {
  const raw = document.getElementById(id).value.trim();
  if (raw === "") return null;
  const value = parseFloat(raw);
  return Number.isFinite(value) ? value : null;
}

function setValue(id, value) {
  document.getElementById(id).value = value ?? "";
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => show(button.dataset.screen));
});

function show(id) {
  document.querySelectorAll(".screen").forEach((screen) => screen.classList.toggle("active", screen.id === id));
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.screen === id));
  if (id === "wifeView") {
    pullFromCloud({ silent: true }).finally(() => renderFoodView(viewDatePicker.value || today()));
  }
  if (id === "history") {
    renderHistory();
    refreshMetricOptions();
    drawChart();
  }
  if (id === "settings") renderSettings();
}

function evaluate(key, value) {
  const threshold = settings().thresholds[key];
  if (!threshold || threshold.enabled === false) return { level: "off", label: "記録", text: "評価OFF" };
  if (threshold.mode === "range") {
    if (value >= threshold.goodMin && value <= threshold.goodMax) return { level: "good", label: "良い", text: "良い" };
    if (value > threshold.warnMax) return { level: "bad", label: "悪い", text: "悪い" };
    return { level: "warn", label: "注意", text: "注意" };
  }
  if (value <= threshold.goodMax) return { level: "good", label: "良い", text: "良い" };
  if (value <= threshold.warnMax) return { level: "warn", label: "注意", text: "注意" };
  return { level: "bad", label: "悪い", text: "悪い" };
}

function scoreOf(record) {
  let score = 100;
  metrics.forEach((metric) => {
    const threshold = settings().thresholds[metric.key];
    if (threshold?.enabled === false) return;
    const result = evaluate(metric.key, record[metric.key] || 0);
    if (result.level === "warn") score -= 10;
    if (result.level === "bad") score -= 25;
  });
  return Math.max(0, score);
}

function faceOf(score) {
  if (score >= 90) return "♡";
  if (score >= 75) return "○";
  if (score >= 60) return "△";
  if (score >= 40) return "!";
  return "…";
}

function statusOf(score) {
  if (score >= 90) return "とても良い感じ";
  if (score >= 75) return "良い調子";
  if (score >= 60) return "少し注意";
  if (score >= 40) return "要注意";
  return "かなり注意";
}

function commentOf(record) {
  const good = [];
  const warn = [];
  const bad = [];
  metrics.forEach((metric) => {
    if (settings().thresholds[metric.key]?.enabled === false) return;
    const result = evaluate(metric.key, record[metric.key] || 0);
    if (result.level === "good") good.push(metric.name);
    if (result.level === "warn") warn.push(metric.name);
    if (result.level === "bad") bad.push(metric.name);
  });

  const praise = good.length
    ? `${good.slice(0, 3).join("・")}はよく管理できています。`
    : "今日も記録できたこと自体が大事な一歩です。";
  if (!bad.length && !warn.length) {
    return `${praise}\n腎臓くんも安心しています。この調子で、無理なく続けましょう。`;
  }
  if (bad.length) {
    return `${praise}\n${bad.join("・")}は少し高めなので、次の食事でやさしく調整しましょう。\n悪いところだけでなく、できているところもちゃんとあります。`;
  }
  return `${praise}\n${warn.join("・")}は注意ラインです。明日は少しだけ意識できれば十分です。`;
}

function renderFoodView(date = today()) {
  const record = foodRecords()[date];
  viewDatePicker.value = date;
  viewDate.textContent = jpDate(date);
  if (!record) {
    mainFace.textContent = viewFace.textContent = "♡";
    viewScore.textContent = "--点";
    viewStatus.textContent = "入力待ち";
    foodRows.innerHTML = "";
    foodComment.textContent = "食事データを入力すると、腎臓くんが良いところも見つけてコメントします。";
    return;
  }

  const score = scoreOf(record);
  mainFace.textContent = viewFace.textContent = faceOf(score);
  viewScore.textContent = `${score}点`;
  viewStatus.textContent = statusOf(score);
  foodRows.innerHTML = metrics
    .filter((metric) => metric.key !== "water" || settings().thresholds.water.enabled || record.water)
    .map((metric) => {
      const result = evaluate(metric.key, record[metric.key] || 0);
      return `<div class="food-row">
        <div class="name">${metric.icon} ${metric.name}</div>
        <div class="value">${record[metric.key] || 0} ${metric.unit}</div>
        <div class="judge ${result.level}">${result.label}</div>
      </div>`;
    })
    .join("");
  foodComment.textContent = commentOf(record);
}

function clearFoodInputs(keepDate = false) {
  ["energy", "protein", "salt", "potassium", "phosphorus", "water"].forEach((id) => setValue(id, ""));
  if (!keepDate) foodDate.value = today();
}

function fillFoodInputs(date) {
  clearFoodInputs(true);
  const record = foodRecords()[date];
  if (!record) return;
  ["energy", "protein", "salt", "potassium", "phosphorus", "water"].forEach((id) => setValue(id, record[id]));
}

function clearBpInputs(keepDate = false) {
  bpTimes.flatMap((time) => [`${time.key}Sys`, `${time.key}Dia`]).concat("bpMemo").forEach((id) => setValue(id, ""));
  if (!keepDate) bpDate.value = today();
}

function fillBpInputs(date) {
  clearBpInputs(true);
  const record = bpRecords()[date];
  if (!record) return;
  bpTimes.forEach((time) => {
    setValue(`${time.key}Sys`, record[time.key]?.sys);
    setValue(`${time.key}Dia`, record[time.key]?.dia);
  });
  setValue("bpMemo", record.memo);
}

saveFood.onclick = async () => {
  const date = foodDate.value || today();
  const records = foodRecords();
  records[date] = {
    energy: num("energy"),
    protein: num("protein"),
    salt: num("salt"),
    potassium: num("potassium"),
    phosphorus: num("phosphorus"),
    water: num("water")
  };
  saveLocal(FOOD_KEY, records);
  renderFoodView(date);
  clearFoodInputs();
  await pushToCloud({ silent: true });
  show("wifeView");
};

clearFood.onclick = () => clearFoodInputs(true);
loadFood.onclick = () => fillFoodInputs(foodDate.value || today());
foodDate.onchange = () => clearFoodInputs(true);
viewDatePicker.onchange = () => renderFoodView(viewDatePicker.value || today());

saveBp.onclick = async () => {
  const date = bpDate.value || today();
  const records = bpRecords();
  records[date] = {
    am: { sys: optionalNum("amSys"), dia: optionalNum("amDia") },
    noon: { sys: optionalNum("noonSys"), dia: optionalNum("noonDia") },
    pm: { sys: optionalNum("pmSys"), dia: optionalNum("pmDia") },
    memo: bpMemo.value || ""
  };
  saveLocal(BP_KEY, records);
  clearBpInputs();
  await pushToCloud({ silent: true });
  alert("血圧を保存しました");
  renderHistory();
};

clearBp.onclick = () => clearBpInputs(true);
loadBp.onclick = () => fillBpInputs(bpDate.value || today());
bpDate.onchange = () => clearBpInputs(true);

function renderHistory() {
  const foods = foodRecords();
  const foodKeys = Object.keys(foods).sort().reverse();
  foodHistory.innerHTML = foodKeys.length
    ? foodKeys.map((date) => {
      const score = scoreOf(foods[date]);
      return `<div class="history-item">
        <b>${jpDate(date).slice(5)}</b>
        <span>${metrics.slice(0, 5).map((metric) => `${metric.icon}${evaluate(metric.key, foods[date][metric.key] || 0).label[0]}`).join(" ")}</span>
        <b>${score}点</b>
      </div>`;
    }).join("")
    : "<p class='hint'>食事履歴はまだありません。</p>";

  const bps = bpRecords();
  const bpKeys = Object.keys(bps).sort().reverse();
  bpHistory.innerHTML = bpKeys.length
    ? bpKeys.map((date) => `<div class="history-item">
        <b>${jpDate(date).slice(5)}</b>
        <span>${bpTimes.map((time) => `${time.name} ${formatBpPair(bps[date][time.key])}`).join("　")}${bps[date].memo ? " / " + escapeHtml(bps[date].memo) : ""}</span>
        <b></b>
      </div>`).join("")
    : "<p class='hint'>血圧履歴はまだありません。</p>";

  renderAverages();
}

function renderAverages() {
  const foods = foodRecords();
  const dates = recentDates(7);
  const rows = metrics.map((metric) => {
    const values = dates.map((date) => foods[date]?.[metric.key]).filter((value) => Number.isFinite(value) && value > 0);
    const avg = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    return `<div class="average-item">
      <b>${metric.icon} ${metric.name}</b>
      <span>${values.length}日分の平均</span>
      <b>${avg === null ? "-" : round(avg)}${avg === null ? "" : metric.unit}</b>
    </div>`;
  });
  averageRows.innerHTML = rows.join("");
}

function recentDates(days) {
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    dates.push(new Date(date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10));
  }
  return dates;
}

graphType.onchange = () => {
  refreshMetricOptions();
  drawChart();
};
metricSelect.onchange = drawChart;
rangeSelect.onchange = drawChart;

function refreshMetricOptions() {
  const current = metricSelect.value;
  const options = graphType.value === "food"
    ? metrics.map((metric) => `<option value="${metric.key}">${metric.name}</option>`)
    : bpMetrics.map((metric) => `<option value="${metric.key}">${metric.name}</option>`);
  metricSelect.innerHTML = options.join("");
  if ([...metricSelect.options].some((option) => option.value === current)) metricSelect.value = current;
}

function drawChart() {
  const ctx = chart.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = chart.getBoundingClientRect();
  chart.width = Math.max(320, Math.floor(rect.width * dpr));
  chart.height = Math.floor(260 * dpr);
  ctx.scale(dpr, dpr);
  const width = chart.width / dpr;
  const height = chart.height / dpr;
  ctx.clearRect(0, 0, width, height);

  const range = parseInt(rangeSelect.value, 10);
  const dates = recentDates(range);
  const isFood = graphType.value === "food";
  const metricKey = metricSelect.value || (isFood ? "energy" : "sys");
  const source = isFood ? foodRecords() : bpRecords();

  if (isFood) {
    const values = dates.map((date) => source[date]?.[metricKey] || 0);
    const metric = metrics.find((item) => item.key === metricKey) || metrics[0];
    const target = targetLineFor(metricKey);
    drawSingleSeries(ctx, { dates, values, width, height, label: metric.name, unit: metric.unit, target });
  } else {
    const bpPoints = [];
    dates.forEach((date) => {
      bpTimes.forEach((time) => {
        bpPoints.push({
          label: `${date.slice(5).replace("-", "/")} ${time.name}`,
          value: source[date]?.[time.key]?.[metricKey] ?? null
        });
      });
    });
    const metric = bpMetrics.find((item) => item.key === metricKey) || bpMetrics[0];
    drawBpSeries(ctx, { points: bpPoints, width, height, label: metric.name, unit: metric.unit });
  }
}

function targetLineFor(key) {
  const threshold = settings().thresholds[key];
  if (!threshold || threshold.enabled === false) return null;
  return threshold.mode === "range" ? threshold.goodMax : threshold.goodMax;
}

function chartBase(ctx, width, height, max) {
  const pad = { left: 34, right: 12, top: 22, bottom: 32 };
  const graphWidth = width - pad.left - pad.right;
  const graphHeight = height - pad.top - pad.bottom;
  ctx.strokeStyle = "#ead8ca";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + graphHeight);
  ctx.lineTo(pad.left + graphWidth, pad.top + graphHeight);
  ctx.stroke();
  ctx.fillStyle = "#756767";
  ctx.font = "12px sans-serif";
  ctx.fillText(String(Math.round(max)), 4, pad.top + 4);
  ctx.fillText("0", 18, pad.top + graphHeight);
  return { pad, graphWidth, graphHeight };
}

function drawSingleSeries(ctx, options) {
  const { dates, values, width, height, label, unit, target } = options;
  const max = Math.max(...values, target || 0, 1) * 1.18;
  const base = chartBase(ctx, width, height, max);
  if (target) drawTargetLine(ctx, base, width, max, target);
  drawLine(ctx, values, base, max, "#ff8f83");
  drawBottomLabels(ctx, dates, base);
  ctx.fillStyle = "#3f2f2f";
  ctx.font = "13px sans-serif";
  ctx.fillText(`${label} (${unit})`, base.pad.left, 15);
  chartHint.textContent = "設定した目標線または上限線を一緒に表示します。";
}

function drawBpSeries(ctx, options) {
  const { points, width, height, label, unit } = options;
  const values = points.map((point) => point.value);
  const measured = values.filter((value) => Number.isFinite(value) && value > 0);
  const max = Math.max(...measured, 1) * 1.18;
  const base = chartBase(ctx, width, height, max);
  drawLine(ctx, values, base, max, "#5e8cc7");
  drawPointLabels(ctx, points, base);
  ctx.fillStyle = "#3f2f2f";
  ctx.font = "13px sans-serif";
  ctx.fillText(`${label} (${unit})`, base.pad.left, 15);
  chartHint.textContent = "未測定は空欄として扱い、グラフ上に点を表示しません。";
}

function drawLine(ctx, values, base, max, color) {
  const { pad, graphWidth, graphHeight } = base;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  let hasStarted = false;
  values.forEach((value, index) => {
    if (!Number.isFinite(value) || value <= 0) {
      hasStarted = false;
      return;
    }
    const x = pad.left + graphWidth * (index / (values.length - 1 || 1));
    const y = pad.top + graphHeight - (value / max) * graphHeight;
    if (!hasStarted) {
      ctx.moveTo(x, y);
      hasStarted = true;
    }
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  values.forEach((value, index) => {
    if (!Number.isFinite(value) || value <= 0) return;
    const x = pad.left + graphWidth * (index / (values.length - 1 || 1));
    const y = pad.top + graphHeight - (value / max) * graphHeight;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawTargetLine(ctx, base, width, max, target) {
  const { pad, graphHeight } = base;
  const y = pad.top + graphHeight - (target / max) * graphHeight;
  ctx.strokeStyle = "#4f9f70";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(pad.left, y);
  ctx.lineTo(width - pad.right, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#4f9f70";
  ctx.font = "12px sans-serif";
  ctx.fillText(`目標 ${target}`, pad.left + 4, Math.max(12, y - 4));
}

function drawBottomLabels(ctx, dates, base) {
  const { pad, graphWidth, graphHeight } = base;
  ctx.fillStyle = "#756767";
  ctx.font = "11px sans-serif";
  const indices = [0, Math.floor((dates.length - 1) / 2), dates.length - 1];
  indices.forEach((index) => {
    const x = pad.left + graphWidth * (index / (dates.length - 1 || 1));
    const label = dates[index].slice(5).replace("-", "/");
    ctx.fillText(label, Math.min(x, pad.left + graphWidth - 28), pad.top + graphHeight + 20);
  });
}

function drawPointLabels(ctx, points, base) {
  const { pad, graphWidth, graphHeight } = base;
  ctx.fillStyle = "#756767";
  ctx.font = "10px sans-serif";
  const indices = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  indices.forEach((index) => {
    const x = pad.left + graphWidth * (index / (points.length - 1 || 1));
    ctx.fillText(points[index].label, Math.min(x, pad.left + graphWidth - 48), pad.top + graphHeight + 20);
  });
}

function renderSettings() {
  const current = settings();
  const sync = syncSettings();
  height.value = current.profile.height || "";
  weight.value = current.profile.weight || "";
  standardWeight.value = current.profile.standardWeight || "";
  syncUrl.value = sync.url || "";
  syncEnabled.checked = sync.enabled !== false && Boolean(sync.url);
  renderSyncStatus(sync.lastStatus || (sync.url ? "同期設定済み" : "未設定"));
  thresholdEditor.innerHTML = metrics.map((metric) => {
    const threshold = current.thresholds[metric.key] || {};
    const rangeFields = threshold.mode === "range"
      ? `<label>良い 下限<input inputmode="decimal" type="number" data-th="${metric.key}" data-field="goodMin" value="${threshold.goodMin ?? ""}"></label>`
      : "";
    return `<div class="threshold-row">
      <b>${metric.icon} ${metric.name} (${metric.unit})</b>
      <div class="threshold-grid">
        ${rangeFields}
        <label>良い 上限<input inputmode="decimal" type="number" data-th="${metric.key}" data-field="goodMax" value="${threshold.goodMax ?? ""}"></label>
        <label>注意 上限<input inputmode="decimal" type="number" data-th="${metric.key}" data-field="warnMax" value="${threshold.warnMax ?? ""}"></label>
        <label class="inline-check wide"><input type="checkbox" data-th="${metric.key}" data-field="enabled" ${threshold.enabled !== false ? "checked" : ""}>評価する</label>
      </div>
    </div>`;
  }).join("");
}

calcRecommend.onclick = () => {
  const h = parseFloat(height.value);
  const w = parseFloat(weight.value);
  if (!h || !w) {
    alert("身長と体重を入力してください");
    return;
  }
  const std = (h / 100) * (h / 100) * 22;
  standardWeight.value = std.toFixed(1);
  const current = settings();
  current.profile = { height: height.value, weight: weight.value, standardWeight: standardWeight.value };
  saveLocal(SET_KEY, current);
  alert(`標準体重の目安は約 ${std.toFixed(1)} kgです。\n評価基準は個人差が大きいため、必要に応じて下の数値を変更してください。`);
};

saveSettings.onclick = () => {
  const current = settings();
  current.profile = { height: height.value, weight: weight.value, standardWeight: standardWeight.value };
  document.querySelectorAll("[data-th]").forEach((input) => {
    const key = input.dataset.th;
    const field = input.dataset.field;
    if (!current.thresholds[key]) current.thresholds[key] = {};
    if (field === "enabled") {
      current.thresholds[key][field] = input.checked;
    } else {
      const value = parseFloat(input.value);
      if (Number.isFinite(value)) current.thresholds[key][field] = value;
    }
  });
  saveLocal(SET_KEY, current);
  pushToCloud({ silent: true });
  alert("設定を保存しました");
  renderFoodView(viewDatePicker.value || today());
  refreshMetricOptions();
  drawChart();
};

saveSync.onclick = () => {
  const current = syncSettings();
  if (syncUrl.value.trim()) syncEnabled.checked = true;
  const next = {
    ...current,
    url: syncUrl.value.trim(),
    enabled: syncEnabled.checked && Boolean(syncUrl.value.trim()),
    lastStatus: syncUrl.value.trim() ? "同期設定を保存しました" : "同期URLが未設定です"
  };
  saveSyncSettings(next);
  renderSyncStatus(next.lastStatus);
};

syncUrl.oninput = () => {
  if (syncUrl.value.trim()) syncEnabled.checked = true;
};

pullSync.onclick = () => pullFromCloud({ silent: false });
pushSync.onclick = () => pushToCloud({ silent: false });

makeShareCode.onclick = () => {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    food: foodRecords(),
    bp: bpRecords(),
    settings: settings()
  };
  shareCode.value = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
};

importShareCode.onclick = () => {
  if (!shareCode.value.trim()) {
    alert("共有コードを入力してください");
    return;
  }
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(shareCode.value.trim()))));
    if (data.food) saveLocal(FOOD_KEY, data.food);
    if (data.bp) saveLocal(BP_KEY, normalizeBpRecords(data.bp));
    if (data.settings) saveLocal(SET_KEY, deepMerge(defaultSettings, data.settings));
    alert("共有コードを読み込みました");
    renderFoodView(viewDatePicker.value || today());
    renderHistory();
    renderSettings();
    drawChart();
  } catch {
    alert("共有コードを読み込めませんでした");
  }
};

function normalizeBpRecords(records) {
  const normalized = {};
  Object.entries(records || {}).forEach(([date, record]) => {
    normalized[date] = {
      am: normalizeBpSlot(record.am, record.amSys, record.amDia),
      noon: normalizeBpSlot(record.noon, record.noonSys, record.noonDia),
      pm: normalizeBpSlot(record.pm, record.pmSys, record.pmDia),
      memo: record.memo || ""
    };
  });
  return normalized;
}

function normalizeBpSlot(slot, legacySys, legacyDia) {
  return {
    sys: toNullableNumber(slot?.sys ?? legacySys),
    dia: toNullableNumber(slot?.dia ?? legacyDia)
  };
}

function toNullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function formatBpPair(slot) {
  const sys = slot?.sys ?? "-";
  const dia = slot?.dia ?? "-";
  return `${sys}/${dia}`;
}

function localSnapshot() {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    food: foodRecords(),
    bp: bpRecords(),
    settings: settings()
  };
}

function mergeRecords(local, remote) {
  return { ...(remote || {}), ...(local || {}) };
}

function applySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return;
  if (snapshot.food) saveLocal(FOOD_KEY, mergeRecords(foodRecords(), snapshot.food));
  if (snapshot.bp) saveLocal(BP_KEY, normalizeBpRecords(mergeRecords(bpRecords(), snapshot.bp)));
  if (snapshot.settings) saveLocal(SET_KEY, deepMerge(defaultSettings, snapshot.settings));
}

async function cloudRequest(action, payload = {}) {
  const sync = syncSettings();
  if (!sync.url || sync.enabled === false) return null;
  const response = await fetch(sync.url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload })
  });
  if (!response.ok) throw new Error("同期先に接続できませんでした");
  return response.json();
}

async function pullFromCloud({ silent } = { silent: true }) {
  const sync = syncSettings();
  if (!sync.url || sync.enabled === false) return;
  try {
    const result = await cloudRequest("pull");
    if (result?.data) applySnapshot(result.data);
    setSyncStatus("スプレッドシートから読み込みました");
    refreshAll();
    if (!silent) alert("スプレッドシートから読み込みました");
  } catch (error) {
    setSyncStatus(`同期読込エラー: ${error.message}`);
    if (!silent) alert("同期読込に失敗しました。URLとApps Scriptの公開設定を確認してください。");
  }
}

async function pushToCloud({ silent } = { silent: true }) {
  const sync = syncSettings();
  if (!sync.url || sync.enabled === false) return;
  try {
    const current = await cloudRequest("pull");
    if (current?.data) applySnapshot(current.data);
    await cloudRequest("push", { data: localSnapshot() });
    setSyncStatus("スプレッドシートへ保存しました");
    if (!silent) alert("スプレッドシートへ保存しました");
  } catch (error) {
    setSyncStatus(`同期保存エラー: ${error.message}`);
    if (!silent) alert("同期保存に失敗しました。URLとApps Scriptの公開設定を確認してください。");
  }
}

function setSyncStatus(message) {
  const sync = syncSettings();
  sync.lastSync = new Date().toISOString();
  sync.lastStatus = message;
  saveSyncSettings(sync);
  renderSyncStatus(message);
}

function renderSyncStatus(message) {
  if (!document.getElementById("syncStatus")) return;
  syncStatus.textContent = message || "";
}

function refreshAll() {
  renderFoodView(viewDatePicker.value || today());
  renderHistory();
  renderSettings();
  refreshMetricOptions();
  drawChart();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function round(value) {
  return Math.round(value * 10) / 10;
}

(function init() {
  saveLocal(BP_KEY, bpRecords());
  foodDate.value = today();
  bpDate.value = today();
  viewDatePicker.value = today();
  clearFoodInputs(true);
  clearBpInputs(true);
  refreshMetricOptions();
  renderFoodView(today());
  renderHistory();
  renderSettings();
  pullFromCloud({ silent: true });
  requestAnimationFrame(drawChart);
})();
