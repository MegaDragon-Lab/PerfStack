"""
PerfStack — FastAPI Backend
Orchestrates IAM auth, K6 script generation and Kubernetes job lifecycle
"""
import uuid
import json
import logging
import os
import pathlib
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from auth import IamAuthClient
from k8s_runner import create_k6_job, get_job_status, get_job_summary, get_job_pods, get_job_time_range

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="PerfStack API",
    description="Load testing orchestration — K6 + Grafana on Kubernetes",
    version="1.0.0",
    root_path="/api",
)


@app.on_event("startup")
async def _warmup_renderer():
    """Schedule renderer warm-up as a background task so startup completes immediately."""
    import asyncio
    asyncio.create_task(_do_warmup())


async def _do_warmup():
    """Fire a dummy render 20s after startup so Chromium is warm for the first report."""
    import asyncio, httpx
    await asyncio.sleep(20)   # wait for Grafana + renderer to be ready
    try:
        async with httpx.AsyncClient(timeout=60) as c:
            await c.get(
                "http://grafana:3000/grafana/render/d-solo/k6/k6-load-testing-results"
                "?orgId=1&panelId=1&from=now-5m&to=now&width=100&height=100&theme=dark",
                headers={"Authorization": "Basic YWRtaW46YWRtaW4="},
            )
        logger.info("Renderer warm-up complete")
    except Exception as e:
        logger.warning("Renderer warm-up failed (non-fatal): %s", e)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://frontend:3000",
        "http://localhost:30080",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic models ───────────────────────────────────────────────────────────

class StageConfig(BaseModel):
    duration: str
    target: int

class TestConfig(BaseModel):
    iam_url: str = Field(..., description="IAM token endpoint URL")
    client_id: str = Field(..., description="OAuth2 client ID")
    client_secret: str = Field(..., description="OAuth2 client secret")
    target_url: str = Field(..., description="URL to load test")
    payload: dict[str, Any] = Field(default={}, description="JSON body for each request")
    vus: int = Field(default=10, ge=1, le=2000, description="Virtual users")
    duration: int = Field(default=60, ge=10, le=3600, description="Test duration in seconds")
    scenario: str = Field(default="load", description="Test scenario type")
    stages: list[StageConfig] = Field(default=[], description="Custom k6 stages")


class TestResult(BaseModel):
    job_name: str
    status: str
    message: str


# ── Routes ────────────────────────────────────────────────────────────────────

INFLUXDB_URL = "http://influxdb:8086"
DATA_DIR = pathlib.Path(os.getenv("DATA_DIR", "/data"))
SCENARIOS_FILE = DATA_DIR / "custom_scenarios.json"
SERVICES_FILE  = DATA_DIR / "services.json"


def _read_file(path: pathlib.Path) -> list:
    try:
        return json.loads(path.read_text()) if path.exists() else []
    except Exception:
        return []

def _write_file(path: pathlib.Path, data: list) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))

def _read_scenarios() -> list:  return _read_file(SCENARIOS_FILE)
def _write_scenarios(data): _write_file(SCENARIOS_FILE, data)
def _read_services() -> list:   return _read_file(SERVICES_FILE)
def _write_services(data):  _write_file(SERVICES_FILE, data)


class CustomScenario(BaseModel):
    name: str
    stages: list[dict]


# ── Custom scenarios (persisted to /data/custom_scenarios.json) ───────────────

@app.get("/scenarios", summary="List all saved custom scenarios")
async def list_scenarios():
    return _read_scenarios()


@app.post("/scenarios", summary="Save or update a custom scenario")
async def save_scenario(scenario: CustomScenario):
    data = _read_scenarios()
    idx = next((i for i, s in enumerate(data) if s["name"] == scenario.name), None)
    entry = scenario.model_dump()
    if idx is not None:
        data[idx] = entry
    else:
        data.append(entry)
    _write_scenarios(data)
    return entry


