import { useState, useEffect, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

// ── Sub-components ──────────────────────────────────────────────────────────

function Field({ label, type = "text", value, onChange, placeholder, mono, hint }) {
  return (
    <div className="field">
      <label>{label}</label>
      {hint && <span className="hint">{hint}</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        style={mono ? { fontFamily: "monospace" } : {}}
      />
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    idle:      { color: "#6b7280", dot: "#6b7280",  label: "Idle" },
    created:   { color: "#3b82f6", dot: "#3b82f6",  label: "Created" },
    pending:   { color: "#f59e0b", dot: "#f59e0b",  label: "Pending…" },
    running:   { color: "#f59e0b", dot: "#fbbf24",  label: "Running…", blink: true },
    completed: { color: "#10b981", dot: "#10b981",  label: "Completed ✓" },
    failed:    { color: "#ef4444", dot: "#ef4444",  label: "Failed ✗" },
  };
  const s = map[status] || map.idle;
  return (
    <span style={{ color: s.color, fontFamily: "monospace", fontSize: "0.82rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.dot, display: "inline-block", animation: s.blink ? "blink 1s step-end infinite" : "none" }} />
      {s.label}
    </span>
  );
}

// ── Scenarios ────────────────────────────────────────────────────────────────

const SCENARIOS = {
  load:   { label: "Load",   icon: "📈", desc: "Constant VUs — ramp up, hold, ramp down",         suggestVus: 50,  suggestDur: 120  },
  spike:  { label: "Spike",  icon: "⚡", desc: "Sudden spike — baseline, burst, then recovery",    suggestVus: 200, suggestDur: 90   },
  stress: { label: "Stress", icon: "🔥", desc: "Progressive ramp — increase load until failure",   suggestVus: 300, suggestDur: 300  },
  soak:   { label: "Soak",   icon: "🕐", desc: "Endurance — sustained load over long duration",    suggestVus: 30,  suggestDur: 3600 },
  custom: { label: "Custom", icon: "🎛️", desc: "Manual — set VUs and duration freely",             suggestVus: null, suggestDur: null },
};

function computeStages(scenario, vus, duration) {
  const v = Math.max(1, vus);
  const d = Math.max(10, duration);
  switch (scenario) {
    case "load":
      return [
        { duration: `${Math.max(5, Math.floor(d * 0.15))}s`, target: v },
        { duration: `${Math.max(5, Math.floor(d * 0.75))}s`, target: v },
        { duration: `${Math.max(5, Math.floor(d * 0.10))}s`, target: 0 },
      ];
    case "spike":
      return [
        { duration: "15s",                                    target: Math.max(1, Math.floor(v * 0.05)) },
        { duration: "15s",                                    target: v },
        { duration: `${Math.max(10, d - 50)}s`,               target: v },
        { duration: "10s",                                    target: Math.max(1, Math.floor(v * 0.05)) },
        { duration: "10s",                                    target: 0 },
      ];
    case "stress":
      return [
        { duration: `${Math.floor(d * 0.20)}s`, target: Math.floor(v * 0.25) },
        { duration: `${Math.floor(d * 0.20)}s`, target: Math.floor(v * 0.50) },
        { duration: `${Math.floor(d * 0.20)}s`, target: Math.floor(v * 0.75) },
        { duration: `${Math.floor(d * 0.30)}s`, target: v },
        { duration: `${Math.floor(d * 0.10)}s`, target: 0 },
      ];
    case "soak":
      return [
        { duration: `${Math.max(30, Math.floor(d * 0.05))}s`, target: v },
        { duration: `${Math.floor(d * 0.90)}s`,               target: v },
        { duration: `${Math.max(30, Math.floor(d * 0.05))}s`, target: 0 },
      ];
    default: // custom
      return [
        { duration: "5s",  target: v },
        { duration: `${d}s`, target: v },
        { duration: "5s",  target: 0 },
      ];
  }
}

const STORAGE_KEY = "perfstack_services";

function loadServices() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveServices(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [form, setForm] = useState({
    iam_url:       "",
    client_id:     "",
    client_secret: "",
    target_url:    "",
    payload:       '{\n  "key": "value"\n}',
    vus:           10,
    duration:      60,
  });

  const [status,      setStatus]      = useState("idle");
  const [jobName,     setJobName]     = useState(null);
  const [message,     setMessage]     = useState("");
  const [loading,     setLoading]     = useState(false);
  const [jsonError,   setJsonError]   = useState("");
  const [showGrafana, setShowGrafana] = useState(false);
  const [scenario,    setScenario]    = useState("load");

  const selectScenario = (key) => {
    setScenario(key);
    const s = SCENARIOS[key];
    if (s.suggestVus)  setForm(f => ({ ...f, vus:      s.suggestVus  }));
    if (s.suggestDur)  setForm(f => ({ ...f, duration: s.suggestDur  }));
  };

  const [services,    setServices]    = useState(loadServices);
  const [saveName,    setSaveName]    = useState("");
  const [activeIdx,   setActiveIdx]   = useState(null);
  const importRef = useRef(null);
  const pollingRef = useRef(null);

  const persistServices = (list) => { saveServices(list); setServices(list); };

  const saveService = () => {
    const name = saveName.trim();
    if (!name) return;
    const entry = { name, ...form };
    const idx = services.findIndex(s => s.name === name);
    const updated = idx >= 0
      ? services.map((s, i) => i === idx ? entry : s)
      : [...services, entry];
    persistServices(updated);
    setActiveIdx(updated.findIndex(s => s.name === name));
    setSaveName("");
  };

  const loadService = (idx) => {
    const { name, ...config } = services[idx];
    setForm(config);
    setActiveIdx(idx);
  };

  const deleteService = (idx) => {
    const updated = services.filter((_, i) => i !== idx);
    persistServices(updated);
    if (activeIdx === idx) setActiveIdx(null);
  };

  const exportServices = () => {
    const blob = new Blob([JSON.stringify(services, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "perfstack-services.json";
    a.click();
  };

  const importServices = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (Array.isArray(data)) { persistServices(data); setActiveIdx(null); }
      } catch { /* invalid file */ }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  // Validate JSON as user types
  useEffect(() => {
    try { JSON.parse(form.payload); setJsonError(""); }
    catch { setJsonError("Invalid JSON"); }
  }, [form.payload]);

  const runTest = async () => {
    if (jsonError) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/api/run-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          payload: JSON.parse(form.payload),
          scenario,
          stages: computeStages(scenario, form.vus, form.duration),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Unknown error");
      setJobName(data.job_name);
      setStatus(data.status);
      setMessage(data.message);
      startPolling(data.job_name);
    } catch (e) {
      setStatus("failed");
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (name) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${API_BASE}/api/test-status/${name}`);
        const data = await res.json();
        setStatus(data.status);
        setMessage(data.message);
        if (data.status === "completed" || data.status === "failed")
          clearInterval(pollingRef.current);
      } catch { /* ignore transient errors */ }
    }, 3000);
  };

  useEffect(() => () => clearInterval(pollingRef.current), []);

  const canRun = !loading && status !== "running" && !jsonError &&
    form.iam_url && form.client_id && form.client_secret && form.target_url;

  const downloadReport = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/test-summary/${jobName}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      openHtmlReport(data);
    } catch (e) {
      alert(`Could not fetch report: ${e.message}`);
    }
  };

  const openHtmlReport = (data) => {
    const m = data.meta || {};
    const metrics = data.metrics || {};
    const ms = (v) => v == null ? "—" : `${Number(v).toFixed(2)} ms`;
    const num = (v, d = 2) => v == null ? "—" : Number(v).toFixed(d);

    const dur     = metrics["http_req_duration"] || {};
    const reqs    = metrics["http_reqs"] || {};
    const failed  = metrics["http_req_failed"] || {};
    const vusMax  = metrics["vus_max"] || {};
    const blocked = metrics["http_req_blocked"] || {};
    const connect = metrics["http_req_connecting"] || {};
    const waiting = metrics["http_req_waiting"] || {};
    const recv    = metrics["http_req_receiving"] || {};
    const send    = metrics["http_req_sending"] || {};
    const tls     = metrics["http_req_tls_handshaking"] || {};
    const iters   = metrics["iterations"] || {};
    const iterDur = metrics["iteration_duration"] || {};

    const errorRate  = (failed.rate || 0) * 100;
    const errorColor = errorRate === 0 ? "#29BEB0" : errorRate < 5 ? "#F5A623" : "#F25B2A";

    // Threshold badges
    const thresholds = data.thresholds || {};
    const threshBadges = Object.entries(thresholds).map(([metric, results]) =>
      Object.entries(results).map(([expr, ok]) =>
        `<div class="thresh-badge ${ok ? "pass" : "fail"}">
           <span class="thresh-icon">${ok ? "✓" : "✗"}</span>
           <span class="thresh-metric">${metric}</span>
           <span class="thresh-expr">${expr}</span>
         </div>`
      ).join("")
    ).join("") || '<div class="thresh-badge pass"><span class="thresh-icon">—</span><span class="thresh-metric">No thresholds defined</span></div>';

    // Waterfall timing breakdown (avg values)
    const waterfall = [
      { label: "DNS Lookup",     val: blocked.avg  || 0, color: "#7D64FF" },
      { label: "TCP Connect",    val: connect.avg  || 0, color: "#5794F2" },
      { label: "TLS Handshake",  val: tls.avg      || 0, color: "#73BF69" },
      { label: "Req Send",       val: send.avg     || 0, color: "#F2CC0C" },
      { label: "Waiting (TTFB)", val: waiting.avg  || 0, color: "#F25B2A" },
      { label: "Receiving",      val: recv.avg     || 0, color: "#29BEB0" },
    ];
    const totalWf = waterfall.reduce((a, b) => a + b.val, 0) || 1;
    const wfBars = waterfall.map(w => {
      const pct = Math.max(1, (w.val / totalWf) * 100).toFixed(1);
      return `<div class="wf-row">
        <span class="wf-label">${w.label}</span>
        <div class="wf-bar-wrap">
          <div class="wf-bar" style="width:${pct}%;background:${w.color}"></div>
        </div>
        <span class="wf-val">${w.val.toFixed(2)} ms</span>
      </div>`;
    }).join("");

    // All metrics table
    const skipInTable = new Set(["http_req_duration","http_reqs","http_req_failed","vus","vus_max",
      "http_req_blocked","http_req_connecting","http_req_waiting","http_req_receiving",
      "http_req_sending","http_req_tls_handshaking","iterations","iteration_duration"]);
    const extraRows = Object.entries(metrics)
      .filter(([k]) => !skipInTable.has(k))
      .map(([key, val]) => {
        const v = val || {};
        const cells = ["avg","min","med","max","p(90)","p(95)","p(99)","count","rate","value"]
          .filter(k => v[k] != null)
          .map(k => `<td>${typeof v[k] === "number" ? v[k].toFixed(3) : v[k]}</td>`)
          .join("");
        const headers = ["avg","min","med","max","p(90)","p(95)","p(99)","count","rate","value"]
          .filter(k => v[k] != null);
        return `<tr><td class="mt-name">${key}</td>${cells}</tr>`;
      }).join("");

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>k6 Report — ${m.target_url || "PerfStack"}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',system-ui,sans-serif;background:#0E0E1A;color:#D8D9E4;font-size:13px}
  a{color:#7D64FF}

  /* ── Header ── */
  .hdr{background:#15151F;border-bottom:1px solid #22224A;padding:18px 32px;display:flex;align-items:center;justify-content:space-between}
  .hdr-logo{display:flex;align-items:center;gap:10px}
  .hdr-logo svg{flex-shrink:0}
  .hdr-title{font-size:18px;font-weight:700;color:#fff;letter-spacing:-.01em}
  .hdr-sub{font-size:11px;color:#666;margin-top:2px}
  .hdr-btn{background:#7D64FF;color:#fff;border:none;border-radius:6px;padding:8px 20px;font-size:12px;font-weight:600;cursor:pointer;letter-spacing:.04em}
  .hdr-btn:hover{background:#9175FF}

  /* ── Layout ── */
  .page{max-width:1100px;margin:0 auto;padding:28px 32px}

  /* ── Test Info ── */
  .info-bar{background:#15151F;border:1px solid #22224A;border-radius:8px;padding:16px 20px;display:flex;gap:32px;flex-wrap:wrap;margin-bottom:24px}
  .info-item label{font-size:10px;color:#555;text-transform:uppercase;letter-spacing:.08em;display:block;margin-bottom:3px}
  .info-item span{font-size:12px;font-family:'Courier New',monospace;color:#C0C0D0;word-break:break-all}

  /* ── Hero KPIs ── */
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
  .kpi{background:#15151F;border:1px solid #22224A;border-radius:8px;padding:18px 20px;position:relative;overflow:hidden}
  .kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--accent,#7D64FF)}
  .kpi-label{font-size:10px;color:#555;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
  .kpi-value{font-size:26px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;line-height:1}
  .kpi-unit{font-size:12px;color:#555;margin-top:4px}
  .kpi-sub{font-size:11px;color:#444;margin-top:6px;font-family:monospace}

  /* ── Section ── */
  .section{margin-bottom:24px}
  .section-title{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#555;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #1A1A2E}

  /* ── Response Time Panel ── */
  .rt-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px}
  .rt-card{background:#15151F;border:1px solid #22224A;border-radius:6px;padding:14px 16px;text-align:center}
  .rt-card .label{font-size:10px;color:#555;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
  .rt-card .value{font-size:20px;font-weight:700;color:#7D64FF;font-variant-numeric:tabular-nums}
  .rt-card .unit{font-size:11px;color:#444}

  /* ── Gauge bar ── */
  .gauge-row{display:flex;align-items:center;gap:12px;background:#15151F;border:1px solid #22224A;border-radius:6px;padding:12px 16px;margin-bottom:8px}
  .gauge-name{width:80px;font-size:11px;color:#888;flex-shrink:0}
  .gauge-wrap{flex:1;background:#1E1E30;border-radius:100px;height:8px;overflow:hidden}
  .gauge-fill{height:8px;border-radius:100px;transition:width .4s}
  .gauge-val{width:80px;text-align:right;font-size:11px;font-family:monospace;color:#C0C0D0;flex-shrink:0}

  /* ── Waterfall ── */
  .wf-row{display:flex;align-items:center;gap:10px;margin-bottom:6px}
  .wf-label{width:140px;font-size:11px;color:#888;flex-shrink:0}
  .wf-bar-wrap{flex:1;background:#1E1E30;border-radius:3px;height:18px;overflow:hidden}
  .wf-bar{height:18px;border-radius:3px;min-width:2px}
  .wf-val{width:80px;text-align:right;font-size:11px;font-family:monospace;color:#C0C0D0;flex-shrink:0}

  /* ── Thresholds ── */
  .thresh-grid{display:flex;flex-wrap:wrap;gap:8px}
  .thresh-badge{display:flex;align-items:center;gap:8px;background:#15151F;border:1px solid #22224A;border-radius:6px;padding:8px 14px;font-size:11px}
  .thresh-badge.pass{border-color:#29BEB044}
  .thresh-badge.fail{border-color:#F25B2A44;background:#1F1510}
  .thresh-icon{font-size:14px;font-weight:700}
  .thresh-badge.pass .thresh-icon{color:#29BEB0}
  .thresh-badge.fail .thresh-icon{color:#F25B2A}
  .thresh-metric{color:#C0C0D0;font-weight:600}
  .thresh-expr{color:#555;font-family:monospace}

  /* ── All Metrics Table ── */
  .mt{width:100%;border-collapse:collapse;font-size:11px}
  .mt th{text-align:left;padding:6px 10px;color:#444;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #1A1A2E;font-weight:500}
  .mt td{padding:7px 10px;border-bottom:1px solid #15151F;font-family:monospace;color:#9090A0}
  .mt td.mt-name{color:#7D64FF;font-weight:600}
  .mt tr:hover td{background:#15151F}

  /* ── Print ── */
  @media print{
    body{background:#fff;color:#000}
    .hdr{background:#fff;border-color:#ddd}
    .hdr-title{color:#000}
    .hdr-btn{display:none}
    .page{padding:16px}
    .kpi,.rt-card,.info-bar,.thresh-badge,.gauge-row{background:#f9f9f9;border-color:#ddd}
    .kpi-value,.rt-card .value{color:#7D64FF}
    .gauge-wrap,.wf-bar-wrap{background:#eee}
    .mt td,.mt th{border-color:#eee}
    .section-title{color:#888;border-color:#ddd}
  }
</style></head>
<body>
<div class="hdr">
  <div class="hdr-logo">
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#7D64FF"/>
      <path d="M8 22L13 12L17 18L20 14L24 22" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <div>
      <div class="hdr-title">k6 Performance Report</div>
      <div class="hdr-sub">Generated by PerfStack · ${new Date().toLocaleString()}</div>
    </div>
  </div>
  <button class="hdr-btn no-print" onclick="window.print()">⬇ Save as PDF</button>
</div>

<div class="page">

  <!-- Test Info -->
  <div class="info-bar">
    <div class="info-item"><label>Target URL</label><span>${m.target_url || "—"}</span></div>
    <div class="info-item"><label>Scenario</label><span>${m.scenario || "—"}</span></div>
    <div class="info-item"><label>Virtual Users</label><span>${m.vus || "—"} VUs</span></div>
    <div class="info-item"><label>Duration</label><span>${m.duration || "—"} s</span></div>
    <div class="info-item"><label>Timestamp</label><span>${m.timestamp ? new Date(m.timestamp).toLocaleString() : "—"}</span></div>
  </div>

  <!-- Hero KPIs -->
  <div class="kpis">
    <div class="kpi" style="--accent:#7D64FF">
      <div class="kpi-label">Total Requests</div>
      <div class="kpi-value">${reqs.count != null ? Math.round(reqs.count).toLocaleString() : "—"}</div>
      <div class="kpi-unit">requests</div>
      <div class="kpi-sub">${num(reqs.rate)} req/s avg</div>
    </div>
    <div class="kpi" style="--accent:${errorColor}">
      <div class="kpi-label">Error Rate</div>
      <div class="kpi-value" style="color:${errorColor}">${errorRate.toFixed(2)}<span style="font-size:16px">%</span></div>
      <div class="kpi-unit">of requests failed</div>
      <div class="kpi-sub">${failed.fails != null ? Math.round(failed.fails) : "—"} failed requests</div>
    </div>
    <div class="kpi" style="--accent:#5794F2">
      <div class="kpi-label">Avg Response Time</div>
      <div class="kpi-value">${dur.avg != null ? Math.round(dur.avg) : "—"}</div>
      <div class="kpi-unit">milliseconds</div>
      <div class="kpi-sub">p95 = ${ms(dur["p(95)"])}</div>
    </div>
    <div class="kpi" style="--accent:#29BEB0">
      <div class="kpi-label">Peak VUs</div>
      <div class="kpi-value">${vusMax.max != null ? Math.round(vusMax.max) : "—"}</div>
      <div class="kpi-unit">virtual users</div>
      <div class="kpi-sub">${iters.count != null ? Math.round(iters.count).toLocaleString() : "—"} iterations</div>
    </div>
  </div>

  <!-- Response Time -->
  <div class="section">
    <div class="section-title">Response Time Distribution</div>
    <div class="rt-grid">
      <div class="rt-card"><div class="label">Min</div><div class="value">${dur.min != null ? Math.round(dur.min) : "—"}</div><div class="unit">ms</div></div>
      <div class="rt-card"><div class="label">Median (p50)</div><div class="value">${dur.med != null ? Math.round(dur.med) : "—"}</div><div class="unit">ms</div></div>
      <div class="rt-card"><div class="label">p90</div><div class="value">${dur["p(90)"] != null ? Math.round(dur["p(90)"]) : "—"}</div><div class="unit">ms</div></div>
      <div class="rt-card"><div class="label">p95</div><div class="value">${dur["p(95)"] != null ? Math.round(dur["p(95)"]) : "—"}</div><div class="unit">ms</div></div>
      <div class="rt-card"><div class="label">p99</div><div class="value">${dur["p(99)"] != null ? Math.round(dur["p(99)"]) : "—"}</div><div class="unit">ms</div></div>
      <div class="rt-card"><div class="label">Avg</div><div class="value">${dur.avg != null ? Math.round(dur.avg) : "—"}</div><div class="unit">ms</div></div>
      <div class="rt-card"><div class="label">Max</div><div class="value" style="color:#F25B2A">${dur.max != null ? Math.round(dur.max) : "—"}</div><div class="unit">ms</div></div>
      <div class="rt-card"><div class="label">Iter Duration</div><div class="value">${iterDur.avg != null ? Math.round(iterDur.avg) : "—"}</div><div class="unit">ms avg</div></div>
    </div>
  </div>

  <!-- Request Rate Gauges -->
  <div class="section">
    <div class="section-title">Request Throughput</div>
    ${[
      { label: "Total req/s", val: reqs.rate || 0, max: (reqs.rate || 0) * 1.5, color: "#7D64FF" },
      { label: "Success/s",   val: (reqs.rate || 0) * (1 - (failed.rate || 0)), max: (reqs.rate || 0) * 1.5, color: "#29BEB0" },
      { label: "Failed/s",    val: (reqs.rate || 0) * (failed.rate || 0), max: Math.max((reqs.rate || 0) * 0.2, 1), color: "#F25B2A" },
    ].map(g => {
      const pct = Math.min(100, ((g.val / (g.max || 1)) * 100)).toFixed(1);
      return `<div class="gauge-row">
        <span class="gauge-name">${g.label}</span>
        <div class="gauge-wrap"><div class="gauge-fill" style="width:${pct}%;background:${g.color}"></div></div>
        <span class="gauge-val">${g.val.toFixed(2)} /s</span>
      </div>`;
    }).join("")}
  </div>

  <!-- Timing Waterfall -->
  <div class="section">
    <div class="section-title">Request Timing Breakdown (avg)</div>
    ${wfBars}
    <div style="margin-top:6px;font-size:10px;color:#444">Total avg: ${totalWf.toFixed(2)} ms</div>
  </div>

  <!-- Thresholds -->
  <div class="section">
    <div class="section-title">Thresholds</div>
    <div class="thresh-grid">${threshBadges}</div>
  </div>

  <!-- All Metrics -->
  ${extraRows ? `<div class="section">
    <div class="section-title">Custom Metrics</div>
    <table class="mt">
      <tr><th>Metric</th><th>avg</th><th>min</th><th>med</th><th>max</th><th>p(90)</th><th>p(95)</th><th>p(99)</th><th>count/rate</th></tr>
      ${extraRows}
    </table>
  </div>` : ""}

</div>
</body></html>`;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
  };

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0d1117; color: #e6edf3; font-family: 'IBM Plex Mono', 'Fira Code', monospace; font-size: 13px; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

        .app { min-height: 100vh; display: flex; flex-direction: column; }

        header {
          background: #010409; border-bottom: 2px solid #c73000;
          padding: 0 28px; height: 44px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .logo { color: #c73000; font-weight: 700; font-size: 13px; letter-spacing: .08em; }
        .logo-sub { color: #3a3830; font-size: 10px; margin-left: 10px; }
        .header-right { font-size: 10px; color: #3a3830; letter-spacing: .06em; }

        main { flex: 1; padding: 28px; max-width: 820px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: 16px; }

        .panel {
          background: #161b22; border: 1px solid #30363d;
          border-radius: 6px; padding: 20px 22px;
        }
        .panel-title {
          font-size: 9px; letter-spacing: .14em; text-transform: uppercase;
          color: #8b949e; margin-bottom: 16px; display: flex; align-items: center; gap: 6px;
        }
        .panel-title::before { content: ''; width: 14px; height: 1px; background: #30363d; display: block; }

        .field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; }
        .field:last-child { margin-bottom: 0; }
        .field label { font-size: 10px; letter-spacing: .06em; color: #8b949e; text-transform: uppercase; }
        .hint { font-size: 10px; color: #3a3830; margin-top: -3px; }
        .field input, .field textarea {
          background: #0d1117; border: 1px solid #30363d; border-radius: 5px;
          padding: 9px 11px; color: #e6edf3; font-size: 12px;
          font-family: 'IBM Plex Mono', monospace; outline: none;
          transition: border-color .15s;
        }
        .field input:focus, .field textarea:focus { border-color: #388bfd; }
        .field input[type=range] { padding: 4px 0; cursor: pointer; background: none; border: none; }
        .field textarea { resize: vertical; }
        .json-err { font-size: 10px; color: #ef4444; margin-top: 3px; font-family: monospace; }

        .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

        .slider-label { display: flex; justify-content: space-between; align-items: center; }
        .slider-label span { color: #c73000; font-weight: 700; font-size: 12px; }

        .run-panel { border-color: #388bfd44; }
        .run-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }

        .run-btn {
          background: #238636; border: 1px solid #2ea043; color: #fff;
          padding: 10px 24px; border-radius: 5px;
          font-size: 12px; font-weight: 700; font-family: monospace;
          cursor: pointer; letter-spacing: .04em; white-space: nowrap;
          transition: background .15s;
        }
        .run-btn:hover:not(:disabled) { background: #2ea043; }
        .run-btn:disabled { opacity: .4; cursor: not-allowed; }

        .status-block { display: flex; flex-direction: column; gap: 4px; }
        .job-tag { font-size: 10px; color: #3a3830; letter-spacing: .04em; }
        .msg { font-size: 11px; color: #8b949e; margin-top: 2px; font-family: 'IBM Plex Sans', sans-serif; }

        .grafana-link {
          margin-top: 12px; padding: 10px 14px;
          background: rgba(56,139,253,.08); border: 1px solid rgba(56,139,253,.2);
          border-radius: 5px; font-size: 11px; color: #8b949e;
        }
        .grafana-link a { color: #58a6ff; }

        .scenario-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
        .scenario-chip {
          background: transparent; border: 1px solid #30363d; color: #8b949e;
          padding: 5px 11px; border-radius: 20px; font-size: 10px;
          font-family: monospace; cursor: pointer; letter-spacing: .04em;
          transition: all .15s; white-space: nowrap;
        }
        .scenario-chip:hover  { border-color: #58a6ff; color: #58a6ff; }
        .scenario-chip.active { border-color: #c73000; color: #c73000; background: rgba(199,48,0,.08); font-weight: 700; }
        .scenario-desc { font-size: 10px; color: #3a3830; margin-top: 2px; }
        .stages-preview {
          margin-top: 8px; padding: 8px 10px; background: #0d1117;
          border: 1px solid #21262d; border-radius: 5px;
          display: flex; gap: 4px; align-items: flex-end; flex-wrap: wrap;
        }
        .stage-block {
          display: flex; flex-direction: column; align-items: center; gap: 2px;
          font-size: 9px; color: #3a3830; min-width: 36px;
        }
        .stage-bar { background: #c73000; border-radius: 2px 2px 0 0; width: 28px; transition: height .3s; }
        .stage-dur { color: #3a3830; }

        .svc-bar {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        }
        .svc-select {
          flex: 2; min-width: 160px; background: #0d1117; border: 1px solid #30363d;
          border-radius: 5px; padding: 7px 10px; color: #e6edf3;
          font-size: 11px; font-family: monospace; outline: none; cursor: pointer;
          transition: border-color .15s;
        }
        .svc-select:focus { border-color: #388bfd; }
        .svc-input {
          flex: 2; min-width: 130px; background: #0d1117; border: 1px solid #30363d;
          border-radius: 5px; padding: 7px 10px; color: #e6edf3;
          font-size: 11px; font-family: monospace; outline: none;
        }
        .svc-input:focus { border-color: #388bfd; }
        .svc-btn {
          background: transparent; border: 1px solid #30363d; color: #8b949e;
          padding: 6px 10px; border-radius: 5px; font-size: 10px;
          font-family: monospace; cursor: pointer; white-space: nowrap;
          transition: border-color .15s, color .15s; display: flex; align-items: center; gap: 4px;
        }
        .svc-btn:hover          { border-color: #58a6ff; color: #58a6ff; }
        .svc-btn.save-btn       { border-color: #2ea043; color: #3fb950; }
        .svc-btn.save-btn:hover { background: rgba(46,160,67,.1); }
        .svc-btn.del-btn        { border-color: transparent; color: #3a3830; padding: 6px 7px; }
        .svc-btn.del-btn:hover  { border-color: #ef444466; color: #ef4444; }

        .grafana-toggle-btn {
          background: transparent; border: 1px solid #30363d; color: #8b949e;
          padding: 5px 12px; border-radius: 5px; font-size: 10px;
          font-family: monospace; cursor: pointer; letter-spacing: .06em;
          transition: border-color .15s, color .15s;
        }
        .grafana-toggle-btn:hover  { border-color: #58a6ff; color: #58a6ff; }
        .grafana-toggle-btn.active { border-color: #58a6ff; color: #58a6ff; background: rgba(56,139,253,.08); }

        .grafana-iframe-panel {
          width: 100%; background: #161b22;
          border-top: 2px solid #388bfd44;
        }
        .grafana-iframe-panel iframe {
          width: 100%; height: 780px; border: none; display: block;
        }

        footer {
          background: #010409; border-top: 1px solid #21262d;
          padding: 14px 28px; text-align: center;
          font-size: 10px; color: #3a3830; letter-spacing: .06em;
        }

        @media(max-width:600px) { .row2 { grid-template-columns: 1fr; } main { padding: 16px; } }
      `}</style>

      <div className="app">
        <header>
          <div>
            <span className="logo">PERFSTACK</span>
            <span className="logo-sub">// load testing platform</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              className={`grafana-toggle-btn${showGrafana ? " active" : ""}`}
              onClick={() => setShowGrafana(v => !v)}
            >
              📊 {showGrafana ? "Hide" : "Show"} Grafana
            </button>
            <div className="header-right">powered by GSA Team</div>
          </div>
        </header>

        <main>
          {/* Services */}
          <div className="panel" style={{ padding: "14px 22px" }}>
            <div className="panel-title" style={{ marginBottom: 10 }}>Saved Services</div>
            <div className="svc-bar">
              <select
                className="svc-select"
                value={activeIdx ?? ""}
                onChange={e => { const i = +e.target.value; loadService(i); }}
              >
                <option value="" disabled>— select a service —</option>
                {services.map((s, i) => (
                  <option key={i} value={i}>{s.name}</option>
                ))}
              </select>
              <button
                className="svc-btn del-btn"
                title="Delete selected"
                disabled={activeIdx === null}
                onClick={() => activeIdx !== null && deleteService(activeIdx)}
              >✕</button>
              <span style={{ color: "#30363d", fontSize: 12 }}>|</span>
              <input
                className="svc-input"
                placeholder="Save current as…"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && saveService()}
              />
              <button className="svc-btn save-btn" onClick={saveService}>💾 Save</button>
              <button className="svc-btn" title="Export all" onClick={exportServices}>⬇ Export</button>
              <button className="svc-btn" title="Import from file" onClick={() => importRef.current.click()}>⬆ Import</button>
              <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={importServices} />
            </div>
          </div>

          {/* IAM */}
          <div className="panel">
            <div className="panel-title">IAM Configuration</div>
            <Field label="IAM Token URL" value={form.iam_url} onChange={set("iam_url")}
              placeholder="https://iam.example.com/oauth2/token" mono />
            <div className="row2">
              <Field label="Client ID" value={form.client_id} onChange={set("client_id")}
                placeholder="my-client-id" />
              <Field label="Client Secret" type="password" value={form.client_secret}
                onChange={set("client_secret")} placeholder="••••••••" />
            </div>
          </div>

          {/* Test config */}
          <div className="panel">
            <div className="panel-title">Test Configuration</div>

            <Field label="Target URL" value={form.target_url} onChange={set("target_url")}
              placeholder="https://api.example.com/v1/endpoint" mono />

            <div className="field">
              <label>JSON Payload</label>
              <textarea
                value={form.payload}
                onChange={(e) => set("payload")(e.target.value)}
                rows={5}
                style={{ fontFamily: "monospace" }}
              />
              {jsonError && <span className="json-err">⚠ {jsonError}</span>}
            </div>

            <div className="field" style={{ marginBottom: 0, marginTop: 4 }}>
              <label>Scenario</label>
              <div className="scenario-chips">
                {Object.entries(SCENARIOS).map(([key, s]) => (
                  <button key={key} className={`scenario-chip${scenario === key ? " active" : ""}`}
                    onClick={() => selectScenario(key)}>
                    {s.icon} {s.label}
                  </button>
                ))}
              </div>
              <span className="scenario-desc">{SCENARIOS[scenario].desc}</span>

              <div className="row2" style={{ marginTop: 10 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <div className="slider-label">
                    <label>Virtual Users</label>
                    <span>{form.vus}</span>
                  </div>
                  <input type="range" min={1} max={2000} value={form.vus}
                    onChange={(e) => set("vus")(+e.target.value)} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <div className="slider-label">
                    <label>Duration</label>
                    <span>{form.duration}s</span>
                  </div>
                  <input type="range" min={10} max={3600} step={10} value={form.duration}
                    onChange={(e) => set("duration")(+e.target.value)} />
                </div>
              </div>

              {(() => {
                const stages = computeStages(scenario, form.vus, form.duration);
                const maxVus = Math.max(...stages.map(s => s.target), 1);
                return (
                  <div className="stages-preview">
                    {stages.map((s, i) => (
                      <div key={i} className="stage-block">
                        <span style={{ color: "#8b949e", fontSize: 9 }}>{s.target}vu</span>
                        <div className="stage-bar" style={{ height: Math.max(4, Math.round((s.target / maxVus) * 40)) }} />
                        <span className="stage-dur">{s.duration}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Run */}
          <div className="panel run-panel">
            <div className="panel-title">Run</div>
            <div className="run-row">
              <button className="run-btn" onClick={runTest} disabled={!canRun}>
                {loading ? "Launching…" : "▶ Run Load Test"}
              </button>
              <div className="status-block">
                <StatusBadge status={status} />
                {jobName && <span className="job-tag">job: {jobName}</span>}
                {message && <p className="msg">{message}</p>}
              </div>
            </div>

            {(status === "running" || status === "completed") && (
              <div className="grafana-link" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <span>
                  📊 View live metrics in Grafana →{" "}
                  <a href={`${window.location.origin}/grafana/d/k6/k6-load-testing-results?orgId=1&refresh=1s`} target="_blank" rel="noreferrer">
                    Grafana Dashboard
                  </a>
                </span>
                {status === "completed" && (
                  <button className="run-btn" style={{ background: "#1f6feb", borderColor: "#388bfd", padding: "6px 16px", fontSize: 11 }} onClick={downloadReport}>
                    📄 Download Report
                  </button>
                )}
              </div>
            )}
          </div>
        </main>

        {showGrafana && (
          <div className="grafana-iframe-panel">
            <iframe
              src={`${window.location.origin}/grafana/d/k6/k6-load-testing-results?orgId=1&refresh=1s&kiosk=tv`}
              title="k6 Load Testing Results"
            />
          </div>
        )}

        <footer>PERFSTACK · K6 + GRAFANA + KUBERNETES · BUILT BY GSA TEAM</footer>
      </div>
    </>
  );
}
