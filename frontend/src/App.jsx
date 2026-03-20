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

  const [status,   setStatus]   = useState("idle");
  const [jobName,  setJobName]  = useState(null);
  const [message,  setMessage]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [jsonError,setJsonError]= useState("");
  const pollingRef = useRef(null);

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
        body: JSON.stringify({ ...form, payload: JSON.parse(form.payload) }),
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
          <div className="header-right">powered by Claude Code</div>
        </header>

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

            <div className="row2">
              <div className="field">
                <div className="slider-label">
                  <label>Virtual Users</label>
                  <span>{form.vus}</span>
                </div>
                <input type="range" min={1} max={500} value={form.vus}
                  onChange={(e) => set("vus")(+e.target.value)} />
              </div>
              <div className="field">
                <div className="slider-label">
                  <label>Duration</label>
                  <span>{form.duration}s</span>
                </div>
                <input type="range" min={10} max={600} step={10} value={form.duration}
                  onChange={(e) => set("duration")(+e.target.value)} />
              </div>
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

        <footer>PERFSTACK · K6 + GRAFANA + KUBERNETES · BUILT WITH CLAUDE CODE</footer>
      </div>
    </>
  );
}
