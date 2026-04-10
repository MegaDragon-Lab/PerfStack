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


function SettingsMenu({ theme, onSelect, t }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const metaRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: open ? t.bgHover : 'none', border: `1px solid ${open ? t.border : 'transparent'}`, borderRadius: 7, padding: '4px 11px', color: open ? t.text : t.textMuted, cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.15s' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        Settings
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ opacity: 0.5, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M1 3 L5 7 L9 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: t.bgPanel, border: `1px solid ${t.border}`, borderRadius: 12, width: 300, zIndex: 1000, boxShadow: '0 20px 48px rgba(0,0,0,0.32)', overflow: 'hidden' }}>

          {/* ── App identity header ── */}
          <div style={{ padding: '16px 18px', borderBottom: `1px solid ${t.borderLight}`, display: 'flex', alignItems: 'center', gap: 13 }}>
            <img
              src={theme === 'dark' ? '/assets/private/GSA_Logo_Inverted.png' : '/assets/private/GSA_Logo.jpg'}
              alt="GSA"
              style={{ height: 48, maxWidth: 90, objectFit: 'contain', flexShrink: 0 }}
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: t.text, fontWeight: 700, fontSize: '0.92rem', letterSpacing: '0.02em', lineHeight: 1.2 }}>GSA Platform Suite</div>
              <div style={{ color: t.textDim, fontSize: '0.68rem', marginTop: 3, letterSpacing: '0.04em' }}>Performance Testing Platform</div>
            </div>
            <div style={{ background: 'rgba(199,48,0,0.12)', border: '1px solid rgba(199,48,0,0.35)', color: '#e05a20', fontSize: '0.63rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, letterSpacing: '0.06em', flexShrink: 0 }}>
              v2.4.0
            </div>
          </div>

          {/* ── Appearance ── */}
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${t.borderLight}` }}>
            <div style={{ fontSize: '0.62rem', letterSpacing: '0.12em', color: t.textDim, fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>Appearance</div>
            <div style={{ display: 'flex', background: t.bg, borderRadius: 8, border: `1px solid ${t.borderLight}`, padding: 3, gap: 3 }}>
              {[
                { key: 'dark', label: 'Dark', icon: (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                )},
                { key: 'light', label: 'Light', icon: (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                )},
              ].map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => onSelect(key)}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 6, background: theme === key ? t.bgPanel : 'transparent', border: `1px solid ${theme === key ? t.border : 'transparent'}`, color: theme === key ? t.text : t.textMuted, cursor: 'pointer', fontSize: '0.78rem', fontWeight: theme === key ? 600 : 400, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.15s', boxShadow: theme === key ? '0 1px 3px rgba(0,0,0,0.2)' : 'none' }}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Release info ── */}
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${t.borderLight}` }}>
            <div style={{ fontSize: '0.62rem', letterSpacing: '0.12em', color: t.textDim, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Release Info</div>
            {[
              { label: 'Version',  value: '2.4.0' },
              { label: 'Released', value: 'Apr 9, 2026' },
              { label: 'Stack',    value: 'k6 · Grafana · k3d' },
            ].map(({ label, value }) => (
              <div key={label} style={metaRow}>
                <span style={{ fontSize: '0.73rem', color: t.textMuted }}>{label}</span>
                <span style={{ fontSize: '0.73rem', color: t.text, fontFamily: 'monospace', fontWeight: 500 }}>{value}</span>
              </div>
            ))}
          </div>

          {/* ── Support ── */}
          <div style={{ padding: '14px 18px 16px' }}>
            <div style={{ fontSize: '0.62rem', letterSpacing: '0.12em', color: t.textDim, fontWeight: 700, textTransform: 'uppercase', marginBottom: 9 }}>Support</div>
            <a
              href="mailto:epc_owner@fico.com"
              style={{ color: t.text, fontSize: '0.77rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 8, background: t.bgHover, border: `1px solid ${t.borderLight}`, transition: 'border-color 0.15s', fontWeight: 500 }}
              onMouseEnter={e => e.currentTarget.style.borderColor = t.accent}
              onMouseLeave={e => e.currentTarget.style.borderColor = t.borderLight}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: t.textMuted, flexShrink: 0 }}>
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
              </svg>
              epc_owner@fico.com
            </a>
          </div>

        </div>
      )}
    </div>
  );
}

// ── Scenarios ────────────────────────────────────────────────────────────────