@app.delete("/scenarios/{name}", summary="Delete a custom scenario")
async def delete_scenario(name: str):
    data = _read_scenarios()
    updated = [s for s in data if s["name"] != name]
    if len(updated) == len(data):
        raise HTTPException(status_code=404, detail=f"Scenario '{name}' not found")
    _write_scenarios(updated)
    return {"status": "deleted", "name": name}


class ServiceEntry(BaseModel):
    name: str
    folder: str = ""
    iam_url: str = ""
    client_id: str = ""
    client_secret: str = ""
    target_url: str = ""
    payload: str = '{}'
    vus: int = 10
    duration: int = 60


# ── Services (persisted to /data/services.json) ───────────────────────────────

@app.get("/services", summary="List all saved services")
async def list_services():
    return _read_services()


@app.post("/services", summary="Save or update a service")
async def save_service(service: ServiceEntry):
    data = _read_services()
    idx = next((i for i, s in enumerate(data) if s["name"] == service.name), None)
    entry = service.model_dump()
    if idx is not None:
        data[idx] = entry
    else:
        data.append(entry)
    _write_services(data)
    return entry


@app.delete("/services/{name}", summary="Delete a service")
async def delete_service(name: str):
    data = _read_services()
    updated = [s for s in data if s["name"] != name]
    if len(updated) == len(data):
        raise HTTPException(status_code=404, detail=f"Service '{name}' not found")
    _write_services(updated)
    return {"status": "deleted", "name": name}


@app.get("/health")
async def health():
    return {"status": "ok"}


class PingConfig(BaseModel):
    iam_url: str
    client_id: str
    client_secret: str
    target_url: str
    payload: dict[str, Any] = {}


@app.post("/ping-test", summary="Single dry-run request to validate config")
async def ping_test(config: PingConfig):
    """Authenticates with IAM, fires one POST to the target URL and returns the result."""
    import httpx, time

    # Step 1 — IAM auth
    try:
        auth = IamAuthClient(
            iam_url=config.iam_url,
            client_id=config.client_id,
            client_secret=config.client_secret,
        )
        bearer_token = await auth.get_bearer_token()
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"IAM authentication failed: {e}")

    # Step 2 — single request
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    try:
        async with httpx.AsyncClient(verify=False, timeout=30) as client:
            t0 = time.monotonic()
            resp = await client.post(config.target_url, json=config.payload, headers=headers)
            elapsed_ms = round((time.monotonic() - t0) * 1000, 2)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Request failed: {e}")

    try:
        body = resp.json()
    except Exception:
        body = resp.text

    return {
        "status_code": resp.status_code,
        "elapsed_ms": elapsed_ms,
        "response_headers": dict(resp.headers),
        "request_headers": {k: v if k.lower() != "authorization" else "Bearer ***" for k, v in headers.items()},
        "request_payload": config.payload,
        "response_body": body,
    }


@app.post("/reset-influxdb", summary="Delete all data from the k6 InfluxDB bucket")
async def reset_influxdb():
    """Deletes all data from the k6 bucket in InfluxDB v2."""
    import httpx
    INFLUXDB_URL  = "http://influxdb:8086"
    INFLUXDB_TOKEN = "perfstack-token"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{INFLUXDB_URL}/api/v2/delete",
                headers={"Authorization": f"Token {INFLUXDB_TOKEN}"},
                params={"org": "perfstack", "bucket": "k6"},
                json={"start": "1970-01-01T00:00:00Z", "stop": "2099-01-01T00:00:00Z"},
            )
            resp.raise_for_status()
    except Exception as e:
        logger.error("Failed to reset InfluxDB: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to reset InfluxDB: {e}")
    logger.info("InfluxDB k6 bucket reset")
    return {"status": "ok", "message": "InfluxDB k6 bucket reset successfully"}


