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
              <div className="grafana-link">
                📊 View live metrics in Grafana →{" "}
                <a href={`http://${window.location.hostname}:30300`} target="_blank" rel="noreferrer">
                  Grafana Dashboard
                </a>
              </div>
            )}
          </div>
        </main>

        {showGrafana && (
          <div className="grafana-iframe-panel">
            <iframe
              src={`${window.location.origin}/grafana/d/k6/k6-load-testing-results?orgId=1&refresh=5s&kiosk=tv`}
              title="k6 Load Testing Results"
            />
          </div>
        )}

        <footer>PERFSTACK · K6 + GRAFANA + KUBERNETES · BUILT BY GSA TEAM</footer>
      </div>
    </>
  );
}