const SCENARIOS = {
  load:   { label: "Load",   icon: "📈", desc: "Constant VUs — ramp up, hold, ramp down",         suggestVus: 50,  suggestDur: 120,  suggestInterval: 1.0  },
  spike:  { label: "Spike",  icon: "⚡", desc: "Sudden spike — baseline, burst, then recovery",    suggestVus: 200, suggestDur: 90,   suggestInterval: 0.1  },
  stress: { label: "Stress", icon: "🔥", desc: "Progressive ramp — increase load until failure",   suggestVus: 300, suggestDur: 300,  suggestInterval: 0.0  },
  soak:   { label: "Soak",   icon: "🕐", desc: "Endurance — sustained load over long duration",    suggestVus: 30,  suggestDur: 3600, suggestInterval: 1.5  },
  custom: { label: "Custom", icon: "🎛️", desc: "Manual — set VUs and duration freely",             suggestVus: null, suggestDur: null, suggestInterval: null },
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
  const [theme, setTheme] = useState(() => localStorage.getItem('ps_theme') || 'light');
  const t = theme === 'dark' ? DARK : LIGHT;

  // ── Auth ────────────────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState(null);   // null = not yet checked
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(u => { setCurrentUser(u); setAuthChecked(true); })
      .catch(() => setAuthChecked(true));
  }, []);

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
    iam_url:         "",
    client_id:       "",
    client_secret:   "",
    use_user_token:  false,
    target_url:      "",
    payload:         '{\n  "key": "value"\n}',
    vus:             10,
    duration:        60,
    sleep_interval:  0.1,
    parallelism:     4,
  });

  const [status,      setStatus]      = useState(() => { const s = localStorage.getItem("ps_status"); return (s === "running" || s === "pending") ? s : "idle"; });
  const [jobName,     setJobName]     = useState(() => localStorage.getItem("ps_job") || null);
  const [message,     setMessage]     = useState(() => { const s = localStorage.getItem("ps_status"); return (s === "running" || s === "pending") ? (localStorage.getItem("ps_message") || "") : ""; });
  const [loading,     setLoading]     = useState(false);
  const [jsonError,   setJsonError]   = useState("");
  const [showGrafana, setShowGrafana] = useState(false);
  const [scenario,    setScenario]    = useState("load");

  const selectScenario = (key) => {
    setScenario(key);
    const s = SCENARIOS[key];
    setForm(f => ({
      ...f,
      ...(s.suggestVus      != null ? { vus:           s.suggestVus      } : {}),
      ...(s.suggestDur      != null ? { duration:      s.suggestDur      } : {}),
      ...(s.suggestInterval != null ? { sleep_interval: s.suggestInterval } : {}),
    }));
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

  const [services,      setServices]      = useState([]);
  const [saveName,      setSaveName]      = useState("");
  const [saveFolder,    setSaveFolder]    = useState("");
  const [closedFolders, setClosedFolders] = useState(new Set());
  const [activeIdx,     setActiveIdx]     = useState(null);

  const toggleFolder = (key) => setClosedFolders(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const importRef    = useRef(null);
  const pollingRef    = useRef(null);
  const podPollingRef = useRef(null);
  const summaryHideRef = useRef(null);
  const [podData, setPodData] = useState([]);
  const [summaryVisible, setSummaryVisible] = useState(() => {
    const s = localStorage.getItem("ps_status") || "idle";
    return s === "running"; // only show on load if a test is actively running
  });

  const refreshServices = () =>
    fetch(`${API_BASE}/api/services`).then(r => r.json()).then(setServices).catch(() => {});

  useEffect(() => { refreshServices(); }, []);

  const saveService = async () => {
    const name = saveName.trim();
    if (!name) return;
    const { use_user_token: _uut, ...formToSave } = form;
    await fetch(`${API_BASE}/api/services`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, folder: saveFolder.trim(), ...formToSave }),
    });
    const updated = await fetch(`${API_BASE}/api/services`).then(r => r.json());
    setServices(updated);
    setActiveIdx(updated.findIndex(s => s.name === name));
    setSaveName("");
  };

  const loadService = (idx) => {
    const { name, folder, ...config } = services[idx];
    setForm({ ...config, use_user_token: false });
    setActiveIdx(idx);
    setSaveFolder(folder || "");
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
          service_name: activeIdx !== null ? (services[activeIdx]?.name || "") : "",
          sleep_interval: form.sleep_interval ?? 0.1,
          parallelism: form.parallelism ?? 4,
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
      clearTimeout(summaryHideRef.current);
      setSummaryVisible(true);
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
          localStorage.removeItem("ps_status");
          localStorage.removeItem("ps_message");
          // Refresh history list after a short delay (backend saves entry asynchronously)
          setTimeout(() => refreshHistory(), 2000);
          setTimeout(() => refreshHistory(), 12000); // second refresh after report is saved
          // Auto-hide summary bar 15s after completion
          clearTimeout(summaryHideRef.current);
          summaryHideRef.current = setTimeout(() => setSummaryVisible(false), 15000);
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

  const canRun = !loading && status !== "running" && !jsonError && form.target_url &&
    (form.use_user_token ? currentUser?.has_token : (form.iam_url && form.client_id && form.client_secret));

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
          use_user_token: form.use_user_token,
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



  const [iamOpen, setIamOpen] = useState(false);

  const formatJson = () => {
    try { setForm(f => ({ ...f, payload: JSON.stringify(JSON.parse(f.payload), null, 2) })); }
    catch {}
  };
  const loadExamplePayload = () =>
    setForm(f => ({ ...f, payload: JSON.stringify({ key: "value", userId: "123", amount: 99.99 }, null, 2) }));

  const vuLabel = (v) => v <= 20 ? "Low" : v <= 200 ? "Medium" : "High";
  const durLabel = (d) => d < 60 ? "Short" : d <= 300 ? "Medium" : "Long";

  const [history,        setHistory]        = useState([]);
  const [historyOpen,    setHistoryOpen]    = useState(false);
  const [historyFilter,  setHistoryFilter]  = useState("");

  const refreshHistory = () =>
    fetch(`${API_BASE}/api/history`).then(r => r.json()).then(d => Array.isArray(d) && setHistory(d)).catch(() => {});

  useEffect(() => { refreshHistory(); }, []);

  const deleteHistoryEntry = async (job_name) => {
    await fetch(`${API_BASE}/api/history/${encodeURIComponent(job_name)}`, { method: "DELETE" });
    refreshHistory();
  };

  // ── Monitoring state ─────────────────────────────────────────────────────────
  const [activeTab,          setActiveTab]          = useState("home");
  const [monitors,           setMonitors]           = useState([]);
  const [selectedMonitorId,  setSelectedMonitorId]  = useState(null);
  const [monitorRuns,        setMonitorRuns]        = useState([]);
  const [emailConfig,        setEmailConfig]        = useState({});
  const [emailConfigOpen,    setEmailConfigOpen]    = useState(false);
  const [monitorSaving,      setMonitorSaving]      = useState(false);
  const [monitorRunning,     setMonitorRunning]     = useState(false);
  const [emailSaving,        setEmailSaving]        = useState(false);
  const monitorPollRef = useRef(null);

  const DEFAULT_MONITOR_FORM = {
    name: "", service_name: "", target_url: "", method: "POST",
    headers: {}, payload: {}, iam_url: "", client_id: "", client_secret: "",
    expected_status: 200, max_response_ms: 5000, body_checks: [],
    interval: "1h", alert_emails: [], enabled: true,
  };
  const [monitorForm,        setMonitorForm]        = useState(DEFAULT_MONITOR_FORM);
  const [monitorIamOpen,     setMonitorIamOpen]     = useState(false);
  const [monitorEmailInput,  setMonitorEmailInput]  = useState("");
  const [monitorPayloadStr,  setMonitorPayloadStr]  = useState("{}");
  const [monitorHeadersStr,  setMonitorHeadersStr]  = useState("{}");

  const refreshMonitors = () =>
    fetch(`${API_BASE}/api/monitors`).then(r => r.json()).then(d => Array.isArray(d) && setMonitors(d)).catch(() => {});

  const refreshMonitorRuns = (id) =>
    fetch(`${API_BASE}/api/monitors/${id}/runs`).then(r => r.json()).then(d => Array.isArray(d) && setMonitorRuns(d)).catch(() => {});

  const loadEmailConfig = () =>
    fetch(`${API_BASE}/api/email-config`).then(r => r.json()).then(d => setEmailConfig(d || {})).catch(() => {});

  useEffect(() => { refreshMonitors(); loadEmailConfig(); }, []);

  useEffect(() => {
    if (selectedMonitorId) {
      refreshMonitorRuns(selectedMonitorId);
      clearInterval(monitorPollRef.current);
      monitorPollRef.current = setInterval(() => refreshMonitorRuns(selectedMonitorId), 10000);
    } else {
      clearInterval(monitorPollRef.current);
      setMonitorRuns([]);
    }
    return () => clearInterval(monitorPollRef.current);
  }, [selectedMonitorId]);

  const selectMonitor = (id) => {
    const m = monitors.find(x => x.id === id);
    if (!m) return;
    setSelectedMonitorId(id);
    setMonitorForm({
      ...DEFAULT_MONITOR_FORM,
      ...m,
      body_checks:  Array.isArray(m.body_checks)  ? m.body_checks  : [],
      alert_emails: Array.isArray(m.alert_emails) ? m.alert_emails : [],
    });
    setMonitorPayloadStr(m.payload && Object.keys(m.payload).length ? JSON.stringify(m.payload, null, 2) : "{}");
    setMonitorHeadersStr(m.headers && Object.keys(m.headers).length ? JSON.stringify(m.headers, null, 2) : "{}");
    setMonitorEmailInput("");
  };

  const newMonitor = () => {
    setSelectedMonitorId(null);
    setMonitorForm({ ...DEFAULT_MONITOR_FORM, service_name: services[activeIdx]?.name || "", target_url: form.target_url || "" });
    setMonitorPayloadStr("{}");
    setMonitorHeadersStr("{}");
    setMonitorEmailInput("");
    setMonitorRuns([]);
  };

  const saveMonitor = async () => {
    setMonitorSaving(true);
    try {
      let payload = {};
      try { payload = JSON.parse(monitorPayloadStr); } catch {}
      let headers = {};
      try { headers = JSON.parse(monitorHeadersStr); } catch {}
      // Flush any email still in the input box (user typed but didn't press Enter)
      let alert_emails = [...monitorForm.alert_emails];
      const pendingEmail = monitorEmailInput.trim().replace(/,$/, '');
      if (pendingEmail && !alert_emails.includes(pendingEmail)) {
        alert_emails.push(pendingEmail);
        setMonitorEmailInput('');
      }
      const body = { ...monitorForm, payload, headers, alert_emails };
      const method = selectedMonitorId ? "PUT" : "POST";
      const url = selectedMonitorId ? `${API_BASE}/api/monitors/${selectedMonitorId}` : `${API_BASE}/api/monitors`;
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const saved = await res.json();
      await refreshMonitors();
      setSelectedMonitorId(saved.id);
      setMonitorForm({
        ...DEFAULT_MONITOR_FORM,
        ...saved,
        body_checks:  Array.isArray(saved.body_checks)  ? saved.body_checks  : [],
        alert_emails: Array.isArray(saved.alert_emails) ? saved.alert_emails : [],
      });
    } catch {} finally { setMonitorSaving(false); }
  };

  const deleteMonitor = async () => {
    if (!selectedMonitorId) return;
    await fetch(`${API_BASE}/api/monitors/${selectedMonitorId}`, { method: "DELETE" });
    setSelectedMonitorId(null);
    setMonitorForm(DEFAULT_MONITOR_FORM);
    setMonitorRuns([]);
    refreshMonitors();
  };

  const toggleMonitor = async (id) => {
    await fetch(`${API_BASE}/api/monitors/${id}/toggle`, { method: "PATCH" });
    refreshMonitors();
  };

  const runMonitorNow = async () => {
    if (!selectedMonitorId) return;
    setMonitorRunning(true);
    await fetch(`${API_BASE}/api/monitors/${selectedMonitorId}/run`, { method: "POST" });
    setTimeout(() => { refreshMonitorRuns(selectedMonitorId); refreshMonitors(); setMonitorRunning(false); }, 3000);
  };

  const saveEmailCfg = async () => {
    setEmailSaving(true);
    await fetch(`${API_BASE}/api/email-config`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(emailConfig) });
    setEmailSaving(false);
  };

  const testEmailCfg = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/email-config/test`, { method: "POST" });
      const d = await res.json();
      alert(d.status === "sent" ? `Test email sent to ${d.to}` : `Failed: ${d.detail}`);
    } catch (e) { alert(`Error: ${e.message}`); }
  };

  const [svcSearch, setSvcSearch] = useState("");
  const filteredServices = services.filter(s =>
    s.name.toLowerCase().includes(svcSearch.toLowerCase()) ||
    (s.folder || "").toLowerCase().includes(svcSearch.toLowerCase())
  );

  const hasFolders = services.some(s => s.folder);
  const grouped = {};
  filteredServices.forEach(s => {
    const fKey = s.folder || "";
    if (!grouped[fKey]) grouped[fKey] = [];
    grouped[fKey].push({ svc: s, realIdx: services.indexOf(s) });
  });
  const folderKeys = Object.keys(grouped).sort((a, b) => {
    if (!a && b) return 1;   // uncategorized last
    if (a && !b) return -1;
    return a.localeCompare(b);
  });
  const existingFolders = [...new Set(services.map(s => s.folder || "").filter(Boolean))].sort();

  // ── Auth gates (after all hooks) ────────────────────────────────────────────
  if (!authChecked) return null;

  if (!currentUser) {
    const bookmarklet = `javascript:(function(){fetch('/rest/user').then(r=>r.json()).then(u=>{window.location.href='${window.location.origin}/api/auth/dms-login?uid='+encodeURIComponent(u.uid)+'&cn='+encodeURIComponent(u.cn)+'&o='+encodeURIComponent(u.o)+'&token='+encodeURIComponent(u.access_token_encoded||'')+'&token_exp='+encodeURIComponent(u.access_token_expiration_time||'');});})()`;
    return (
      <div style={{ minHeight: '100vh', background: t.bg, color: t.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'IBM Plex Sans, sans-serif' }}>
        <div style={{ maxWidth: 480, width: '100%', padding: '0 24px', textAlign: 'center' }}>
          <img src={theme === 'dark' ? '/assets/private/GSA_Logo_Inverted.png' : '/assets/private/GSA_Logo.jpg'} style={{ height: 48, objectFit: 'contain', marginBottom: 32 }} alt="GSA" />
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>GSA Platform Suite</h1>
          <p style={{ fontSize: 13, color: t.textMuted, marginBottom: 40 }}>Sign in with your FICO DMS account to continue</p>
          <div style={{ background: t.bgPanel, border: `1px solid ${t.borderLight}`, borderRadius: 12, padding: 28, textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span style={{ background: t.accent, color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>1</span>
              <span style={{ fontSize: 13 }}>Log into{' '}
                <a href="https://console.dms.uset2.ficoanalyticcloud.com/" target="_blank" rel="noreferrer" style={{ color: t.accent, fontWeight: 600 }}>DMS Console</a>
                {' '}in your browser</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20 }}>
              <span style={{ background: t.accent, color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>2</span>
              <div>
                <div style={{ fontSize: 13, marginBottom: 8 }}>Add this <strong>bookmarklet</strong> to your bookmark bar:</div>
                <div style={{ background: t.bgInput, border: `1px solid ${t.inputBorder}`, borderRadius: 7, padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all', color: t.textMuted, marginBottom: 8 }}>{bookmarklet}</div>
                <button onClick={() => navigator.clipboard.writeText(bookmarklet)}
                  style={{ fontSize: 11, padding: '4px 12px', borderRadius: 5, border: `1px solid ${t.accent}55`, background: `${t.accent}15`, color: t.accent, cursor: 'pointer' }}>
                  Copy bookmarklet
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ background: t.accent, color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>3</span>
              <span style={{ fontSize: 13 }}>While on DMS Console, <strong>click the bookmarklet</strong> — you'll be redirected here automatically</span>
            </div>
          </div>
          <p style={{ fontSize: 11, color: t.textDim, marginTop: 20 }}>Access restricted to FICO-GPS-TENANT members</p>
        </div>
      </div>
    );
  }

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
          flex: 1; display: flex; overflow: hidden; min-height: 0;
        }

        /* ── Sidebar ── */
        .sidebar {
          flex-shrink: 0;
          background: ${t.headerBg}; border-right: 1px solid ${t.borderLight};
          display: flex; flex-direction: column;
          overflow: hidden;
          align-self: stretch;
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
          flex: 1; overflow-y: auto; padding: 24px 0 6px;
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
        .svc-running-dot {
          width: 7px; height: 7px; border-radius: 50%; background: ${t.success};
          flex-shrink: 0; margin-right: 6px; margin-left: 4px;
          animation: blink 1.2s step-end infinite;
        }
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
        .svc-item-indented { border-left: none; }
        .svc-item-indented .svc-item-body { padding-left: 10px; }

        /* ── Folder headers ── */
        .folder-hdr {
          display: flex; align-items: center; gap: 5px;
          padding: 6px 12px 6px; font-size: 10px; letter-spacing: .08em;
          text-transform: uppercase; color: ${t.textMuted};
          cursor: pointer; user-select: none; transition: color .1s;
          border-left: 3px solid transparent;
        }
        .folder-hdr:hover { color: ${t.text}; }
        .folder-chevron { font-size: 8px; display: inline-block; transition: transform .15s; }
        .folder-chevron.open { transform: rotate(90deg); }
        .folder-hdr-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
        .folder-hdr-count {
          background: ${t.borderLight}; color: ${t.textDim};
          border-radius: 10px; padding: 1px 6px; font-size: 9px; flex-shrink: 0;
        }
        .folder-children {
          border-left: 2px solid ${t.borderLight};
          margin-left: 18px;
        }
        .folder-children .svc-item { border-left: none; }
        .folder-children .svc-item.active { background: ${t.bgPanel}; border-left: none; }
        .folder-children .svc-item.active .svc-item-name { color: ${t.text}; font-weight: 600; }
        .folder-children .svc-item-body { padding-left: 10px; }
        .folder-children .svc-item-body::before {
          content: ''; display: inline-block; width: 10px; height: 1px;
          background: ${t.borderLight}; vertical-align: middle; margin-right: 6px; flex-shrink: 0;
        }

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
          border-radius: 8px; padding: 22px 24px;
        }
        .panel-title {
          font-size: 15px; font-weight: 700; letter-spacing: .01em;
          color: ${t.text}; margin-bottom: 18px; display: flex; align-items: center; gap: 10px;
        }
        .panel-title.collapsible { cursor: pointer; user-select: none; }
        .panel-title.collapsible:hover { color: ${t.accent}; }
        .section-num {
          font-size: 10px; font-weight: 800; letter-spacing: .06em;
          background: rgba(199,48,0,.15); color: #c73000; border: 1px solid rgba(199,48,0,.3);
          padding: 2px 7px; border-radius: 4px; font-family: monospace; flex-shrink: 0;
        }
        .collapse-chevron { font-size: 11px; color: ${t.textDim}; margin-left: auto; }
        .iam-filled-badge {
          font-size: 10px; font-weight: 600; color: ${t.success};
          background: ${t.success}18; border: 1px solid ${t.success}44;
          padding: 2px 8px; border-radius: 20px; letter-spacing: .03em;
        }
        .payload-toolbar {
          display: flex; justify-content: flex-end; gap: 6px; margin-bottom: 6px;
        }
        .payload-btn {
          background: transparent; border: 1px solid ${t.borderLight}; color: ${t.textMuted};
          padding: 4px 10px; border-radius: 4px; font-size: 10px;
          font-family: monospace; cursor: pointer; transition: border-color .15s, color .15s;
        }
        .payload-btn:hover { border-color: ${t.accent}; color: ${t.accent}; }

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

        /* ── Summary bar ── */
        .summary-bar {
          background: ${t.headerBg}; border-bottom: 1px solid ${t.borderLight};
          padding: 0 24px; height: 34px;
          display: flex; align-items: center; gap: 0;
          font-size: 11px; font-family: monospace;
          position: sticky; top: 44px; z-index: 90;
        }
        .summary-sep { color: ${t.borderLight}; margin: 0 10px; user-select: none; }
        .summary-val { color: #c73000; font-weight: 700; }
        .summary-label { color: ${t.textDim}; }
        .summary-url { color: ${t.accent}; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* ── VU display ── */
        .vu-display {
          text-align: center; padding: 10px 0 8px;
          font-family: monospace;
        }
        .vu-display-val { font-size: 26px; font-weight: 800; color: #c73000; }
        .vu-display-sep { font-size: 18px; color: ${t.borderLight}; margin: 0 10px; }
        .vu-ctx-label {
          font-size: 10px; color: ${t.textDim}; text-align: center;
          margin-top: -4px; margin-bottom: 8px; letter-spacing: .05em;
        }

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
        .run-btn-primary {
          background: ${t.runBtn.bg}; border: 1px solid ${t.runBtn.border}; color: ${t.runBtn.text};
          padding: 13px 32px; border-radius: 6px; width: 100%;
          font-size: 14px; font-weight: 800; font-family: monospace;
          cursor: pointer; letter-spacing: .06em;
          transition: filter .15s; display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .run-btn-primary:hover:not(:disabled) { filter: brightness(1.12); }
        .run-btn-primary:disabled { opacity: .35; cursor: not-allowed; }
        .run-secondary-row { display: flex; gap: 10px; margin-top: 10px; }
        .run-btn-secondary {
          flex: 1; padding: 9px 0; border-radius: 5px; font-size: 11px;
          font-weight: 700; font-family: monospace; cursor: pointer; letter-spacing: .04em;
          transition: filter .15s; border-width: 1px; border-style: solid;
        }
        .run-btn-secondary:hover:not(:disabled) { filter: brightness(1.12); }
        .run-btn-secondary:disabled { opacity: .35; cursor: not-allowed; }

        /* ── Grafana / Report cards ── */
        .action-card {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 18px; border-radius: 7px; border-width: 1px; border-style: solid;
          cursor: pointer; text-decoration: none; font-family: monospace;
          transition: filter .15s; width: 100%;
        }
        .action-card:hover { filter: brightness(1.1); }
        .action-card-icon { font-size: 20px; flex-shrink: 0; }
        .action-card-text { display: flex; flex-direction: column; gap: 2px; flex: 1; text-align: left; }
        .action-card-title { font-size: 13px; font-weight: 700; }
        .action-card-sub { font-size: 10px; opacity: .7; }

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

        /* ── History table ── */
        .hist-filter-row { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
        .hist-filter-select {
          background: ${t.bgInput}; border: 1px solid ${t.borderLight}; border-radius: 5px;
          padding: 5px 10px; color: ${t.textMuted}; font-size: 11px; font-family: monospace;
          outline: none; cursor: pointer; flex: 1;
        }
        .hist-filter-select:focus { border-color: ${t.accent}; }
        .hist-refresh-btn {
          background: transparent; border: 1px solid ${t.borderLight}; color: ${t.textDim};
          padding: 5px 10px; border-radius: 5px; font-size: 11px; cursor: pointer;
          transition: border-color .15s, color .15s; white-space: nowrap;
        }
        .hist-refresh-btn:hover { border-color: ${t.accent}; color: ${t.accent}; }
        .hist-table { width: 100%; border-collapse: collapse; font-size: 11px; font-family: monospace; }
        .hist-table th {
          text-align: left; padding: 6px 10px; font-size: 9px; letter-spacing: .08em;
          text-transform: uppercase; color: ${t.textDim}; font-weight: 700;
          border-bottom: 1px solid ${t.borderLight};
        }
        .hist-table th:last-child { text-align: center; }
        .hist-table td { padding: 8px 10px; border-bottom: 1px solid ${t.bgHover}; color: ${t.text}; vertical-align: middle; }
        .hist-table tr:last-child td { border-bottom: none; }
        .hist-table tr:hover td { background: ${t.bgHover}; }
        .hist-svc { font-weight: 600; color: ${t.text}; }
        .hist-scenario { color: ${t.textMuted}; }
        .hist-num { color: #c73000; font-weight: 700; }
        .hist-date { color: ${t.textDim}; font-size: 10px; }
        .hist-status-pill {
          display: inline-block; padding: 2px 9px; border-radius: 20px;
          font-size: 9px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
        }
        .hist-actions { display: flex; gap: 5px; justify-content: center; }
        .hist-view-btn {
          background: ${t.accent}18; border: 1px solid ${t.accent}55; color: ${t.accent};
          padding: 4px 10px; border-radius: 4px; font-size: 10px; cursor: pointer;
          font-family: monospace; transition: background .15s; white-space: nowrap;
          text-decoration: none; display: inline-block;
        }
        .hist-view-btn:hover { background: ${t.accent}30; }
        .hist-view-btn.disabled { opacity: .4; cursor: default; pointer-events: none; }
        .hist-del-btn {
          background: transparent; border: 1px solid transparent; color: ${t.textDim};
          padding: 4px 7px; border-radius: 4px; font-size: 11px; cursor: pointer;
          transition: border-color .15s, color .15s;
        }
        .hist-del-btn:hover { border-color: ${t.danger}66; color: ${t.danger}; }
        .hist-empty { text-align: center; padding: 28px 0; color: ${t.textDim}; font-size: 11px; }

        footer {
          background: ${t.headerBg}; border-top: 1px solid ${t.borderLight};
          padding: 12px 20px; text-align: center;
          font-size: 10px; color: ${t.textDim}; letter-spacing: .06em;
        }

        /* ── Tab bar ── */
        .tab-bar {
          display: flex; align-items: center; gap: 2px;
          background: ${t.bg}; border-radius: 8px; padding: 3px;
          border: 1px solid ${t.borderLight};
        }
        .tab-btn {
          padding: 5px 14px; border-radius: 6px; border: none; cursor: pointer;
          font-size: 12px; font-weight: 500; color: ${t.textMuted};
          background: transparent; transition: all .15s; display: flex; align-items: center; gap: 6px;
        }
        .tab-btn.active { background: ${t.bgPanel}; color: ${t.text}; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
        .tab-badge { font-size: 10px; background: #c7300020; color: #c73000; padding: 1px 6px; border-radius: 10px; font-weight: 700; }

        /* ── Monitoring layout ── */
        .mon-workspace { display: flex; height: calc(100vh - 90px); overflow: hidden; }
        .mon-sidebar {
          width: 280px; flex-shrink: 0; border-right: 1px solid ${t.borderLight};
          display: flex; flex-direction: column; overflow: hidden;
          background: ${t.bgPanel};
        }
        .mon-sidebar-header {
          padding: 14px 14px 10px; border-bottom: 1px solid ${t.borderLight};
          display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
        }
        .mon-list { flex: 1; overflow-y: auto; padding: 6px 6px; }
        .mon-list-item {
          padding: 9px 10px; border-radius: 7px; cursor: pointer; margin-bottom: 2px;
          border: 1px solid transparent; transition: all .15s; display: flex; align-items: flex-start; gap: 9px;
        }
        .mon-list-item:hover { background: ${t.bgHover}; }
        .mon-list-item.active { background: ${t.accent}15; border-color: ${t.accent}55; }
        .mon-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
        .mon-detail { flex: 1; overflow-y: auto; padding: 20px 24px; }
        .mon-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; }
        .mon-field label { font-size: 11px; font-weight: 600; color: ${t.textMuted}; text-transform: uppercase; letter-spacing: .05em; }
        .mon-field input, .mon-field select, .mon-field textarea {
          padding: 7px 10px; border-radius: 6px; border: 1px solid ${t.inputBorder};
          background: ${t.bgInput}; color: ${t.text}; font-size: 13px;
          transition: border-color .15s; outline: none; font-family: inherit;
        }
        .mon-field input:focus, .mon-field select:focus, .mon-field textarea:focus { border-color: ${t.inputFocus}; }
        .mon-run-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .mon-run-table th { font-size: 10px; font-weight: 600; color: ${t.textDim}; text-transform: uppercase; letter-spacing: .06em; padding: 5px 8px; border-bottom: 1px solid ${t.borderLight}; text-align: left; }
        .mon-run-table td { padding: 6px 8px; border-bottom: 1px solid ${t.borderLight}; color: ${t.text}; vertical-align: top; }
        .mon-run-table tr:last-child td { border-bottom: none; }
        .mon-pill { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
        .mon-pill.ok { background: #10b98120; color: #10b981; }
        .mon-pill.ko { background: #ef444420; color: #ef4444; }
        .mon-pill.error { background: #f59e0b20; color: #f59e0b; }
        .email-tag { display: inline-flex; align-items: center; gap: 5px; background: ${t.accent}18; border: 1px solid ${t.accent}44; color: ${t.accent}; border-radius: 12px; padding: 2px 8px; font-size: 11px; margin: 2px; }
        .email-tag-remove { cursor: pointer; opacity: .6; font-size: 13px; line-height: 1; }
        .email-tag-remove:hover { opacity: 1; }
        .check-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
        .check-row input, .check-row select { flex: 1; padding: 5px 8px; border-radius: 5px; border: 1px solid ${t.inputBorder}; background: ${t.bgInput}; color: ${t.text}; font-size: 12px; outline: none; }
        .check-row input:focus, .check-row select:focus { border-color: ${t.inputFocus}; }
        .mon-email-section {
          border-top: 1px solid ${t.borderLight}; padding: 12px 14px; flex-shrink: 0;
          background: ${t.bgPanel};
        }

        @media(max-width:700px) {
          .sidebar { display: none; }
          .row2 { grid-template-columns: 1fr; }
          main { padding: 16px; }
        }
      `}</style>

      <div className="app">
        <header>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setActiveTab("home")}>
            <img
              src={theme === 'dark' ? '/assets/private/GSA_Logo_Inverted.png' : '/assets/private/GSA_Logo.jpg'}
              alt="GSA"
              style={{ height: 22, objectFit: 'contain' }}
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
            <span className="logo">GSA PLATFORM SUITE</span>
            <span className="logo-sub">
              {activeTab === "load" ? "// perfstack" : activeTab === "monitoring" ? "// monitorstack" : ""}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div className="tab-bar">
              <button className={`tab-btn${activeTab === "load" ? " active" : ""}`} onClick={() => setActiveTab("load")}>
                ⚡ PerfStack
              </button>
              <button className={`tab-btn${activeTab === "monitoring" ? " active" : ""}`} onClick={() => setActiveTab("monitoring")}>
                🔍 MonitorStack
                {monitors.filter(m => m.enabled).length > 0 && (
                  <span className="tab-badge">{monitors.filter(m => m.enabled).length}</span>
                )}
              </button>
            </div>
            <SettingsMenu theme={theme} onSelect={toggleTheme} t={t} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderLeft: `1px solid ${t.borderLight}`, paddingLeft: 14 }}>
              <span style={{ fontSize: 11, color: t.textMuted, fontWeight: 500 }}>{currentUser.cn}</span>
              <a href="/api/auth/logout" style={{ fontSize: 11, color: t.textDim, textDecoration: 'none', padding: '3px 8px', borderRadius: 4, border: `1px solid ${t.borderLight}` }}
                onMouseEnter={e => e.currentTarget.style.borderColor = t.accent}
                onMouseLeave={e => e.currentTarget.style.borderColor = t.borderLight}
              >logout</a>
            </div>
          </div>
        </header>

        {/* ── Summary config bar ── */}
        {summaryVisible && status !== "idle" && (
        <div className="summary-bar">
          <span className="summary-label">CONFIG</span>
          <span className="summary-sep">·</span>
          <span style={{ color: t.textMuted }}>{SCENARIOS[scenario].icon} {SCENARIOS[scenario].label}</span>
          <span className="summary-sep">·</span>
          <span className="summary-val">{scenario !== "custom" ? form.vus : "—"}</span>
          <span className="summary-label" style={{ marginLeft: 3 }}>VUs</span>
          <span className="summary-sep">·</span>
          <span className="summary-val">{scenario !== "custom" ? form.duration : "—"}</span>
          <span className="summary-label" style={{ marginLeft: 3 }}>s</span>
          {services[activeIdx]?.name && (
            <>
              <span className="summary-sep">·</span>
              <span className="summary-url">{services[activeIdx].name}</span>
            </>
          )}
          {status !== "idle" && (
            <>
              <span className="summary-sep" style={{ marginLeft: "auto" }}>·</span>
              <StatusBadge status={status} t={t} />
            </>
          )}
        </div>
        )}

        {/* ── Home / Landing ── */}
        {activeTab === "home" && (
          <div style={{ flex: 1, overflowY: 'auto', background: t.bg, padding: '48px 40px' }}>
            <div style={{ maxWidth: 820, margin: '0 auto' }}>
              {/* Hero */}
              <div style={{ marginBottom: 48 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
                  <img
                    src={theme === 'dark' ? '/assets/private/GSA_Logo_Inverted.png' : '/assets/private/GSA_Logo.jpg'}
                    alt="GSA Logo"
                    style={{ height: 110, objectFit: 'contain', flexShrink: 0 }}
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                  <div style={{ width: 1, height: 44, background: t.borderLight, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: t.text, letterSpacing: '.01em', lineHeight: 1.1 }}>GSA Platform Suite</div>
                    <div style={{ fontSize: 13, color: t.textDim, marginTop: 4, letterSpacing: '.04em' }}>Performance Testing &amp; API Monitoring Platform</div>
                  </div>
                  <span style={{ marginLeft: 'auto', background: 'rgba(199,48,0,0.12)', border: '1px solid rgba(199,48,0,0.35)', color: '#e05a20', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, letterSpacing: '.06em', flexShrink: 0 }}>v2.4.0</span>
                </div>
                <p style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.7, maxWidth: 620 }}>
                  An internal platform for load-testing REST APIs using k6 on Kubernetes, and continuously monitoring service health with scheduled checks and email alerting.
                </p>
              </div>

              {/* Modules */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 48 }}>
                <div
                  onClick={() => setActiveTab("load")}
                  style={{ background: t.bgPanel, border: `1px solid ${t.border}`, borderRadius: 10, padding: '24px 28px', cursor: 'pointer', transition: 'border-color .15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#c73000'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = t.border}
                >
                  <div style={{ fontSize: 28, marginBottom: 12 }}>⚡</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 6 }}>PerfStack</div>
                  <div style={{ fontSize: 12, color: t.textDim, lineHeight: 1.6 }}>Run load tests against your APIs using k6 with parallel pods. Supports multiple scenarios (Load, Spike, Stress, Soak, Custom), IAM auth, and saves rendered HTML reports per run.</div>
                  <div style={{ marginTop: 16, fontSize: 11, color: '#c73000', fontWeight: 600 }}>Open PerfStack →</div>
                </div>
                <div
                  onClick={() => setActiveTab("monitoring")}
                  style={{ background: t.bgPanel, border: `1px solid ${t.border}`, borderRadius: 10, padding: '24px 28px', cursor: 'pointer', transition: 'border-color .15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = t.accent}
                  onMouseLeave={e => e.currentTarget.style.borderColor = t.border}
                >
                  <div style={{ fontSize: 28, marginBottom: 12 }}>🔍</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 6 }}>MonitorStack</div>
                  <div style={{ fontSize: 12, color: t.textDim, lineHeight: 1.6 }}>Schedule recurring health checks on your web services. Verifies HTTP status, response time, and payload fields. Sends email alerts when a check fails.</div>
                  <div style={{ marginTop: 16, fontSize: 11, color: t.accent, fontWeight: 600 }}>Open MonitorStack →</div>
                </div>
              </div>

              {/* Release history */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: t.textDim, marginBottom: 16 }}>Release History</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0, borderLeft: `2px solid ${t.borderLight}`, paddingLeft: 20 }}>
                  {[
                    { version: 'v2.4.0', date: '2026-04-09', notes: ['DMS SSO login — bookmarklet auth via FICO-GPS-TENANT Okta session', 'Parametrized runner pods (1–20) per load test', 'Request interval auto-suggest per scenario', 'Monitor response payload check — inline field trace on failure', 'Status bar fixed: no longer persists across page reloads'] },
                    { version: 'v2.3.0', date: '2026-04-08', notes: ['MonitorStack — scheduled API monitoring with email alerts', 'Landing home page', 'Sidebar folder tree with visual nesting', 'Pod metrics inline table in status block', 'Grafana inline / new-tab toggle in View Live Metrics'] },
                    { version: 'v2.2.0', date: '2026-04-08', notes: ['Test History — persisted HTML reports per run saved to PVC', 'k6 lag reduced: 500ms InfluxDB flush, --no-usage-report flag', 'Elapsed time in deploy scripts'] },
                    { version: 'v2.1.0', date: '2026-04-08', notes: ['UI reorganisation: Dry Run → Test Config, Scenario → Execution', 'Summary config bar with auto-hide after completion', 'Dark / light theme support'] },
                    { version: 'v2.0.0', date: '2026-04-07', notes: ['Multi-service sidebar with folder grouping', 'Custom scenario builder', 'IAM OAuth2 token integration'] },
                  ].map(r => (
                    <div key={r.version} style={{ marginBottom: 24, position: 'relative' }}>
                      <div style={{ position: 'absolute', left: -26, top: 4, width: 8, height: 8, borderRadius: '50%', background: r.version === 'v2.4.0' ? '#c73000' : t.borderLight, border: `2px solid ${t.bg}` }} />
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: r.version === 'v2.4.0' ? '#c73000' : t.text, fontFamily: 'monospace' }}>{r.version}</span>
                        <span style={{ fontSize: 11, color: t.textDim, fontFamily: 'monospace' }}>{r.date}</span>
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 16, listStyle: 'disc' }}>
                        {r.notes.map((n, i) => <li key={i} style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.6 }}>{n}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "load" && <div className="workspace">
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
              ) : hasFolders ? (
                folderKeys.map(fKey => {
                  const items = grouped[fKey];
                  if (!items?.length) return null;
                  const isOpen = !closedFolders.has(fKey);
                  return (
                    <div key={fKey}>
                      <div className="folder-hdr" onClick={() => toggleFolder(fKey)}>
                        <span className={`folder-chevron${isOpen ? " open" : ""}`}>▶</span>
                        <span style={{ fontSize: 11 }}>📁</span>
                        <span className="folder-hdr-name">{fKey || "Uncategorized"}</span>
                        <span className="folder-hdr-count">{items.length}</span>
                      </div>
                      {isOpen && (
                        <div className="folder-children">
                          {items.map(({ svc: s, realIdx }) => (
                            <div
                              key={realIdx}
                              className={`svc-item${activeIdx === realIdx ? " active" : ""}`}
                              onClick={() => loadService(realIdx)}
                            >
                              {activeIdx === realIdx && status === "running" && <span className="svc-running-dot" />}
                              <div className="svc-item-body">
                                <div className="svc-item-name">{s.name}</div>
                              </div>
                              <button
                                className="svc-item-del"
                                title="Delete"
                                onClick={e => { e.stopPropagation(); deleteService(realIdx); }}
                              >✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                filteredServices.map((s) => {
                  const realIdx = services.indexOf(s);
                  return (
                    <div
                      key={realIdx}
                      className={`svc-item${activeIdx === realIdx ? " active" : ""}`}
                      onClick={() => loadService(realIdx)}
                    >
                      {activeIdx === realIdx && status === "running" && <span className="svc-running-dot" />}
                      <div className="svc-item-body">
                        <div className="svc-item-name">{s.name}</div>
                      </div>
                      <button
                        className="svc-item-del"
                        title="Delete"
                        onClick={e => { e.stopPropagation(); deleteService(realIdx); }}
                      >✕</button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="sidebar-footer">
              <datalist id="ps-folders">
                {existingFolders.map(f => <option key={f} value={f} />)}
              </datalist>
              <div className="save-row">
                <input
                  className="save-input"
                  placeholder="📁 Folder (optional)…"
                  value={saveFolder}
                  onChange={e => setSaveFolder(e.target.value)}
                  list="ps-folders"
                  style={{ borderColor: saveFolder ? '#c73000' : undefined }}
                />
              </div>
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
              <div className="panel-title collapsible" onClick={() => setIamOpen(o => !o)}>
                <span className="section-num">01</span>
                IAM Configuration
                {!iamOpen && (form.use_user_token ? <span className="iam-filled-badge">✓ DMS token</span> : form.iam_url ? <span className="iam-filled-badge">✓ configured</span> : null)}
                <span className="collapse-chevron">{iamOpen ? '▲' : '▾'}</span>
              </div>
              {iamOpen && (
                <>
                  {/* Toggle: use DMS session token vs client credentials */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '8px 12px', background: t.bgPanel, borderRadius: 6, border: `1px solid ${t.borderLight}` }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, userSelect: 'none' }}>
                      <input type="checkbox" checked={form.use_user_token}
                        onChange={e => setForm(f => ({ ...f, use_user_token: e.target.checked }))}
                        style={{ accentColor: t.accent, width: 14, height: 14 }} />
                      <span style={{ fontWeight: 600 }}>Use my DMS session token</span>
                    </label>
                    {form.use_user_token && currentUser?.token_exp && (
                      <span style={{ fontSize: 11, color: t.textDim, marginLeft: 'auto' }}>
                        expires {new Date(currentUser.token_exp).toLocaleTimeString()}
                      </span>
                    )}
                    {form.use_user_token && !currentUser?.has_token && (
                      <span style={{ fontSize: 11, color: '#f87171', marginLeft: 'auto' }}>
                        ⚠ no token in session — re-login with bookmarklet
                      </span>
                    )}
                  </div>
                  {!form.use_user_token && (
                    <>
                      <Field label="IAM Token URL" value={form.iam_url} onChange={set("iam_url")}
                        placeholder="https://iam.example.com/oauth2/token" mono />
                      <div className="row2">
                        <Field label="Client ID" value={form.client_id} onChange={set("client_id")}
                          placeholder="my-client-id" />
                        <Field label="Client Secret" type="password" value={form.client_secret}
                          onChange={set("client_secret")} placeholder="••••••••" />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Test config */}
            <div className="panel">
              <div className="panel-title" style={{ display: 'flex', alignItems: 'center' }}>
                <span className="section-num">02</span>
                Test Configuration
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <button
                    onClick={runPingTest}
                    disabled={pinging || !form.target_url || !!jsonError || (form.use_user_token ? !currentUser?.has_token : (!form.iam_url || !form.client_id || !form.client_secret))}
                    title="Dry Run — fire a single request to validate config"
                    style={{ padding: '5px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #3b82f6aa', background: '#3b82f625', color: '#3b82f6', cursor: 'pointer', opacity: (pinging || !form.target_url) ? .35 : 1, display: 'flex', alignItems: 'center', gap: 5 }}
                  >
                    {pinging
                      ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" strokeDasharray="31.4" strokeDashoffset="10"/></svg>
                      : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    }
                  </button>
                </div>
              </div>

              <Field label="Target URL" value={form.target_url} onChange={set("target_url")}
                placeholder="https://api.example.com/v1/endpoint" mono />

              <div className="field">
                <label>JSON Payload</label>
                <div className="payload-toolbar">
                  <button className="payload-btn" onClick={formatJson}>⌥ Format JSON</button>
                  <button className="payload-btn" onClick={loadExamplePayload}>⊞ Load Example</button>
                </div>
                <textarea
                  value={form.payload}
                  onChange={(e) => set("payload")(e.target.value)}
                  style={{ fontFamily: "monospace", minHeight: 100, maxHeight: 180, overflowY: "auto", resize: "vertical" }}
                />
                {jsonError && <span className="json-err">⚠ {jsonError}</span>}
              </div>

              {/* Dry Run result */}
              {pingResult && (
                <div style={{
                  marginTop: 10, background: t.bgInput, border: `1px solid ${pingResult.ok && pingResult.status_code < 400 ? t.success + "44" : t.danger + "44"}`,
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
                        <pre style={{ margin: 0, padding: "12px 14px", color: t.accent, fontFamily: "monospace", fontSize: 11, overflowX: "auto", maxHeight: 200, overflowY: "auto" }}>
                          {JSON.stringify(pingResult.request_payload, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <div style={{ padding: "6px 14px", fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: t.textDim, borderBottom: `1px solid ${t.borderLight}` }}>Response Body</div>
                        <pre style={{ margin: 0, padding: "12px 14px", color: t.codeText, fontFamily: "monospace", fontSize: 11, overflowX: "auto", maxHeight: 200, overflowY: "auto" }}>
                          {typeof pingResult.response_body === "string"
                            ? pingResult.response_body
                            : JSON.stringify(pingResult.response_body, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Run */}
            <div className="panel run-panel">
              <div className="panel-title" style={{ display: 'flex', alignItems: 'center' }}>
                <span className="section-num">03</span>
                Execution
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <button
                    onClick={runTest}
                    disabled={!canRun}
                    title="Run Load Test"
                    style={{ padding: '5px 10px', fontSize: 13, borderRadius: 6, border: `1px solid ${t.success}aa`, background: `${t.success}20`, color: t.success, cursor: 'pointer', opacity: !canRun ? .35 : 1 }}
                  >
                    {loading ? '⏳' : '▶'}
                  </button>
                  <button
                    onClick={resetInfluxDB}
                    disabled={resetting}
                    title="Reset InfluxDB"
                    style={{ padding: '5px 10px', fontSize: 13, borderRadius: 6, border: `1px solid ${t.danger}aa`, background: `${t.danger}20`, color: t.danger, cursor: 'pointer', opacity: resetting ? .35 : 1 }}
                  >
                    {resetting ? '…' : '🗑'}
                  </button>
                </div>
              </div>

              {/* Scenario */}
              <div className="field" style={{ marginBottom: 12, marginTop: 0 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '.06em', textTransform: 'uppercase' }}>Scenario</label>
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
                    <div className="vu-display">
                      <span className="vu-display-val">{form.vus}</span>
                      <span style={{ fontSize: 14, color: t.textDim, margin: '0 4px', fontFamily: 'monospace' }}>VUs</span>
                      <span className="vu-display-sep">|</span>
                      <span className="vu-display-val">{form.duration}</span>
                      <span style={{ fontSize: 14, color: t.textDim, margin: '0 4px', fontFamily: 'monospace' }}>s</span>
                    </div>
                    <div className="row2" style={{ marginTop: 4 }}>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <input type="range" min={1} max={2000} value={form.vus}
                          onChange={(e) => set("vus")(+e.target.value)} />
                        <div className="vu-ctx-label">
                          <label style={{ color: t.textMuted, fontSize: 10 }}>Virtual Users — </label>
                          <span style={{ color: form.vus <= 20 ? t.success : form.vus <= 200 ? t.warning : t.danger, fontWeight: 700 }}>
                            {vuLabel(form.vus)}
                          </span>
                        </div>
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <input type="range" min={10} max={3600} step={10} value={form.duration}
                          onChange={(e) => set("duration")(+e.target.value)} />
                        <div className="vu-ctx-label">
                          <label style={{ color: t.textMuted, fontSize: 10 }}>Duration — </label>
                          <span style={{ color: form.duration < 60 ? t.success : form.duration <= 300 ? t.warning : t.danger, fontWeight: 700 }}>
                            {durLabel(form.duration)}
                          </span>
                        </div>
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

                {/* Request Interval */}
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>
                    Request Interval
                  </label>
                  <input
                    type="number"
                    min={0} max={60} step={0.1}
                    value={form.sleep_interval}
                    onChange={e => set("sleep_interval")(Math.max(0, parseFloat(e.target.value) || 0))}
                    style={{ width: 70, padding: '4px 8px', borderRadius: 5, border: `1px solid ${t.inputBorder}`, background: t.bgInput, color: t.text, fontSize: 12, fontFamily: 'monospace', outline: 'none', textAlign: 'right' }}
                  />
                  <span style={{ fontSize: 10, color: t.textDim }}>s — sleep between requests</span>
                  <span style={{ fontSize: 10, color: t.textDim, marginLeft: 'auto' }}>
                    {form.sleep_interval > 0
                      ? `≈ ${(1 / (form.sleep_interval + 0.001)).toFixed(1)} req/s per VU`
                      : 'no sleep — max throughput'}
                  </span>
                </div>

                {/* Runner Pods */}
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>
                    Runner Pods
                  </label>
                  <input
                    type="number"
                    min={1} max={20} step={1}
                    value={form.parallelism}
                    onChange={e => set("parallelism")(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                    style={{ width: 70, padding: '4px 8px', borderRadius: 5, border: `1px solid ${t.inputBorder}`, background: t.bgInput, color: t.text, fontSize: 12, fontFamily: 'monospace', outline: 'none', textAlign: 'right' }}
                  />
                  <span style={{ fontSize: 10, color: t.textDim }}>parallel k6 pods (1–20)</span>
                  <span style={{ fontSize: 10, color: t.textDim, marginLeft: 'auto' }}>
                    {`≈ ${form.vus} VUs across ${form.parallelism} pod${form.parallelism > 1 ? 's' : ''}`}
                  </span>
                </div>

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

              {/* Status */}
              {status !== "idle" && (
                <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 7, background: t.bgInput, border: `1px solid ${t.borderLight}`, display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <StatusBadge status={status} t={t} />
                    {jobName && <span className="job-tag" style={{ fontSize: 11 }}>job: <strong style={{ color: t.text }}>{jobName}</strong></span>}
                    {message && <p className="msg">{message}</p>}
                  </div>
                  {(status === "running" || status === "completed") && podData && podData.length > 0 && (
                    <table style={{ borderCollapse: 'collapse', fontSize: 10, fontFamily: 'monospace', flexShrink: 0, alignSelf: 'flex-start' }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${t.borderLight}` }}>
                          <th style={{ padding: '2px 10px 4px 4px', color: t.textDim, fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>Pod</th>
                          <th style={{ padding: '2px 10px 4px 4px', color: t.textDim, fontWeight: 600, textAlign: 'left' }}>Status</th>
                          <th style={{ padding: '2px 10px 4px 4px', color: t.textDim, fontWeight: 600, textAlign: 'right' }}>CPU</th>
                          <th style={{ padding: '2px 4px 4px 4px',  color: t.textDim, fontWeight: 600, textAlign: 'right' }}>Mem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {podData.map(pod => {
                          const dotColor = pod.status === "Running" ? '#22c55e' : pod.status === "Succeeded" ? '#3b82f6' : pod.status === "Failed" ? '#ef4444' : '#9ca3af';
                          return (
                            <tr key={pod.name}>
                              <td style={{ padding: '3px 10px 3px 4px', color: t.text }}>pod-{pod.instance}</td>
                              <td style={{ padding: '3px 10px 3px 4px' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: dotColor }}>
                                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
                                  {pod.status}
                                </span>
                              </td>
                              <td style={{ padding: '3px 10px 3px 4px', color: t.textDim, textAlign: 'right' }}>{pod.cpu_m != null ? `${pod.cpu_m}m` : '—'}</td>
                              <td style={{ padding: '3px 4px 3px 4px',  color: t.textDim, textAlign: 'right' }}>{pod.memory_mi != null ? `${pod.memory_mi}Mi` : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Grafana + Report cards */}
              {(status === "running" || status === "completed") && (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="action-card" style={{ background: t.accent + '14', borderColor: t.accent + '55', color: t.text, cursor: 'default' }}>
                    <span className="action-card-icon">📊</span>
                    <div className="action-card-text">
                      <span className="action-card-title" style={{ color: t.accent }}>View Live Metrics</span>
                      <span className="action-card-sub">Grafana dashboard — choose how to view</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexShrink: 0 }}>
                      <a
                        href={`${window.location.origin}/grafana/d/k6/k6-load-testing-results?orgId=1&refresh=1s&theme=${theme}`}
                        target="_blank" rel="noreferrer"
                        title="Open in new tab"
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 5, border: `1px solid ${t.accent}55`, background: t.accent + '18', color: t.accent, fontSize: 11, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        New tab
                      </a>
                      <button
                        onClick={() => setShowGrafana(v => !v)}
                        title={showGrafana ? "Hide inline view" : "Show inline below"}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 5, border: `1px solid ${showGrafana ? t.accent : t.borderLight}`, background: showGrafana ? t.accent + '25' : 'transparent', color: showGrafana ? t.accent : t.textDim, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
                        {showGrafana ? 'Hide' : 'Inline'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {/* Test History */}
            <div className="panel">
              <div className="panel-title collapsible" onClick={() => setHistoryOpen(o => !o)}>
                <span className="section-num">04</span>
                Test History
                {history.length > 0 && (
                  <span style={{ fontSize: 10, background: t.borderLight, color: t.textDim, borderRadius: 10, padding: '2px 8px', fontWeight: 700, fontFamily: 'monospace' }}>
                    {history.length}
                  </span>
                )}
                <button
                  className="hist-refresh-btn"
                  style={{ marginLeft: 'auto', fontSize: 10 }}
                  onClick={e => { e.stopPropagation(); refreshHistory(); }}
                  title="Refresh history"
                >⟳ Refresh</button>
                <span className="collapse-chevron">{historyOpen ? '▲' : '▾'}</span>
              </div>

              {historyOpen && (() => {
                const services_in_history = [...new Set(history.map(h => h.service_name).filter(Boolean))].sort();
                const filtered = historyFilter
                  ? history.filter(h => h.service_name === historyFilter)
                  : history;

                const fmtDate = (iso) => {
                  if (!iso) return '—';
                  try {
                    const d = new Date(iso);
                    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                      + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                  } catch { return iso.slice(0, 16).replace('T', ' '); }
                };

                const statusStyle = (s) => s === 'completed'
                  ? { background: t.success + '20', color: t.success, border: `1px solid ${t.success}44` }
                  : s === 'running'
                  ? { background: t.warning + '20', color: t.warning, border: `1px solid ${t.warning}44` }
                  : { background: t.danger + '20', color: t.danger, border: `1px solid ${t.danger}44` };

                return (
                  <>
                    <div className="hist-filter-row">
                      <select
                        className="hist-filter-select"
                        value={historyFilter}
                        onChange={e => setHistoryFilter(e.target.value)}
                      >
                        <option value="">All services ({history.length} runs)</option>
                        {services_in_history.map(s => (
                          <option key={s} value={s}>{s} ({history.filter(h => h.service_name === s).length})</option>
                        ))}
                      </select>
                      {historyFilter && (
                        <button className="hist-refresh-btn" onClick={() => setHistoryFilter("")}>✕ Clear</button>
                      )}
                    </div>

                    {filtered.length === 0 ? (
                      <div className="hist-empty">No test runs yet. Run a load test to see history here.</div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table className="hist-table">
                          <thead>
                            <tr>
                              <th>Service</th>
                              <th>Scenario</th>
                              <th>VUs</th>
                              <th>Duration</th>
                              <th>Date</th>
                              <th>Peak RPS</th>
                              <th>Status</th>
                              <th style={{ textAlign: 'center' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map(h => (
                              <tr key={h.job_name}>
                                <td className="hist-svc">{h.service_name || <span style={{ color: t.textDim }}>—</span>}</td>
                                <td className="hist-scenario">{h.scenario}</td>
                                <td className="hist-num">{h.vus}</td>
                                <td style={{ color: t.textMuted }}>{h.duration}s</td>
                                <td className="hist-date">{fmtDate(h.started_at)}</td>
                                <td className="hist-num">{h.peak_rps > 0 ? h.peak_rps.toFixed(1) : '—'}</td>
                                <td>
                                  <span className="hist-status-pill" style={statusStyle(h.status)}>{h.status}</span>
                                </td>
                                <td>
                                  <div className="hist-actions">
                                    <a
                                      href={h.report_saved ? `${API_BASE}/api/report/${h.job_name}` : undefined}
                                      target="_blank" rel="noreferrer"
                                      className={`hist-view-btn${!h.report_saved ? ' disabled' : ''}`}
                                      title={h.report_saved ? 'View HTML report' : h.status === 'running' ? 'Test still running' : 'Report is being generated…'}
                                    >
                                      {h.report_saved ? '📄 Report' : h.status === 'running' ? '⏳' : '⏳ Saving…'}
                                    </a>
                                    <button
                                      className="hist-del-btn"
                                      title="Delete this entry"
                                      onClick={() => deleteHistoryEntry(h.job_name)}
                                    >✕</button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

          </main>
        </div>}

        {/* ── Monitoring Tab ── */}
        {activeTab === "monitoring" && (
          <div className="mon-workspace">
            {/* Left: monitor list + email config */}
            <div className="mon-sidebar">
              <div className="mon-sidebar-header">
                <span style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '.06em' }}>Monitors</span>
                <button
                  onClick={newMonitor}
                  style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${t.accent}55`, background: `${t.accent}15`, color: t.accent, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >
                  + New
                </button>
              </div>

              <div className="mon-list">
                {monitors.length === 0 && (
                  <div style={{ padding: '24px 10px', textAlign: 'center', color: t.textDim, fontSize: 11 }}>
                    No monitors yet.<br/>Click + New to create one.
                  </div>
                )}
                {monitors.map(m => {
                  const dotColor = m.last_status === 'ok' ? '#10b981' : m.last_status === 'ko' ? '#ef4444' : m.last_status === 'error' ? '#f59e0b' : t.borderLight;
                  return (
                    <div
                      key={m.id}
                      className={`mon-list-item${selectedMonitorId === m.id ? ' active' : ''}`}
                      onClick={() => selectMonitor(m.id)}
                    >
                      <span className="mon-status-dot" style={{ background: dotColor }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                        {m.service_name && <div style={{ fontSize: 10, color: t.textDim, marginTop: 1 }}>{m.service_name}</div>}
                        <div style={{ display: 'flex', gap: 5, marginTop: 4, alignItems: 'center' }}>
                          <span style={{ fontSize: 9, background: t.borderLight, color: t.textDim, borderRadius: 8, padding: '1px 6px', fontFamily: 'monospace' }}>{m.interval}</span>
                          {!m.enabled && <span style={{ fontSize: 9, color: t.textDim }}>disabled</span>}
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); toggleMonitor(m.id); }}
                        title={m.enabled ? 'Disable' : 'Enable'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: m.enabled ? t.success : t.textDim, fontSize: 14, padding: '0 2px' }}
                      >
                        {m.enabled ? '●' : '○'}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Email Config */}
              <div className="mon-email-section">
                <div
                  style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '.06em', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: emailConfigOpen ? 10 : 0 }}
                  onClick={() => setEmailConfigOpen(o => !o)}
                >
                  ✉ Email Config <span style={{ fontSize: 12 }}>{emailConfigOpen ? '▲' : '▾'}</span>
                </div>
                {emailConfigOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { key: 'smtp_host', label: 'SMTP Host', placeholder: 'smtp.example.com' },
                      { key: 'smtp_port', label: 'Port', placeholder: '587' },
                      { key: 'username',  label: 'Username',  placeholder: 'user@example.com' },
                      { key: 'password',  label: 'Password',  placeholder: '••••••••', type: 'password' },
                      { key: 'from_addr', label: 'From',      placeholder: 'perfstack@example.com' },
                    ].map(({ key, label, placeholder, type }) => (
                      <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <label style={{ fontSize: 10, fontWeight: 600, color: t.textDim, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</label>
                        <input
                          type={type || 'text'}
                          value={emailConfig[key] || ''}
                          onChange={e => setEmailConfig(c => ({ ...c, [key]: e.target.value }))}
                          placeholder={placeholder}
                          style={{ padding: '5px 8px', borderRadius: 5, border: `1px solid ${t.inputBorder}`, background: t.bgInput, color: t.text, fontSize: 11, outline: 'none' }}
                        />
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 2 }}>
                      <label style={{ fontSize: 10, color: t.textDim, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!emailConfig.use_tls} onChange={e => setEmailConfig(c => ({ ...c, use_tls: e.target.checked }))} />
                        TLS
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <button
                        onClick={saveEmailCfg}
                        style={{ flex: 1, padding: '5px 0', borderRadius: 5, border: `1px solid ${t.accent}55`, background: `${t.accent}15`, color: t.accent, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                      >
                        {emailSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={testEmailCfg}
                        style={{ flex: 1, padding: '5px 0', borderRadius: 5, border: `1px solid ${t.borderLight}`, background: 'none', color: t.textMuted, fontSize: 11, cursor: 'pointer' }}
                      >
                        Test Email
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: detail pane */}
            <div className="mon-detail" style={{ background: t.bg }}>
              {!selectedMonitorId && monitors.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: t.textDim, gap: 10 }}>
                  <span style={{ fontSize: 36 }}>🔍</span>
                  <span style={{ fontSize: 13 }}>Select a monitor on the left</span>
                </div>
              )}
              {!selectedMonitorId && monitors.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: t.textDim }}>
                  <span style={{ fontSize: 40 }}>🔍</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: t.text }}>No monitors yet</span>
                  <span style={{ fontSize: 12 }}>Click + New to create your first monitor</span>
                  <button onClick={newMonitor} style={{ marginTop: 8, padding: '8px 20px', borderRadius: 7, border: `1px solid ${t.accent}55`, background: `${t.accent}15`, color: t.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    + Create Monitor
                  </button>
                </div>
              )}

              {(selectedMonitorId !== null || monitorForm.name !== '' || monitorForm.target_url !== '') && (() => {
                const isNew = !selectedMonitorId;
                return (
                  <div style={{ maxWidth: 720 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <h2 style={{ fontSize: 16, fontWeight: 700, color: t.text }}>{isNew ? 'New Monitor' : 'Edit Monitor'}</h2>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {!isNew && (
                          <button
                            onClick={runMonitorNow}
                            disabled={monitorRunning}
                            style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${t.success}55`, background: `${t.success}15`, color: t.success, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: monitorRunning ? .6 : 1 }}
                          >
                            {monitorRunning ? '⏳ Running…' : '▶ Run Now'}
                          </button>
                        )}
                        <button
                          onClick={saveMonitor}
                          disabled={monitorSaving}
                          style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${t.accent}55`, background: `${t.accent}15`, color: t.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: monitorSaving ? .6 : 1 }}
                        >
                          {monitorSaving ? 'Saving…' : 'Save'}
                        </button>
                        {!isNew && (
                          <button
                            onClick={deleteMonitor}
                            style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${t.danger}55`, background: `${t.danger}10`, color: t.danger, fontSize: 12, cursor: 'pointer' }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Pre-fill from Web Service */}
                    {services.length > 0 && (
                      <div className="mon-field" style={{ marginBottom: 18, padding: '10px 14px', background: t.bgPanel, border: `1px solid ${t.borderLight}`, borderRadius: 8 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6, display: 'block' }}>
                          Pre-fill from Web Service
                        </label>
                        <select
                          defaultValue=""
                          onChange={e => {
                            const svc = services.find(s => s.name === e.target.value);
                            if (!svc) return;
                            let parsedPayload = {};
                            try { parsedPayload = JSON.parse(svc.payload || '{}'); } catch {}
                            setMonitorForm(f => ({
                              ...f,
                              service_name: svc.name,
                              target_url:   svc.target_url  || f.target_url,
                              iam_url:      svc.iam_url     || f.iam_url,
                              client_id:    svc.client_id   || f.client_id,
                              client_secret:svc.client_secret || f.client_secret,
                              payload:      parsedPayload,
                              name:         f.name || svc.name,
                            }));
                            setMonitorPayloadStr(svc.payload || '{}');
                            if (svc.iam_url) setMonitorIamOpen(true);
                            e.target.value = "";
                          }}
                          style={{ padding: '7px 10px', borderRadius: 6, border: `1px solid ${t.inputBorder}`, background: t.bgInput, color: t.text, fontSize: 13, outline: 'none', width: '100%', cursor: 'pointer' }}
                        >
                          <option value="" disabled>— select a service to import —</option>
                          {services.map(s => (
                            <option key={s.name} value={s.name}>{s.folder ? `${s.folder} / ${s.name}` : s.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
                      {/* Name */}
                      <div className="mon-field" style={{ gridColumn: '1/-1' }}>
                        <label>Monitor Name</label>
                        <input value={monitorForm.name} onChange={e => setMonitorForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Production Health Check" />
                      </div>

                      {/* Target URL */}
                      <div className="mon-field" style={{ gridColumn: '1/-1' }}>
                        <label>Target URL</label>
                        <input value={monitorForm.target_url} onChange={e => setMonitorForm(f => ({ ...f, target_url: e.target.value }))} placeholder="https://api.example.com/endpoint" style={{ fontFamily: 'monospace' }} />
                      </div>

                      {/* Method */}
                      <div className="mon-field">
                        <label>HTTP Method</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {['GET', 'POST'].map(m => (
                            <button key={m} onClick={() => setMonitorForm(f => ({ ...f, method: m }))}
                              style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: `1px solid ${monitorForm.method === m ? t.accent : t.inputBorder}`, background: monitorForm.method === m ? `${t.accent}18` : 'none', color: monitorForm.method === m ? t.accent : t.textMuted, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Schedule */}
                      <div className="mon-field">
                        <label>Schedule</label>
                        <select value={monitorForm.interval} onChange={e => setMonitorForm(f => ({ ...f, interval: e.target.value }))}>
                          {[['5m','Every 5 min'],['15m','Every 15 min'],['30m','Every 30 min'],['1h','Every hour'],['6h','Every 6 hours'],['24h','Every 24 hours']].map(([v,l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      </div>

                      {/* Expected status */}
                      <div className="mon-field">
                        <label>Expected HTTP Status</label>
                        <input type="number" value={monitorForm.expected_status} onChange={e => setMonitorForm(f => ({ ...f, expected_status: parseInt(e.target.value) || 200 }))} />
                      </div>

                      {/* Max response time */}
                      <div className="mon-field">
                        <label>Max Response Time (ms)</label>
                        <input type="number" value={monitorForm.max_response_ms} onChange={e => setMonitorForm(f => ({ ...f, max_response_ms: parseInt(e.target.value) || 5000 }))} />
                      </div>
                    </div>

                    {/* JSON Payload */}
                    {monitorForm.method === 'POST' && (
                      <div className="mon-field">
                        <label>JSON Payload</label>
                        <textarea
                          rows={4}
                          value={monitorPayloadStr}
                          onChange={e => setMonitorPayloadStr(e.target.value)}
                          placeholder="{}"
                          style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
                        />
                      </div>
                    )}

                    {/* IAM Config (collapsible) */}
                    <div style={{ marginBottom: 14, border: `1px solid ${t.borderLight}`, borderRadius: 7, overflow: 'hidden' }}>
                      <div
                        style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: t.bgPanel, userSelect: 'none' }}
                        onClick={() => setMonitorIamOpen(o => !o)}
                      >
                        <span style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '.05em' }}>IAM Auth (optional)</span>
                        <span style={{ color: t.textDim, fontSize: 12 }}>{monitorIamOpen ? '▲' : '▾'}</span>
                      </div>
                      {monitorIamOpen && (
                        <div style={{ padding: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', background: t.bg }}>
                          {[
                            { key: 'iam_url', label: 'IAM URL', col: '1/-1' },
                            { key: 'client_id', label: 'Client ID' },
                            { key: 'client_secret', label: 'Client Secret', type: 'password' },
                          ].map(({ key, label, col, type }) => (
                            <div key={key} className="mon-field" style={col ? { gridColumn: col } : {}}>
                              <label>{label}</label>
                              <input type={type || 'text'} value={monitorForm[key]} onChange={e => setMonitorForm(f => ({ ...f, [key]: e.target.value }))} style={{ fontFamily: 'monospace' }} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Response Payload Checks */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '.05em' }}>Response Payload Checks</label>
                        <button
                          onClick={() => setMonitorForm(f => ({ ...f, body_checks: [...f.body_checks, { field: '', operator: 'eq', value: '' }] }))}
                          style={{ fontSize: 11, color: t.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                        >
                          + Add Check
                        </button>
                      </div>
                      {monitorForm.body_checks.map((bc, i) => (
                        <div key={i} className="check-row">
                          <input value={bc.field} onChange={e => setMonitorForm(f => { const c = [...f.body_checks]; c[i] = { ...c[i], field: e.target.value }; return { ...f, body_checks: c }; })} placeholder="field.path" />
                          <select value={bc.operator} onChange={e => setMonitorForm(f => { const c = [...f.body_checks]; c[i] = { ...c[i], operator: e.target.value }; return { ...f, body_checks: c }; })}>
                            <option value="eq">equals</option>
                            <option value="contains">contains</option>
                            <option value="exists">exists</option>
                          </select>
                          {bc.operator !== 'exists' && (
                            <input value={bc.value} onChange={e => setMonitorForm(f => { const c = [...f.body_checks]; c[i] = { ...c[i], value: e.target.value }; return { ...f, body_checks: c }; })} placeholder="expected value" />
                          )}
                          <button onClick={() => setMonitorForm(f => ({ ...f, body_checks: f.body_checks.filter((_, idx) => idx !== i) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.danger, fontSize: 15, padding: '0 4px' }}>×</button>
                        </div>
                      ))}
                      {monitorForm.body_checks.length === 0 && (
                        <div style={{ fontSize: 11, color: t.textDim, padding: '6px 0' }}>No checks — click + Add Check to verify response payload fields.</div>
                      )}
                    </div>

                    {/* Alert Emails */}
                    <div className="mon-field">
                      <label>Alert Emails</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                        {monitorForm.alert_emails.map((email, i) => (
                          <span key={i} className="email-tag">
                            {email}
                            <span className="email-tag-remove" onClick={() => setMonitorForm(f => ({ ...f, alert_emails: f.alert_emails.filter((_, idx) => idx !== i) }))}>×</span>
                          </span>
                        ))}
                      </div>
                      <input
                        value={monitorEmailInput}
                        onChange={e => setMonitorEmailInput(e.target.value)}
                        onKeyDown={e => {
                          if ((e.key === 'Enter' || e.key === ',') && monitorEmailInput.trim()) {
                            e.preventDefault();
                            const email = monitorEmailInput.trim().replace(/,$/, '');
                            if (email && !monitorForm.alert_emails.includes(email)) {
                              setMonitorForm(f => ({ ...f, alert_emails: [...f.alert_emails, email] }));
                            }
                            setMonitorEmailInput('');
                          }
                        }}
                        onBlur={() => {
                          const email = monitorEmailInput.trim().replace(/,$/, '');
                          if (email && !monitorForm.alert_emails.includes(email)) {
                            setMonitorForm(f => ({ ...f, alert_emails: [...f.alert_emails, email] }));
                            setMonitorEmailInput('');
                          }
                        }}
                        placeholder="type email and press Enter"
                      />
                    </div>

                    {/* Enabled toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                      <label style={{ fontSize: 12, color: t.text, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={monitorForm.enabled} onChange={e => setMonitorForm(f => ({ ...f, enabled: e.target.checked }))} />
                        Monitor enabled
                      </label>
                    </div>

                    {/* Run History */}
                    {!isNew && (
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          Run History
                          <button onClick={() => refreshMonitorRuns(selectedMonitorId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textDim, fontSize: 11 }}>↻ Refresh</button>
                        </div>
                        {monitorRuns.length === 0 ? (
                          <div style={{ color: t.textDim, fontSize: 11, padding: '10px 0' }}>No runs yet. Click "Run Now" to execute immediately.</div>
                        ) : (
                          <table className="mon-run-table">
                            <thead>
                              <tr>
                                <th>Time</th>
                                <th>Status</th>
                                <th>HTTP</th>
                                <th>Response</th>
                                <th>Checks</th>
                              </tr>
                            </thead>
                            {monitorRuns.map(r => {
                              const passed = (r.checks || []).filter(c => c.passed).length;
                              const total  = (r.checks || []).length;
                              const hasChecks = total > 0;
                              return (
                                <tbody key={r.id}>
                                  <tr>
                                    <td style={{ color: t.textDim, fontFamily: 'monospace', fontSize: 11 }}>{r.started_at?.slice(0,19).replace('T',' ')}</td>
                                    <td><span className={`mon-pill ${r.status}`}>{r.status}</span></td>
                                    <td style={{ fontFamily: 'monospace' }}>{r.http_status || '—'}</td>
                                    <td style={{ fontFamily: 'monospace' }}>{r.response_ms ? `${r.response_ms}ms` : '—'}</td>
                                    <td style={{ fontFamily: 'monospace', color: passed === total && hasChecks ? t.success : hasChecks ? t.danger : t.textDim }}>
                                      {hasChecks ? `${passed}/${total}` : '—'}
                                      {r.error && <span style={{ color: t.danger, marginLeft: 6, fontSize: 10 }}>{r.error}</span>}
                                    </td>
                                  </tr>
                                  {hasChecks && (r.checks || []).map((c, ci) => (
                                    <tr key={`${r.id}-c${ci}`} style={{ background: c.passed ? `${t.success}08` : `${t.danger}08` }}>
                                      <td colSpan={5} style={{ paddingLeft: 20, paddingTop: 3, paddingBottom: 3, fontSize: 11, fontFamily: 'monospace' }}>
                                        <span style={{ color: c.passed ? t.success : t.danger, marginRight: 6 }}>{c.passed ? '✓' : '✗'}</span>
                                        <span style={{ color: t.textMuted }}>{c.check}</span>
                                        <span style={{ color: t.textDim, margin: '0 6px' }}>→</span>
                                        <span style={{ color: t.textDim }}>expected </span>
                                        <span style={{ color: t.text }}>{c.expected}</span>
                                        <span style={{ color: t.textDim, margin: '0 6px' }}>·</span>
                                        <span style={{ color: t.textDim }}>got </span>
                                        <span style={{ color: c.passed ? t.success : t.danger }}>{c.actual === 'None' ? '— field not found' : c.actual}</span>
                                      </td>
                                    </tr>
                                  ))}
                                  {r.response_preview && (r.checks || []).some(c => c.actual === 'None') && (
                                    <tr>
                                      <td colSpan={5} style={{ paddingLeft: 20, paddingTop: 2, paddingBottom: 6, fontSize: 10, fontFamily: 'monospace', color: t.textDim }}>
                                        <span style={{ color: t.textMuted, fontWeight: 600 }}>raw response: </span>
                                        <span style={{ wordBreak: 'break-all' }}>{r.response_preview}</span>
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              );
                            })}
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {showGrafana && (
          <div className="grafana-iframe-panel">
            <iframe
              src={`${window.location.origin}/grafana/d/k6/k6-load-testing-results?orgId=1&refresh=1s&kiosk=tv&theme=${theme}`}
              title="k6 Load Testing Results"
            />
          </div>
        )}

        <footer>GSA PLATFORM SUITE · K6 + GRAFANA + KUBERNETES · BUILT BY GSA TEAM</footer>
      </div>
    </>
  );
}