@app.post("/run-test", response_model=TestResult, summary="Start a load test")
async def run_test(config: TestConfig):
    """
    1. Fetches a Bearer token from the IAM endpoint (OAuth2 client credentials)
    2. Renders a dynamic K6 script with the token and test parameters
    3. Creates a Kubernetes Job that runs K6 and streams metrics to InfluxDB
    """
    # Step 1 — IAM authentication
    try:
        auth = IamAuthClient(
            iam_url=config.iam_url,
            client_id=config.client_id,
            client_secret=config.client_secret,
        )
        bearer_token = await auth.get_bearer_token()
    except Exception as e:
        logger.error("IAM auth failed: %s", e)
        raise HTTPException(status_code=401, detail=f"IAM authentication failed: {e}")

    # Step 2 & 3 — create K8s Job
    job_name = f"k6-{uuid.uuid4().hex[:8]}"
    try:
        await create_k6_job(
            job_name=job_name,
            bearer_token=bearer_token,
            target_url=config.target_url,
            payload=config.payload,
            vus=config.vus,
            duration=config.duration,
            stages=[s.model_dump() for s in config.stages],
        )
    except Exception as e:
        logger.error("Failed to create K6 job: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to create K6 job: {e}")

    logger.info("Test started: job=%s scenario=%s vus=%d duration=%ds", job_name, config.scenario, config.vus, config.duration)
    return TestResult(
        job_name=job_name,
        status="created",
        message=f"Load test started — {config.vus} VUs for {config.duration}s",
    )


@app.get("/test-status/{job_name}", response_model=TestResult, summary="Get test status")
async def test_status(job_name: str):
    """Poll the status of a running or completed K6 Job."""
    try:
        status, message = await get_job_status(job_name)
        return TestResult(job_name=job_name, status=status, message=message)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/report/{job_name}", summary="Generate Grafana-powered HTML performance report")
async def get_report(job_name: str):
    """Renders Grafana dashboard panels via grafana-image-renderer and assembles a self-contained HTML report."""
    import time as _t
    import httpx
    from fastapi.responses import HTMLResponse

    try:
        summary = await get_job_summary(job_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    try:
        from_ms, to_ms = await get_job_time_range(job_name)
    except Exception:
        to_ms   = int(_t.time() * 1000)
        from_ms = to_ms - 30 * 60 * 1000

    # Query InfluxDB for peak req/s — sum http_2xx per 1s window, take max in Python
    peak_rps = 0.0
    try:
        q = (f'SELECT sum("value") FROM "http_2xx" '
             f'WHERE time >= {from_ms}ms AND time <= {to_ms}ms '
             f'GROUP BY time(1s) fill(0)')
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(
                "http://influxdb:8086/query",
                params={"db": "k6", "q": q, "epoch": "ms"},
                headers={"Authorization": "Token perfstack-token"},
            )
            data = r.json()
            vals = data["results"][0]["series"][0]["values"]
            peak_rps = float(max((v[1] for v in vals if v[1] is not None), default=0))
    except Exception as e:
        logger.warning("Peak RPS query failed: %s", e)

    html = _build_report_html(job_name, summary, from_ms, to_ms, peak_rps)
    return HTMLResponse(content=html)


@app.get("/report/{job_name}/panel/{panel_id}", summary="Render one Grafana panel (progressive loading)")
async def get_report_panel(job_name: str, panel_id: int, from_ms: int, to_ms: int):
    """Renders a single Grafana panel via image renderer. Called by the report page JS for progressive chart loading."""
    import base64, httpx
    from fastapi.responses import JSONResponse

    PANEL_SIZES = {1: (600, 280), 17: (600, 280), 7: (600, 280), 5: (1400, 420), 8: (1400, 420)}
    if panel_id not in PANEL_SIZES:
        raise HTTPException(status_code=404, detail=f"Unknown panel {panel_id}")

    width, height = PANEL_SIZES[panel_id]
    url = (
        f"http://grafana:3000/grafana/render/d-solo/k6/k6-load-testing-results"
        f"?orgId=1&panelId={panel_id}&from={from_ms}&to={to_ms}"
        f"&width={width}&height={height}&theme=dark&var-Measurement=http_req_duration"
    )
    import asyncio
    last_err: Exception | None = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=90) as c:
                r = await c.get(url, headers={"Authorization": "Basic YWRtaW46YWRtaW4="})
                r.raise_for_status()
                return {"img": base64.b64encode(r.content).decode()}
        except Exception as e:
            last_err = e
            if attempt < 2:
                await asyncio.sleep(3 * (attempt + 1))  # 3s, then 6s
    logger.warning("Panel render failed after retries (panelId=%d): %s", panel_id, last_err)
    return JSONResponse(status_code=503, content={"img": None, "error": str(last_err)})


