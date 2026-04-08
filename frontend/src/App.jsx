import { useState, useEffect, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

const DARK = {
  bg:          '#0d1117',
  bgPanel:     '#161b22',
  bgInput:     '#0d1117',
  bgHover:     '#21262d',
  border:      '#30363d',
  borderLight: '#21262d',
  text:        '#e6edf3',
  textMuted:   '#8b949e',
  textDim:     '#6e7681',
  accent:      '#388bfd',
  accentBg:    '#1f6feb',
  success:     '#10b981',
  danger:      '#ef4444',
  warning:     '#f59e0b',
  headerBg:    '#161b22',
  headerBorder:'#21262d',
  badgeBg:     '#21262d',
  badgeText:   '#8b949e',
  runBtn:      { bg: '#238636', border: '#2ea043', text: '#ffffff' },
  resetBtn:    { bg: '#6e2020', border: '#8b2020', text: '#ffffff' },
  dryRunBtn:   { bg: '#1f6feb', border: '#388bfd', text: '#ffffff' },
  reportBtn:   { bg: '#1f6feb', border: '#388bfd', text: '#ffffff' },
  tagBg:       '#21262d',
  tagText:     '#8b949e',
  scenarioBg:  '#161b22',
  scenarioBorder: '#30363d',
  scenarioActiveBg: '#1f6feb22',
  scenarioActiveBorder: '#388bfd',
  scenarioActiveText: '#388bfd',
  inputBorder: '#30363d',
  inputFocus:  '#388bfd',
  hintText:    '#8b949e',
  codeText:    '#e6edf3',
  podRunning:  { bg: '#0d2a1a', fg: '#4ade80' },
  podSucceeded:{ bg: '#0d1f0d', fg: '#86efac' },
  podFailed:   { bg: '#2a0d0d', fg: '#f87171' },
};

const LIGHT = {
  bg:          '#ffffff',
  bgPanel:     '#f6f8fa',
  bgInput:     '#ffffff',
  bgHover:     '#f3f4f6',
  border:      '#d0d7de',
  borderLight: '#e1e4e8',
  text:        '#1f2328',
  textMuted:   '#57606a',
  textDim:     '#6e7681',
  accent:      '#0969da',
  accentBg:    '#0969da',
  success:     '#1a7f37',
  danger:      '#d1242f',
  warning:     '#9a6700',
  headerBg:    '#f6f8fa',
  headerBorder:'#d0d7de',
  badgeBg:     '#eaeef2',
  badgeText:   '#57606a',
  runBtn:      { bg: '#2da44e', border: '#2c974b', text: '#ffffff' },
  resetBtn:    { bg: '#cf222e', border: '#a40e26', text: '#ffffff' },
  dryRunBtn:   { bg: '#0969da', border: '#0860ca', text: '#ffffff' },
  reportBtn:   { bg: '#0969da', border: '#0860ca', text: '#ffffff' },
  tagBg:       '#eaeef2',
  tagText:     '#57606a',
  scenarioBg:  '#f6f8fa',
  scenarioBorder: '#d0d7de',
  scenarioActiveBg: '#ddf4ff',
  scenarioActiveBorder: '#0969da',
  scenarioActiveText: '#0969da',
  inputBorder: '#d0d7de',
  inputFocus:  '#0969da',
  hintText:    '#57606a',
  codeText:    '#1f2328',
  podRunning:  { bg: '#dafbe1', fg: '#1a7f37' },
  podSucceeded:{ bg: '#dafbe1', fg: '#1a7f37' },
  podFailed:   { bg: '#ffebe9', fg: '#d1242f' },
};

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

function StatusBadge({ status, t }) {
  const map = {
    idle:      { color: t.textDim,  dot: t.textDim,  label: "Idle" },
    created:   { color: t.accent,   dot: t.accent,   label: "Created" },
    pending:   { color: t.warning,  dot: t.warning,  label: "Pending…" },
    running:   { color: t.warning,  dot: t.warning,  label: "Running…", blink: true },
    completed: { color: t.success,  dot: t.success,  label: "Completed ✓" },
    failed:    { color: t.danger,   dot: t.danger,   label: "Failed ✗" },
  };
  const s = map[status] || map.idle;
  return (
    <span style={{ color: s.color, fontFamily: "monospace", fontSize: "0.82rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.dot, display: "inline-block", animation: s.blink ? "blink 1s step-end infinite" : "none" }} />
      {s.label}
    </span>
  );
}

// ── Pod Table ────────────────────────────────────────────────────────────────

function PodTable({ pods, t }) {
  if (!pods || pods.length === 0) return null;
  const statusColor = (s) =>
    s === "Running"   ? t.podRunning :
    s === "Succeeded" ? t.podSucceeded :
                        t.podFailed;
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: t.textMuted, marginBottom: 6, letterSpacing: "0.08em" }}>
        RUNNER PODS ({pods.length})
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem", fontFamily: "monospace" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${t.border}`, color: t.textMuted }}>
            <th style={{ textAlign: "left",   padding: "3px 8px", fontWeight: 600 }}>#</th>
            <th style={{ textAlign: "left",   padding: "3px 8px", fontWeight: 600 }}>Pod</th>
            <th style={{ textAlign: "center", padding: "3px 8px", fontWeight: 600 }}>Status</th>
            <th style={{ textAlign: "right",  padding: "3px 8px", fontWeight: 600 }}>CPU</th>
            <th style={{ textAlign: "right",  padding: "3px 8px", fontWeight: 600 }}>Memory</th>
          </tr>
        </thead>
        <tbody>
          {pods.map((p) => {
            const sc = statusColor(p.status);
            return (
              <tr key={p.name} style={{ borderBottom: `1px solid ${t.bgPanel}` }}>
                <td style={{ padding: "4px 8px", color: t.textMuted }}>{p.instance}</td>
                <td style={{ padding: "4px 8px", color: t.text, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.name}>
                  {p.name}
                </td>
                <td style={{ padding: "4px 8px", textAlign: "center" }}>
                  <span style={{ display: "inline-block", padding: "1px 8px", borderRadius: 10, fontSize: "0.70rem", fontWeight: 700, background: sc.bg, color: sc.fg }}>
                    {p.status}
                  </span>
                </td>
                <td style={{ padding: "4px 8px", textAlign: "right", color: t.text }}>
                  {p.cpu_m != null ? `${p.cpu_m}m` : "—"}
                </td>
                <td style={{ padding: "4px 8px", textAlign: "right", color: t.text }}>
                  {p.memory_mi != null ? `${p.memory_mi} MiB` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SettingsMenu({ theme, onSelect, t }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const S = {
    panel: { position: 'absolute', right: 0, top: 'calc(100% + 10px)', background: t.bgPanel, border: `1px solid ${t.border}`, borderRadius: 10, minWidth: 270, zIndex: 1000, boxShadow: '0 16px 40px rgba(0,0,0,0.28)', overflow: 'hidden' },
    sectionLabel: { padding: '10px 16px 5px', fontSize: '0.64rem', letterSpacing: '0.10em', color: t.textDim, fontWeight: 800, textTransform: 'uppercase' },
    divider: { borderTop: `1px solid ${t.borderLight}`, margin: '4px 0' },
    themeBtn: (active) => ({ flex: 1, padding: '7px 0', borderRadius: 7, background: active ? t.accentBg : 'none', border: `1px solid ${active ? t.accent : t.border}`, color: active ? '#fff' : t.textMuted, cursor: 'pointer', fontSize: '0.78rem', fontWeight: active ? 700 : 400, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all 0.15s' }),
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: open ? t.bgHover : 'none', border: `1px solid ${open ? t.border : 'transparent'}`, borderRadius: 7, padding: '4px 11px', color: t.textMuted, cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.15s' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        <span style={{ color: open ? t.text : t.textMuted }}>Settings</span>
        <span style={{ fontSize: '0.60rem', opacity: 0.7 }}>{open ? '▲' : '▾'}</span>
      </button>

      {open && (
        <div style={S.panel}>
          <div style={S.sectionLabel}>Appearance</div>
          <div style={{ display: 'flex', gap: 6, padding: '5px 12px 10px' }}>
            <button style={S.themeBtn(theme === 'dark')}  onClick={() => onSelect('dark')}>🌙 Dark</button>
            <button style={S.themeBtn(theme === 'light')} onClick={() => onSelect('light')}>☀️ Light</button>
          </div>

          <div style={S.divider} />

          <div style={S.sectionLabel}>About</div>
          <div style={{ padding: '8px 16px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg, #c73000 0%, #ff6a35 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '1rem' }}>⚡</span>
              </div>
              <div>
                <div style={{ color: t.text, fontWeight: 800, fontSize: '0.90rem', letterSpacing: '0.04em' }}>PerfStack</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <span style={{ background: '#c73000', color: '#fff', fontSize: '0.62rem', fontWeight: 800, padding: '1px 8px', borderRadius: 20, letterSpacing: '0.04em' }}>v2.0.1</span>
                  <span style={{ color: t.textDim, fontSize: '0.68rem' }}>Released Apr 7, 2026</span>
                </div>
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${t.borderLight}`, paddingTop: 10 }}>
              <div style={{ color: t.textDim, fontSize: '0.66rem', marginBottom: 5, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700 }}>Contact Support</div>
              <a
                href="mailto:epc_owner@fico.com"
                style={{ color: t.accent, fontSize: '0.76rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}
              >
                <span>✉</span> epc_owner@fico.com
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
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
    default: // custom — handled via customStages state, not here
      return stages || [
        { duration: "5s",  target: v },
        { duration: `${d}s`, target: v },
        { duration: "5s",  target: 0 },
      ];
  }
}

// Services are now persisted on the backend — localStorage no longer used

const DEFAULT_CUSTOM_STAGES = [
  { target: 10, durValue: 5,  durUnit: "s" },
  { target: 50, durValue: 60, durUnit: "s" },
  { target: 0,  durValue: 5,  durUnit: "s" },
];

// ── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('ps_theme') || 'dark');
  const t = theme === 'dark' ? DARK : LIGHT;

  const toggleTheme = (val) => {
    setTheme(val);
    localStorage.setItem('ps_theme', val);
  };

  useEffect(() => {
    document.body.style.background = t.bg;
    document.body.style.color = t.text;
  }, [t]);

  const [sidebarWidth, setSidebarWidth] = useState(240);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(0);

  const onDragStart = (e) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartW.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!isDragging.current) return;
      const delta = e.clientX - dragStartX.current;
      setSidebarWidth(Math.min(480, Math.max(160, dragStartW.current + delta)));
    };
    const onUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const [form, setForm] = useState({
    iam_url:       "",
    client_id:     "",
    client_secret: "",
    target_url:    "",
    payload:       '{\n  "key": "value"\n}',
    vus:           10,
    duration:      60,
  });

  const [status,      setStatus]      = useState(() => localStorage.getItem("ps_status") || "idle");
  const [jobName,     setJobName]     = useState(() => localStorage.getItem("ps_job") || null);
  const [message,     setMessage]     = useState(() => localStorage.getItem("ps_message") || "");
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

  // ── Custom scenario stages ─────────────────────────────────────────────────
  const [customStages,       setCustomStages]       = useState(DEFAULT_CUSTOM_STAGES);
  const [savedScenarios,     setSavedScenarios]     = useState([]);
  const [customScenarioName, setCustomScenarioName] = useState("");
  const [activeScenarioIdx,  setActiveScenarioIdx]  = useState(null);

  // Load scenarios from backend on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/scenarios`)
      .then(r => r.json())
      .then(data => Array.isArray(data) && setSavedScenarios(data))
      .catch(() => {});
  }, []);

  const stageDurToStr = (s) => `${s.durValue}${s.durUnit}`;

  const addStage = () =>
    setCustomStages(prev => [...prev, { target: 10, durValue: 30, durUnit: "s" }]);

  const removeStage = (i) =>
    setCustomStages(prev => prev.filter((_, idx) => idx !== i));

  const updateStage = (i, field, value) =>
    setCustomStages(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));

  const saveCustomScenario = async () => {
    const name = customScenarioName.trim();
    if (!name) return;
    const entry = { name, stages: customStages };
    await fetch(`${API_BASE}/api/scenarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    const updated = await fetch(`${API_BASE}/api/scenarios`).then(r => r.json());
    setSavedScenarios(updated);
    setActiveScenarioIdx(updated.findIndex(s => s.name === name));
    setCustomScenarioName("");
  };

  const loadCustomScenario = (idx) => {
    setCustomStages(savedScenarios[idx].stages);
    setActiveScenarioIdx(idx);
  };

  const deleteCustomScenario = async (idx) => {
    const name = savedScenarios[idx].name;
    await fetch(`${API_BASE}/api/scenarios/${encodeURIComponent(name)}`, { method: "DELETE" });
    const updated = await fetch(`${API_BASE}/api/scenarios`).then(r => r.json());
    setSavedScenarios(updated);
    if (activeScenarioIdx === idx) setActiveScenarioIdx(null);
  };

  const [services,    setServices]    = useState([]);
  const [saveName,    setSaveName]    = useState("");
  const [activeIdx,   setActiveIdx]   = useState(null);
  const importRef    = useRef(null);
  const pollingRef   = useRef(null);
  const podPollingRef = useRef(null);
  const [podData, setPodData] = useState([]);

  const refreshServices = () =>
    fetch(`${API_BASE}/api/services`).then(r => r.json()).then(setServices).catch(() => {});

  useEffect(() => { refreshServices(); }, []);

  const saveService = async () => {
    const name = saveName.trim();
    if (!name) return;
    await fetch(`${API_BASE}/api/services`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, ...form }),
    });
    const updated = await fetch(`${API_BASE}/api/services`).then(r => r.json());
    setServices(updated);
    setActiveIdx(updated.findIndex(s => s.name === name));
    setSaveName("");
  };

  const loadService = (idx) => {
    const { name, ...config } = services[idx];
    setForm(config);
    setActiveIdx(idx);
  };

  const deleteService = async (idx) => {
    const name = services[idx].name;
    await fetch(`${API_BASE}/api/services/${encodeURIComponent(name)}`, { method: "DELETE" });
    const updated = await fetch(`${API_BASE}/api/services`).then(r => r.json());
    setServices(updated);
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
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (Array.isArray(data)) {
          await Promise.all(data.map(s => fetch(`${API_BASE}/api/services`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(s),
          })));
          refreshServices();
          setActiveIdx(null);
        }
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
          stages: scenario === "custom"
            ? customStages.map(s => ({ duration: stageDurToStr(s), target: s.target }))
            : computeStages(scenario, form.vus, form.duration),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Unknown error");
      setJobName(data.job_name);
      setStatus(data.status);
      setMessage(data.message);
      localStorage.setItem("ps_job",     data.job_name);
      localStorage.setItem("ps_status",  data.status);
      localStorage.setItem("ps_message", data.message);
      setPodData([]);
      startPolling(data.job_name);
      startPodPolling(data.job_name);
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
        localStorage.setItem("ps_status",  data.status);
        localStorage.setItem("ps_message", data.message);
        if (data.status === "completed" || data.status === "failed") {
          clearInterval(pollingRef.current);
          setTimeout(() => clearInterval(podPollingRef.current), 4000);
          localStorage.removeItem("ps_job");
        }
      } catch { /* ignore transient errors */ }
    }, 3000);
  };

  const startPodPolling = (name) => {
    if (podPollingRef.current) clearInterval(podPollingRef.current);
    podPollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/job-pods/${name}`);
        if (res.ok) setPodData(await res.json());
      } catch { /* ignore */ }
    }, 2000);
  };

  // Resume polling if page was refreshed mid-test
  useEffect(() => {
    const savedJob    = localStorage.getItem("ps_job");
    const savedStatus = localStorage.getItem("ps_status");
    if (savedJob && savedStatus && !["completed", "failed", "idle"].includes(savedStatus)) {
      startPolling(savedJob);
      startPodPolling(savedJob);
    }
    return () => {
      clearInterval(pollingRef.current);
      clearInterval(podPollingRef.current);
    };
  }, []);

  const canRun = !loading && status !== "running" && !jsonError &&
    form.iam_url && form.client_id && form.client_secret && form.target_url;

  const [pingResult, setPingResult] = useState(null);
  const [pinging,    setPinging]    = useState(false);

  const runPingTest = async () => {
    if (jsonError) return;
    setPinging(true);
    setPingResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/ping-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          iam_url: form.iam_url,
          client_id: form.client_id,
          client_secret: form.client_secret,
          target_url: form.target_url,
          payload: JSON.parse(form.payload),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Unknown error");
      setPingResult({ ok: true, ...data });
    } catch (e) {
      setPingResult({ ok: false, error: e.message });
    } finally {
      setPinging(false);
    }
  };

  const [resetting, setResetting] = useState(false);
  const resetInfluxDB = async () => {
    if (!confirm("This will delete ALL previous test data from InfluxDB. Continue?")) return;
    setResetting(true);
    try {
      const res = await fetch(`${API_BASE}/api/reset-influxdb`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Unknown error");
      alert("InfluxDB reset — all previous data cleared.");
    } catch (e) {
      alert(`Reset failed: ${e.message}`);
    } finally {
      setResetting(false);
    }
  };

  const downloadReport = () => {
    window.open(`${API_BASE}/api/report/${jobName}`, "_blank");
  };


  const [svcSearch, setSvcSearch] = useState("");
  const filteredServices = services.filter(s =>
    s.name.toLowerCase().includes(svcSearch.toLowerCase())
  );

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${t.bg}; color: ${t.text}; font-family: 'IBM Plex Mono', 'Fira Code', monospace; font-size: 13px; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

        .app { min-height: 100vh; display: flex; flex-direction: column; }

        header {
          background: ${t.headerBg}; border-bottom: 2px solid #c73000;
          padding: 0 20px; height: 44px;
          display: flex; align-items: center; justify-content: space-between;
          position: sticky; top: 0; z-index: 100;
        }
        .logo { color: #c73000; font-weight: 700; font-size: 13px; letter-spacing: .08em; }
        .logo-sub { color: ${t.textDim}; font-size: 10px; margin-left: 10px; }
        .header-right { font-size: 10px; color: ${t.textDim}; letter-spacing: .06em; }

        /* ── Two-column layout ── */
        .workspace {
          flex: 1; display: flex; overflow: hidden;
        }

        /* ── Sidebar ── */
        .sidebar {
          flex-shrink: 0;
          background: ${t.headerBg}; border-right: 1px solid ${t.borderLight};
          display: flex; flex-direction: column;
          height: calc(100vh - 44px); position: sticky; top: 44px;
          overflow: hidden;
        }
        .sidebar-header {
          padding: 12px 14px 8px;
          border-bottom: 1px solid ${t.borderLight};
          display: flex; flex-direction: column; gap: 8px;
        }
        .sidebar-title {
          font-size: 9px; letter-spacing: .14em; text-transform: uppercase;
          color: ${t.textDim}; display: flex; align-items: center; justify-content: space-between;
        }
        .sidebar-actions { display: flex; gap: 5px; }
        .sidebar-icon-btn {
          background: transparent; border: 1px solid ${t.borderLight}; color: ${t.textDim};
          padding: 4px 7px; border-radius: 4px; font-size: 10px; cursor: pointer;
          transition: border-color .15s, color .15s; line-height: 1;
        }
        .sidebar-icon-btn:hover { border-color: ${t.accent}; color: ${t.accent}; }
        .svc-search {
          width: 100%; background: ${t.bgInput}; border: 1px solid ${t.borderLight};
          border-radius: 4px; padding: 6px 9px; color: ${t.textMuted};
          font-size: 11px; font-family: monospace; outline: none;
        }
        .svc-search:focus { border-color: ${t.accent}; color: ${t.text}; }
        .svc-search::placeholder { color: ${t.textDim}; }

        /* ── Collection list ── */
        .svc-list {
          flex: 1; overflow-y: auto; padding: 6px 0;
        }
        .svc-list::-webkit-scrollbar { width: 4px; }
        .svc-list::-webkit-scrollbar-track { background: transparent; }
        .svc-list::-webkit-scrollbar-thumb { background: ${t.borderLight}; border-radius: 2px; }
        .svc-empty {
          padding: 20px 14px; font-size: 10px; color: ${t.textDim};
          text-align: center; line-height: 1.6;
        }
        .svc-item {
          display: flex; align-items: center; gap: 0;
          padding: 0; cursor: pointer; border: none; background: transparent;
          width: 100%; text-align: left;
          border-left: 3px solid transparent;
          transition: background .1s, border-color .1s;
        }
        .svc-item:hover { background: ${t.bgPanel}; }
        .svc-item.active {
          background: ${t.bgPanel}; border-left-color: #c73000;
        }
        .svc-item-body {
          flex: 1; padding: 9px 12px 9px 10px; min-width: 0;
        }
        .svc-item-name {
          font-size: 11px; font-family: monospace; color: ${t.text};
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          line-height: 1.3;
        }
        .svc-item.active .svc-item-name { color: ${t.text}; font-weight: 600; }
        .svc-item-url {
          font-size: 9px; color: ${t.textDim}; margin-top: 2px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .svc-item-del {
          background: transparent; border: none; color: transparent;
          padding: 8px 10px; cursor: pointer; font-size: 11px; flex-shrink: 0;
          transition: color .15s; line-height: 1;
        }
        .svc-item:hover .svc-item-del { color: ${t.textDim}; }
        .svc-item-del:hover { color: ${t.danger} !important; }

        /* ── Sidebar footer: save ── */
        .sidebar-footer {
          border-top: 1px solid ${t.borderLight}; padding: 10px 12px;
          display: flex; flex-direction: column; gap: 6px;
        }
        .save-row { display: flex; gap: 5px; }
        .save-input {
          flex: 1; background: ${t.bgInput}; border: 1px solid ${t.borderLight};
          border-radius: 4px; padding: 6px 8px; color: ${t.text};
          font-size: 11px; font-family: monospace; outline: none; min-width: 0;
        }
        .save-input:focus { border-color: #2ea043; }
        .save-input::placeholder { color: ${t.textDim}; }
        .save-btn {
          background: rgba(46,160,67,.12); border: 1px solid #2ea043; color: #3fb950;
          padding: 6px 10px; border-radius: 4px; font-size: 10px;
          font-family: monospace; cursor: pointer; white-space: nowrap;
          transition: background .15s;
        }
        .save-btn:hover { background: rgba(46,160,67,.22); }

        /* ── Main content ── */
        main {
          flex: 1; overflow-y: auto; padding: 24px 28px;
          display: flex; flex-direction: column; gap: 16px; background: ${t.bg};
        }

        .panel {
          background: ${t.bgPanel}; border: 1px solid ${t.border};
          border-radius: 6px; padding: 20px 22px;
        }
        .panel-title {
          font-size: 9px; letter-spacing: .14em; text-transform: uppercase;
          color: ${t.textMuted}; margin-bottom: 16px; display: flex; align-items: center; gap: 6px;
        }
        .panel-title::before { content: ''; width: 14px; height: 1px; background: ${t.border}; display: block; }

        .field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; }
        .field:last-child { margin-bottom: 0; }
        .field label { font-size: 10px; letter-spacing: .06em; color: ${t.textMuted}; text-transform: uppercase; }
        .hint { font-size: 10px; color: ${t.hintText}; margin-top: -3px; }
        .field input, .field textarea {
          background: ${t.bgInput}; border: 1px solid ${t.inputBorder}; border-radius: 5px;
          padding: 9px 11px; color: ${t.text}; font-size: 12px;
          font-family: 'IBM Plex Mono', monospace; outline: none;
          transition: border-color .15s;
        }
        .field input:focus, .field textarea:focus { border-color: ${t.inputFocus}; }
        .field input[type=range] { padding: 4px 0; cursor: pointer; background: none; border: none; }
        .field textarea { resize: vertical; }
        .json-err { font-size: 10px; color: ${t.danger}; margin-top: 3px; font-family: monospace; }

        .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

        .slider-label { display: flex; justify-content: space-between; align-items: center; }
        .slider-label span { color: #c73000; font-weight: 700; font-size: 12px; }

        .run-panel { border-color: ${t.accent}44; }
        .run-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }

        .run-btn {
          background: ${t.runBtn.bg}; border: 1px solid ${t.runBtn.border}; color: ${t.runBtn.text};
          padding: 10px 24px; border-radius: 5px;
          font-size: 12px; font-weight: 700; font-family: monospace;
          cursor: pointer; letter-spacing: .04em; white-space: nowrap;
          transition: background .15s;
        }
        .run-btn:hover:not(:disabled) { filter: brightness(1.1); }
        .run-btn:disabled { opacity: .4; cursor: not-allowed; }

        .status-block { display: flex; flex-direction: column; gap: 4px; }
        .job-tag { font-size: 10px; color: ${t.textDim}; letter-spacing: .04em; }
        .msg { font-size: 11px; color: ${t.textMuted}; margin-top: 2px; font-family: 'IBM Plex Sans', sans-serif; }

        .grafana-link {
          margin-top: 12px; padding: 10px 14px;
          background: ${t.accent}14; border: 1px solid ${t.accent}33;
          border-radius: 5px; font-size: 11px; color: ${t.textMuted};
        }
        .grafana-link a { color: ${t.accent}; }

        .scenario-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
        .scenario-chip {
          background: transparent; border: 1px solid ${t.scenarioBorder}; color: ${t.textMuted};
          padding: 5px 11px; border-radius: 20px; font-size: 10px;
          font-family: monospace; cursor: pointer; letter-spacing: .04em;
          transition: all .15s; white-space: nowrap;
        }
        .scenario-chip:hover  { border-color: ${t.accent}; color: ${t.accent}; }
        .scenario-chip.active { border-color: #c73000; color: #c73000; background: rgba(199,48,0,.08); font-weight: 700; }
        .scenario-desc { font-size: 10px; color: ${t.textDim}; margin-top: 2px; }
        .stages-preview {
          margin-top: 8px; padding: 8px 10px; background: ${t.bgInput};
          border: 1px solid ${t.borderLight}; border-radius: 5px;
          display: flex; gap: 4px; align-items: flex-end; flex-wrap: wrap;
        }
        .stage-block {
          display: flex; flex-direction: column; align-items: center; gap: 2px;
          font-size: 9px; color: ${t.textDim}; min-width: 36px;
        }
        .stage-bar { background: #c73000; border-radius: 2px 2px 0 0; width: 28px; transition: height .3s; }
        .stage-dur { color: ${t.textDim}; }

        /* ── Custom scenario builder ── */
        .custom-stages { display: flex; flex-direction: column; gap: 4px; }
        .cs-saved-row { display: flex; gap: 6px; margin-bottom: 8px; }
        .cs-select {
          flex: 1; background: ${t.bgInput}; border: 1px solid ${t.inputBorder}; border-radius: 4px;
          padding: 5px 8px; color: ${t.textMuted}; font-size: 11px; font-family: monospace;
          outline: none; cursor: pointer;
        }
        .cs-select:focus { border-color: ${t.inputFocus}; }
        .cs-header {
          display: grid; grid-template-columns: 28px 1fr 1fr 28px;
          gap: 6px; padding: 0 4px 4px;
          font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: ${t.textDim};
        }
        .cs-row {
          display: grid; grid-template-columns: 28px 1fr 1fr 28px;
          gap: 6px; align-items: center;
          background: ${t.bgInput}; border: 1px solid ${t.borderLight}; border-radius: 4px;
          padding: 6px 4px;
        }
        .cs-row:hover { border-color: ${t.border}; }
        .cs-step-num { font-size: 10px; color: ${t.textDim}; text-align: center; }
        .cs-col-vu, .cs-col-dur { display: flex; align-items: center; gap: 5px; }
        .cs-input {
          flex: 1; min-width: 0; background: ${t.bgPanel}; border: 1px solid ${t.border};
          border-radius: 4px; padding: 5px 7px; color: ${t.text};
          font-size: 12px; font-family: monospace; outline: none;
          transition: border-color .15s;
        }
        .cs-input:focus { border-color: #c73000; }
        .cs-input-dur { max-width: 64px; }
        .cs-unit { font-size: 10px; color: ${t.textDim}; white-space: nowrap; }
        .cs-unit-sel {
          background: ${t.bgPanel}; border: 1px solid ${t.border}; border-radius: 4px;
          padding: 5px 6px; color: ${t.textMuted}; font-size: 11px; font-family: monospace;
          outline: none; cursor: pointer;
        }
        .cs-unit-sel:focus { border-color: #c73000; }
        .cs-del-btn {
          background: transparent; border: 1px solid transparent; color: ${t.textDim};
          border-radius: 4px; padding: 4px 6px; font-size: 11px; cursor: pointer;
          transition: border-color .15s, color .15s; text-align: center;
        }
        .cs-del-btn:hover:not(:disabled) { border-color: ${t.danger}66; color: ${t.danger}; }
        .cs-del-btn:disabled { opacity: .3; cursor: not-allowed; }
        .cs-actions {
          display: flex; align-items: center; gap: 6px; margin-top: 8px; flex-wrap: wrap;
        }
        .cs-add-btn {
          background: transparent; border: 1px solid ${t.border}; color: ${t.textMuted};
          padding: 5px 10px; border-radius: 4px; font-size: 10px;
          font-family: monospace; cursor: pointer;
          transition: border-color .15s, color .15s;
        }
        .cs-add-btn:hover { border-color: ${t.accent}; color: ${t.accent}; }
        .cs-name-input {
          background: ${t.bgInput}; border: 1px solid ${t.borderLight}; border-radius: 4px;
          padding: 5px 9px; color: ${t.text}; font-size: 11px; font-family: monospace;
          outline: none; min-width: 0; width: 150px;
        }
        .cs-name-input:focus { border-color: #2ea043; }
        .cs-name-input::placeholder { color: ${t.textDim}; }
        .cs-save-btn {
          background: rgba(46,160,67,.12); border: 1px solid #2ea043; color: #3fb950;
          padding: 5px 10px; border-radius: 4px; font-size: 10px;
          font-family: monospace; cursor: pointer; white-space: nowrap;
          transition: background .15s;
        }
        .cs-save-btn:hover { background: rgba(46,160,67,.22); }

        .grafana-toggle-btn {
          background: transparent; border: 1px solid ${t.border}; color: ${t.textMuted};
          padding: 5px 12px; border-radius: 5px; font-size: 10px;
          font-family: monospace; cursor: pointer; letter-spacing: .06em;
          transition: border-color .15s, color .15s;
        }
        .grafana-toggle-btn:hover  { border-color: ${t.accent}; color: ${t.accent}; }
        .grafana-toggle-btn.active { border-color: ${t.accent}; color: ${t.accent}; background: ${t.accent}14; }

        .grafana-iframe-panel {
          width: 100%; background: ${t.bgPanel};
          border-top: 2px solid ${t.accent}44;
        }
        .grafana-iframe-panel iframe {
          width: 100%; height: 780px; border: none; display: block;
        }

        footer {
          background: ${t.headerBg}; border-top: 1px solid ${t.borderLight};
          padding: 12px 20px; text-align: center;
          font-size: 10px; color: ${t.textDim}; letter-spacing: .06em;
        }

        @media(max-width:700px) {
          .sidebar { display: none; }
          .row2 { grid-template-columns: 1fr; }
          main { padding: 16px; }
        }
      `}</style>

      <div className="app">
        <header>
          <div>
            <span className="logo">GSA PERFSTACK</span>
            <span className="logo-sub">// load testing platform</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              className={`grafana-toggle-btn${showGrafana ? " active" : ""}`}
              onClick={() => setShowGrafana(v => !v)}
            >
              📊 {showGrafana ? "Hide" : "Show"} Grafana
            </button>
            <SettingsMenu theme={theme} onSelect={toggleTheme} t={t} />
          </div>
        </header>

        <div className="workspace">
          {/* ── Sidebar: Web Services ── */}
          <aside className="sidebar" style={{ width: sidebarWidth }}>
            <div className="sidebar-header">
              <div className="sidebar-title">
                <span>Web Services</span>
                <div className="sidebar-actions">
                  <button className="sidebar-icon-btn" title="Export all" onClick={exportServices}>⬇</button>
                  <button className="sidebar-icon-btn" title="Import from file" onClick={() => importRef.current.click()}>⬆</button>
                  <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={importServices} />
                </div>
              </div>
              <input
                className="svc-search"
                placeholder="Search…"
                value={svcSearch}
                onChange={e => setSvcSearch(e.target.value)}
              />
            </div>

            <div className="svc-list">
              {filteredServices.length === 0 ? (
                <div className="svc-empty">
                  {services.length === 0
                    ? <>No saved services yet.<br/>Fill the form and save.</>
                    : "No results."}
                </div>
              ) : filteredServices.map((s) => {
                const realIdx = services.indexOf(s);
                return (
                  <div
                    key={realIdx}
                    className={`svc-item${activeIdx === realIdx ? " active" : ""}`}
                    onClick={() => loadService(realIdx)}
                  >
                    <div className="svc-item-body">
                      <div className="svc-item-name">{s.name}</div>
                      <div className="svc-item-url">{s.target_url || "—"}</div>
                    </div>
                    <button
                      className="svc-item-del"
                      title="Delete"
                      onClick={e => { e.stopPropagation(); deleteService(realIdx); }}
                    >✕</button>
                  </div>
                );
              })}
            </div>

            <div className="sidebar-footer">
              <div className="save-row">
                <input
                  className="save-input"
                  placeholder="Save current as…"
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && saveService()}
                />
                <button className="save-btn" onClick={saveService}>💾</button>
              </div>
            </div>
          </aside>

          {/* ── Resize handle ── */}
          <div
            onMouseDown={onDragStart}
            style={{
              width: 5, flexShrink: 0, cursor: "col-resize",
              background: "transparent", transition: "background .15s",
              position: "relative", zIndex: 10,
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#c73000"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          />

          {/* ── Main content ── */}
          <main>
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

                {scenario !== "custom" && (
                  <>
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
                              <span style={{ color: t.textMuted, fontSize: 9 }}>{s.target}vu</span>
                              <div className="stage-bar" style={{ height: Math.max(4, Math.round((s.target / maxVus) * 40)) }} />
                              <span className="stage-dur">{s.duration}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </>
                )}

                {scenario === "custom" && (
                  <div className="custom-stages" style={{ marginTop: 10 }}>
                    {/* Saved scenarios row */}
                    <div className="cs-saved-row">
                      <select
                        className="cs-select"
                        value={activeScenarioIdx ?? ""}
                        onChange={e => loadCustomScenario(+e.target.value)}
                      >
                        <option value="" disabled>— load saved scenario —</option>
                        {savedScenarios.map((s, i) => (
                          <option key={i} value={i}>{s.name}</option>
                        ))}
                      </select>
                      {activeScenarioIdx !== null && (
                        <button className="cs-del-btn" onClick={() => deleteCustomScenario(activeScenarioIdx)} title="Delete scenario">✕</button>
                      )}
                    </div>

                    {/* Stage rows */}
                    <div className="cs-header">
                      <span className="cs-col-step">#</span>
                      <span className="cs-col-vu">Virtual Users (target)</span>
                      <span className="cs-col-dur">Duration</span>
                      <span className="cs-col-act" />
                    </div>
                    {customStages.map((s, i) => (
                      <div key={i} className="cs-row">
                        <span className="cs-col-step cs-step-num">{i + 1}</span>
                        <div className="cs-col-vu">
                          <input
                            className="cs-input"
                            type="number" min={0} max={5000}
                            value={s.target}
                            onChange={e => updateStage(i, "target", +e.target.value)}
                          />
                          <span className="cs-unit">VUs</span>
                        </div>
                        <div className="cs-col-dur">
                          <input
                            className="cs-input cs-input-dur"
                            type="number" min={1} max={9999}
                            value={s.durValue}
                            onChange={e => updateStage(i, "durValue", +e.target.value)}
                          />
                          <select
                            className="cs-unit-sel"
                            value={s.durUnit}
                            onChange={e => updateStage(i, "durUnit", e.target.value)}
                          >
                            <option value="s">s</option>
                            <option value="m">m</option>
                            <option value="h">h</option>
                          </select>
                        </div>
                        <button
                          className="cs-col-act cs-del-btn"
                          onClick={() => removeStage(i)}
                          disabled={customStages.length <= 1}
                          title="Remove step"
                        >✕</button>
                      </div>
                    ))}

                    {/* Visualisation */}
                    {(() => {
                      const maxVus = Math.max(...customStages.map(s => s.target), 1);
                      return (
                        <div className="stages-preview" style={{ marginTop: 8 }}>
                          {customStages.map((s, i) => (
                            <div key={i} className="stage-block">
                              <span style={{ color: t.textMuted, fontSize: 9 }}>{s.target}vu</span>
                              <div className="stage-bar" style={{ height: Math.max(4, Math.round((s.target / maxVus) * 40)) }} />
                              <span className="stage-dur">{s.durValue}{s.durUnit}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Actions */}
                    <div className="cs-actions">
                      <button className="cs-add-btn" onClick={addStage}>＋ Add Step</button>
                      <div style={{ flex: 1 }} />
                      <input
                        className="cs-name-input"
                        placeholder="Scenario name…"
                        value={customScenarioName}
                        onChange={e => setCustomScenarioName(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && saveCustomScenario()}
                      />
                      <button className="cs-save-btn" onClick={saveCustomScenario}>💾 Save</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Run */}
            <div className="panel run-panel">
              <div className="panel-title">Run</div>
              <div className="run-row">
                <button
                  className="run-btn"
                  style={{ background: t.dryRunBtn.bg, borderColor: t.dryRunBtn.border, color: t.dryRunBtn.text }}
                  onClick={runPingTest}
                  disabled={pinging || !form.iam_url || !form.client_id || !form.client_secret || !form.target_url || !!jsonError}
                  title="Fire a single request to validate IAM + endpoint config"
                >
                  {pinging ? "Testing…" : "🔍 Dry Run"}
                </button>
              </div>

              {pingResult && (
                <div style={{
                  marginTop: 14, background: t.bgInput, border: `1px solid ${pingResult.ok && pingResult.status_code < 400 ? t.success + "44" : t.danger + "44"}`,
                  borderRadius: 6, overflow: "hidden", fontSize: 11
                }}>
                  <div style={{
                    padding: "8px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                    borderBottom: `1px solid ${t.borderLight}`,
                    background: pingResult.ok && pingResult.status_code < 400 ? t.success + "1a" : t.danger + "1a"
                  }}>
                    {pingResult.ok ? (
                      <>
                        <span style={{ fontWeight: 700, color: pingResult.status_code < 400 ? t.success : t.danger }}>
                          HTTP {pingResult.status_code}
                        </span>
                        <span style={{ color: t.textMuted }}>{pingResult.elapsed_ms} ms</span>
                        <span style={{ color: t.textMuted }}>{pingResult.target_url}</span>
                      </>
                    ) : (
                      <span style={{ color: t.danger, fontWeight: 700 }}>✗ {pingResult.error}</span>
                    )}
                    <button onClick={() => setPingResult(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: t.textDim, cursor: "pointer", fontSize: 13 }}>✕</button>
                  </div>

                  {pingResult.ok && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
                      <div style={{ borderRight: `1px solid ${t.borderLight}` }}>
                        <div style={{ padding: "6px 14px", fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: t.textDim, borderBottom: `1px solid ${t.borderLight}` }}>Request Payload</div>
                        <pre style={{ margin: 0, padding: "12px 14px", color: t.accent, fontFamily: "monospace", fontSize: 11, overflowX: "auto", maxHeight: 280, overflowY: "auto" }}>
                          {JSON.stringify(pingResult.request_payload, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <div style={{ padding: "6px 14px", fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: t.textDim, borderBottom: `1px solid ${t.borderLight}` }}>Response Body</div>
                        <pre style={{ margin: 0, padding: "12px 14px", color: t.codeText, fontFamily: "monospace", fontSize: 11, overflowX: "auto", maxHeight: 280, overflowY: "auto" }}>
                          {typeof pingResult.response_body === "string"
                            ? pingResult.response_body
                            : JSON.stringify(pingResult.response_body, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ borderTop: `1px solid ${t.borderLight}`, marginTop: 14, paddingTop: 14 }} />
              <div className="run-row">
                <button
                  className="run-btn"
                  style={{ background: t.resetBtn.bg, borderColor: t.resetBtn.border, color: t.resetBtn.text }}
                  onClick={resetInfluxDB}
                  disabled={resetting}
                  title="Drop and recreate the k6 InfluxDB database"
                >
                  {resetting ? "Resetting…" : "🗑 Reset DB"}
                </button>
                <button className="run-btn" onClick={runTest} disabled={!canRun}>
                  {loading ? "Launching…" : "▶ Run Load Test"}
                </button>
                <div className="status-block">
                  <StatusBadge status={status} t={t} />
                  {jobName && <span className="job-tag">job: {jobName}</span>}
                  {message && <p className="msg">{message}</p>}
                </div>
              </div>

              {(status === "running" || status === "completed") && (
                <div className="grafana-link" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                  <span>
                    📊 View live metrics in Grafana →{" "}
                    <a href={`${window.location.origin}/grafana/d/k6/k6-load-testing-results?orgId=1&refresh=1s&theme=${theme}`} target="_blank" rel="noreferrer">
                      Grafana Dashboard
                    </a>
                  </span>
                  {status === "completed" && (
                    <button className="run-btn" style={{ background: t.reportBtn.bg, borderColor: t.reportBtn.border, color: t.reportBtn.text, padding: "6px 16px", fontSize: 11 }} onClick={downloadReport}>
                      📄 Download Report
                    </button>
                  )}
                </div>
              )}

              {(status === "running" || status === "completed") && (
                <PodTable pods={podData} t={t} />
              )}
            </div>
          </main>
        </div>

        {showGrafana && (
          <div className="grafana-iframe-panel">
            <iframe
              src={`${window.location.origin}/grafana/d/k6/k6-load-testing-results?orgId=1&refresh=1s&kiosk=tv&theme=${theme}`}
              title="k6 Load Testing Results"
            />
          </div>
        )}

        <footer>GSA PERFSTACK · K6 + GRAFANA + KUBERNETES · BUILT BY GSA TEAM</footer>
      </div>
    </>
  );
}