def _fmt_ms(ms: float) -> str:
    if ms >= 1000:
        return f"{ms/1000:.2f} s"
    return f"{ms:.1f} ms"

def _fmt_bytes(b: float) -> str:
    if b >= 1_048_576:
        return f"{b/1_048_576:.1f} MB"
    if b >= 1024:
        return f"{b/1024:.1f} KB"
    return f"{b:.0f} B"

def _chart_block(title: str, panel_id: int, wide: bool = False) -> str:
    cls = "chart-card chart-wide" if wide else "chart-card"
    inner = '<div class="chart-placeholder"><div class="spinner"></div><span>Loading chart\u2026</span></div>'
    return f'<div id="chart-p{panel_id}" class="{cls}"><div class="chart-title">{title}</div>{inner}</div>'

def _build_report_html(
    job_name: str,
    summary: dict,
    from_ms: int,
    to_ms: int,
    peak_rps: float,
) -> str:
    from datetime import datetime, timezone

    m      = summary.get("metrics", {})
    meta   = summary.get("meta",    {})
    checks = summary.get("checks",  [])

    dur_ms  = to_ms - from_ms
    dur_s   = dur_ms / 1000

    total_reqs    = int(m.get("http_reqs",    {}).get("count", 0))
    avg_rps       = m.get("http_reqs",    {}).get("rate",  0)
    err_rate      = m.get("http_req_failed", {}).get("rate", 0) * 100
    data_rx       = m.get("data_received",   {}).get("count", 0)
    data_tx       = m.get("data_sent",       {}).get("count", 0)
    peak_vus      = int(m.get("vus_max", {}).get("value", meta.get("vus", 0)))
    checks_pass   = m.get("checks", {}).get("rate", 0) * 100
    iters         = int(m.get("iterations",  {}).get("count", 0))
    iter_rate     = m.get("iterations",    {}).get("rate",  0)
    rx_rate       = m.get("data_received", {}).get("rate",  0)
    tx_rate       = m.get("data_sent",     {}).get("rate",  0)

    dur_key = "http_req_duration"
    if dur_key not in m and "custom_req_duration" in m:
        dur_key = "custom_req_duration"
    dr = m.get(dur_key, {})
    p_avg = dr.get("avg",   0)
    p_min = dr.get("min",   0)
    p_med = dr.get("med",   0)
    p90   = dr.get("p(90)", 0)
    p95   = dr.get("p(95)", 0)
    p99   = dr.get("p(99)", 0) or dr.get("p99", 0)
    p_max = dr.get("max",   0)

    err_color   = "#ef4444" if err_rate > 5 else "#22c55e" if err_rate == 0 else "#f59e0b"
    check_color = "#22c55e" if checks_pass >= 99 else "#f59e0b" if checks_pass >= 90 else "#ef4444"
    p95_color   = "#ef4444" if p95 > 2000 else "#f59e0b" if p95 > 1000 else "#22c55e"

    gen_time = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    test_ts  = meta.get("timestamp", "")[:19].replace("T", " ") if meta.get("timestamp") else gen_time
    target   = meta.get("target_url", "—")
    conf_vus = meta.get("vus", peak_vus)
    conf_dur = meta.get("duration", round(dur_s))

    checks_html = ""
    for ck in checks[:20]:
        ck_ok    = ck.get("fails", 0) == 0
        ck_color = "#22c55e" if ck_ok else "#ef4444"
        ck_icon  = "✓" if ck_ok else "✗"
        checks_html += f'''
        <tr>
          <td><span style="color:{ck_color}">{ck_icon}</span> {ck.get("name","—")}</td>
          <td class="num">{ck.get("passes",0):,}</td>
          <td class="num" style="color:{ck_color}">{ck.get("fails",0):,}</td>
        </tr>'''

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>PerfStack Report — {job_name}</title>
<style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{background:#0f1117;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6}}
  .page{{max-width:1400px;margin:0 auto;padding:32px 24px}}

  /* ── Header ── */
  .header{{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding:24px 28px;background:#1a1f2e;border:1px solid #2d3748;border-radius:12px;margin-bottom:24px}}
  .header-left{{display:flex;align-items:center;gap:20px}}
  .logo-text{{font-size:22px;font-weight:700;letter-spacing:-0.5px;background:linear-gradient(135deg,#6366f1,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent}}
  .job-name{{font-size:20px;font-weight:600;color:#f1f5f9;margin-bottom:4px}}
  .badge{{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:.5px;background:#166534;color:#86efac;text-transform:uppercase}}
  .header-meta{{display:grid;grid-template-columns:repeat(4,auto);gap:12px 28px}}
  .meta-item{{display:flex;flex-direction:column;gap:2px}}
  .meta-label{{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.6px}}
  .meta-value{{font-size:13px;color:#cbd5e1;font-weight:500;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}

  /* ── KPI Grid ── */
  .kpi-grid{{display:grid;grid-template-columns:repeat(7,1fr);gap:12px;margin-bottom:24px}}
  .kpi-card{{background:#1a1f2e;border:1px solid #2d3748;border-radius:10px;padding:16px 14px}}
  .kpi-value{{font-size:26px;font-weight:700;line-height:1.1;margin-bottom:4px}}
  .kpi-label{{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}}
  .kpi-sub{{font-size:11px;color:#475569}}
  .blue{{color:#6366f1}} .green{{color:#22c55e}} .yellow{{color:#f59e0b}} .purple{{color:#a78bfa}}

  /* ── Charts ── */
  .charts-row{{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px}}
  .chart-card{{background:#1a1f2e;border:1px solid #2d3748;border-radius:10px;overflow:hidden}}
  .chart-card.chart-wide{{grid-column:1/-1}}
  .chart-title{{font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.6px;padding:12px 16px 8px}}
  .chart-card img{{width:100%;display:block}}
  .chart-na{{padding:40px 20px;text-align:center;color:#475569;font-size:12px;font-style:italic}}
  .chart-placeholder{{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:40px 20px;min-height:150px;color:#475569;font-size:12px}}
  @keyframes spin{{to{{transform:rotate(360deg)}}}}
  .spinner{{width:24px;height:24px;border:2px solid #2d3748;border-top-color:#6366f1;border-radius:50%;animation:spin 0.8s linear infinite}}

  /* ── Tables ── */
  .section{{background:#1a1f2e;border:1px solid #2d3748;border-radius:10px;padding:20px;margin-bottom:12px}}
  .section h2{{font-size:13px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.6px;margin-bottom:16px}}
  table{{width:100%;border-collapse:collapse}}
  th{{font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;padding:8px 12px;border-bottom:1px solid #2d3748;text-align:left}}
  td{{padding:8px 12px;border-bottom:1px solid #1e2535;color:#cbd5e1;font-size:13px}}
  tr:last-child td{{border-bottom:none}}
  tr:hover td{{background:#1e2535}}
  .num{{text-align:right;font-variant-numeric:tabular-nums}}
  .hl{{font-weight:600;color:#f1f5f9}}

  /* ── Footer ── */
  .footer{{text-align:center;color:#334155;font-size:11px;margin-top:32px;padding-top:16px;border-top:1px solid #1e2535}}
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="header-left">
      <div class="logo-text">PerfStack</div>
      <div>
        <div class="job-name">{job_name}</div>
        <span class="badge">Completed</span>
      </div>
    </div>
    <div class="header-meta">
      <div class="meta-item"><span class="meta-label">Target</span><span class="meta-value" title="{target}">{target[:70]}{"…" if len(target)>70 else ""}</span></div>
      <div class="meta-item"><span class="meta-label">Config</span><span class="meta-value">{conf_vus} VUs · {conf_dur}s</span></div>
      <div class="meta-item"><span class="meta-label">Started</span><span class="meta-value">{test_ts}</span></div>
      <div class="meta-item"><span class="meta-label">Report generated</span><span class="meta-value">{gen_time}</span></div>
    </div>
  </div>

  <!-- KPI CARDS -->
  <div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-value blue">{total_reqs:,}</div><div class="kpi-label">Total Requests</div><div class="kpi-sub">{avg_rps:.1f} req/s avg</div></div>
    <div class="kpi-card"><div class="kpi-value purple">{peak_rps:.1f}</div><div class="kpi-label">Peak req/s</div><div class="kpi-sub">{iters:,} iterations</div></div>
    <div class="kpi-card"><div class="kpi-value" style="color:{err_color}">{err_rate:.2f}%</div><div class="kpi-label">Error Rate</div><div class="kpi-sub">{int(total_reqs*err_rate/100):,} failed</div></div>
    <div class="kpi-card"><div class="kpi-value yellow">{_fmt_ms(p_avg)}</div><div class="kpi-label">Avg Response</div><div class="kpi-sub">med {_fmt_ms(p_med)}</div></div>
    <div class="kpi-card"><div class="kpi-value" style="color:{p95_color}">{_fmt_ms(p95)}</div><div class="kpi-label">p95 Response</div><div class="kpi-sub">p90 {_fmt_ms(p90)}</div></div>
    <div class="kpi-card"><div class="kpi-value yellow">{_fmt_ms(p_max)}</div><div class="kpi-label">Max Response</div><div class="kpi-sub">min {_fmt_ms(p_min)}</div></div>
    <div class="kpi-card"><div class="kpi-value" style="color:{check_color}">{checks_pass:.1f}%</div><div class="kpi-label">Checks Passed</div><div class="kpi-sub">{_fmt_bytes(data_rx)} received</div></div>
  </div>

  <!-- CHARTS ROW 1: VUs / RPS / Errors -->
  <div class="charts-row" style="margin-bottom:12px">
    {_chart_block("Virtual Users", 1)}
    {_chart_block("Requests per Second", 17)}
    {_chart_block("Errors per Second", 7)}
  </div>

  <!-- CHARTS FULL WIDTH -->
  <div class="charts-row" style="margin-bottom:12px">
    {_chart_block("Response Time — p90 / p95 / max / min  (http_req_duration)", 5, wide=True)}
  </div>
  <div class="charts-row" style="margin-bottom:24px">
    {_chart_block("Response Time Heatmap", 8, wide=True)}
  </div>

  <!-- RESPONSE TIME TABLE -->
  <div class="section">
    <h2>Response Time Breakdown</h2>
    <table>
      <thead><tr><th>Metric</th><th class="num">Min</th><th class="num">Avg</th><th class="num">Median</th><th class="num">p90</th><th class="num">p95</th><th class="num">p99</th><th class="num">Max</th></tr></thead>
      <tbody>
        <tr>
          <td class="hl">http_req_duration</td>
          <td class="num">{_fmt_ms(p_min)}</td>
          <td class="num">{_fmt_ms(p_avg)}</td>
          <td class="num">{_fmt_ms(p_med)}</td>
          <td class="num">{_fmt_ms(p90)}</td>
          <td class="num" style="color:{p95_color}">{_fmt_ms(p95)}</td>
          <td class="num">{_fmt_ms(p99)}</td>
          <td class="num">{_fmt_ms(p_max)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- THROUGHPUT TABLE -->
  <div class="section">
    <h2>Throughput &amp; Data</h2>
    <table>
      <thead><tr><th>Metric</th><th class="num">Total</th><th class="num">Rate</th></tr></thead>
      <tbody>
        <tr><td class="hl">HTTP Requests</td><td class="num">{total_reqs:,}</td><td class="num">{avg_rps:.2f} req/s</td></tr>
        <tr><td class="hl">Iterations</td><td class="num">{iters:,}</td><td class="num">{iter_rate:.2f} iter/s</td></tr>
        <tr><td class="hl">Data Received</td><td class="num">{_fmt_bytes(data_rx)}</td><td class="num">{_fmt_bytes(rx_rate)}/s</td></tr>
        <tr><td class="hl">Data Sent</td><td class="num">{_fmt_bytes(data_tx)}</td><td class="num">{_fmt_bytes(tx_rate)}/s</td></tr>
      </tbody>
    </table>
  </div>

  <!-- CHECKS TABLE -->
  {"" if not checks_html else f'''<div class="section"><h2>Checks</h2><table>
  <thead><tr><th>Name</th><th class="num">Passes</th><th class="num">Fails</th></tr></thead>
  <tbody>{checks_html}</tbody></table></div>'''}

  <div class="footer">PerfStack v2.0.3 &nbsp;·&nbsp; {gen_time} &nbsp;·&nbsp; epc_owner@fico.com</div>
</div>
<script>
(function() {{
  var JOB  = '{job_name}';
  var FROM = {from_ms};
  var TO   = {to_ms};
  var panels = [
    {{divId:'chart-p1',  panelId:1}},
    {{divId:'chart-p17', panelId:17}},
    {{divId:'chart-p7',  panelId:7}},
    {{divId:'chart-p5',  panelId:5}},
    {{divId:'chart-p8',  panelId:8}}
  ];
  panels.forEach(function(p, i) {{
    setTimeout(function() {{
      var url = '/api/report/'+JOB+'/panel/'+p.panelId+'?from_ms='+FROM+'&to_ms='+TO;
      var card = document.getElementById(p.divId);
      if (!card) return;
      fetch(url)
        .then(function(r) {{ return r.json(); }})
        .then(function(data) {{
          var ph = card.querySelector('.chart-placeholder');
          if (!ph) return;
          if (data.img) {{
            ph.outerHTML = '<img src="data:image/png;base64,'+data.img+'" alt="chart" style="width:100%;display:block"/>';
          }} else {{
            ph.outerHTML = '<div class="chart-na">Chart unavailable \u2014 try refreshing</div>';
          }}
        }})
        .catch(function() {{
          var ph = card.querySelector('.chart-placeholder');
          if (ph) ph.outerHTML = '<div class="chart-na">Render failed</div>';
        }});
    }}, i * 500);
  }});
}})();
</script>
</body>
</html>"""


@app.get("/job-pods/{job_name}", summary="Get real-time status of k6 runner pods")
async def job_pods(job_name: str):
    """Returns pod name, status, VUs, CPU and memory for every runner pod."""
    try:
        pods = await get_job_pods(job_name)
        return pods
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/test-summary/{job_name}", summary="Get k6 summary metrics for a completed test")
async def test_summary(job_name: str):
    """Returns the structured k6 summary JSON captured from pod logs."""
    try:
        status, _ = await get_job_status(job_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    if status not in ("completed", "failed"):
        raise HTTPException(status_code=409, detail="Test not yet completed")

    try:
        summary = await get_job_summary(job_name)
        return summary
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
