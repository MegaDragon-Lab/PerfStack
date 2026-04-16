"""
PerfStack — FastAPI Backend
Orchestrates IAM auth, K6 script generation and Kubernetes job lifecycle
"""
import uuid
import json
import logging
import os
import pathlib
import asyncio
import time as _time
import tarfile
import io
import re
from datetime import datetime, timezone
from typing import Any

import yaml
from kubernetes import client as k8s_client

import secrets
from fastapi import FastAPI, HTTPException, Cookie, Request, Query
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

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

_scheduler = AsyncIOScheduler()


@app.on_event("startup")
async def _on_startup():
    """Start scheduler, re-register all enabled monitors, warm up renderer."""
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    _scheduler.start()
    for m in _read_monitors():
        if m.get("enabled"):
            _schedule_monitor(m)
    logger.info("Monitor scheduler started (%d monitors loaded)", len(_read_monitors()))
    asyncio.create_task(_do_warmup())


@app.on_event("shutdown")
async def _on_shutdown():
    _scheduler.shutdown(wait=False)


async def _do_warmup():
    """Fire a dummy render 20s after startup so Chromium is warm for the first report."""
    import httpx
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
    iam_url: str = Field(default="", description="IAM token endpoint URL")
    client_id: str = Field(default="", description="OAuth2 client ID")
    client_secret: str = Field(default="", description="OAuth2 client secret")
    use_user_token: bool = Field(default=False, description="Use the logged-in user's DMS session token instead of client credentials")
    target_url: str = Field(..., description="URL to load test")
    payload: dict[str, Any] = Field(default={}, description="JSON body for each request")
    vus: int = Field(default=10, ge=1, le=2000, description="Virtual users")
    duration: int = Field(default=60, ge=10, le=3600, description="Test duration in seconds")
    scenario: str = Field(default="load", description="Test scenario type")
    stages: list[StageConfig] = Field(default=[], description="Custom k6 stages")
    service_name: str = Field(default="", description="Name of the web service being tested")
    sleep_interval: float = Field(default=0.1, ge=0, le=60, description="Sleep between requests in seconds (e.g. 0.1 = 100ms)")
    parallelism: int = Field(default=4, ge=1, le=20, description="Number of parallel k6 runner pods")

class TestHistoryEntry(BaseModel):
    job_name: str
    service_name: str = ""
    scenario: str = "load"
    vus: int = 10
    duration: int = 60
    parallelism: int = 1
    sleep_interval: float = 0.0
    started_at: str = ""
    completed_at: str = ""
    status: str = "running"
    peak_rps: float = 0.0
    report_saved: bool = False


class TestResult(BaseModel):
    job_name: str
    status: str
    message: str


class BodyCheck(BaseModel):
    field: str        # dot-path e.g. "data.status"
    operator: str     # "eq" | "contains" | "exists"
    value: str = ""


class Monitor(BaseModel):
    id: str = ""
    name: str
    service_name: str = ""
    target_url: str
    method: str = "POST"
    headers: dict = {}
    payload: dict = {}
    iam_url: str = ""
    client_id: str = ""
    client_secret: str = ""
    expected_status: int = 200
    max_response_ms: int = 5000
    body_checks: list[BodyCheck] = []
    interval: str = "1h"          # "5m"|"15m"|"30m"|"1h"|"6h"|"24h"
    alert_emails: list[str] = []
    enabled: bool = True
    created_at: str = ""
    last_status: str = ""         # "ok"|"ko"|"error"|""


class MonitorRun(BaseModel):
    id: str = ""
    monitor_id: str
    monitor_name: str
    started_at: str
    status: str                   # "ok"|"ko"|"error"
    http_status: int = 0
    response_ms: int = 0
    error: str = ""
    checks: list[dict] = []       # [{check, passed, expected, actual}]
    response_preview: str = ""    # first 500 chars of raw response body (debug)


class EmailConfig(BaseModel):
    smtp_host: str = ""
    smtp_port: int = 587
    use_tls: bool = True
    username: str = ""
    password: str = ""
    from_addr: str = ""


# ── Routes ────────────────────────────────────────────────────────────────────

INFLUXDB_URL = "http://influxdb:8086"
DATA_DIR = pathlib.Path(os.getenv("DATA_DIR", "/data"))
SCENARIOS_FILE     = DATA_DIR / "custom_scenarios.json"
SERVICES_FILE      = DATA_DIR / "services.json"
HISTORY_FILE       = DATA_DIR / "history.json"
REPORTS_DIR        = DATA_DIR / "reports"
MONITORS_FILE      = DATA_DIR / "monitors.json"
MONITOR_RUNS_FILE  = DATA_DIR / "monitor_runs.json"
EMAIL_CONFIG_FILE  = DATA_DIR / "email_config.json"
APPS_FILE          = DATA_DIR / "deployed_apps.json"
BUILDS_FILE        = DATA_DIR / "builds.json"
SESSIONS_FILE      = DATA_DIR / "sessions.json"

# ── DeployStack constants ─────────────────────────────────────────────────────
GITEA_INTERNAL_URL = "http://gitea.gitea.svc.cluster.local:3000"
GITEA_ADMIN_USER   = "gsaadmin"
GITEA_ADMIN_PASS   = "admin"
LOCAL_REGISTRY     = "localhost:5001"          # host-side push (via Docker socket)
CLUSTER_REGISTRY   = "k3d-perfstack-registry:5000"  # in-cluster pull reference
WEBHOOK_SECRET     = "perfstack-deploy-secret"
PUBLIC_HOST        = os.getenv("PUBLIC_HOST", "localhost")
BUILDS_CONTEXT_DIR = DATA_DIR / "builds"


def _read_file(path: pathlib.Path) -> list:
    try:
        return json.loads(path.read_text()) if path.exists() else []
    except Exception:
        return []

def _write_file(path: pathlib.Path, data: list) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))

def _read_file_dict(path: pathlib.Path) -> dict:
    try:
        return json.loads(path.read_text()) if path.exists() else {}
    except Exception:
        return {}

def _write_file_dict(path: pathlib.Path, data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))

def _read_scenarios() -> list:       return _read_file(SCENARIOS_FILE)
def _write_scenarios(data):          _write_file(SCENARIOS_FILE, data)
def _read_services() -> list:        return _read_file(SERVICES_FILE)
def _write_services(data):           _write_file(SERVICES_FILE, data)
def _read_history() -> list:         return _read_file(HISTORY_FILE)
def _write_history(data):            _write_file(HISTORY_FILE, data)
def _read_monitors() -> list:        return _read_file(MONITORS_FILE)
def _write_monitors(data):           _write_file(MONITORS_FILE, data)
def _read_monitor_runs() -> list:    return _read_file(MONITOR_RUNS_FILE)
def _write_monitor_runs(data):       _write_file(MONITOR_RUNS_FILE, data)
def _read_email_config() -> dict:    return _read_file_dict(EMAIL_CONFIG_FILE)
def _write_email_config(data: dict): _write_file_dict(EMAIL_CONFIG_FILE, data)
def _read_apps() -> list:            return _read_file(APPS_FILE)
def _write_apps(data):               _write_file(APPS_FILE, data)
def _read_builds() -> list:          return _read_file(BUILDS_FILE)
def _write_builds(data):             _write_file(BUILDS_FILE, data)
def _read_sessions() -> dict:        return _read_file_dict(SESSIONS_FILE)
def _write_sessions(data: dict):     _write_file_dict(SESSIONS_FILE, data)


class CustomScenario(BaseModel):
    name: str
    stages: list[dict]


# ── Auth — DMS Console SSO ───────────────────────────────────────────────────

ALLOWED_ORG   = "FICO-GPS-TENANT"
SESSION_MAX_AGE = 86400 * 7  # 7 days

@app.get("/auth/dms-login", summary="DMS bookmarklet callback — sets session cookie")
async def dms_login(uid: str, cn: str, o: str, token: str = "", token_exp: str = ""):
    if o != ALLOWED_ORG:
        raise HTTPException(403, f"Access denied — organisation '{o}' is not allowed")
    session_id = secrets.token_urlsafe(32)
    sessions = _read_sessions()
    sessions[session_id] = {"uid": uid, "cn": cn, "org": o, "token": token, "token_exp": token_exp}
    _write_sessions(sessions)
    response = RedirectResponse(url="/", status_code=302)
    response.set_cookie("ps_session", session_id, httponly=True, samesite="lax", max_age=SESSION_MAX_AGE)
    return response

@app.get("/auth/me", summary="Return current user or 401")
async def auth_me(ps_session: str = Cookie(default=None)):
    if not ps_session:
        raise HTTPException(401, "Not authenticated")
    sessions = _read_sessions()
    if ps_session not in sessions:
        raise HTTPException(401, "Not authenticated")
    s = sessions[ps_session]
    return {"uid": s["uid"], "cn": s["cn"], "org": s["org"],
            "has_token": bool(s.get("token")), "token_exp": s.get("token_exp", "")}

@app.get("/auth/internal-session", summary="Internal — return token for a ps_session (server-to-server only)")
async def auth_internal_session(request: Request, ps_session: str = Cookie(default=None)):
    """Called by internal services (e.g. dmp-cost-simulation) to retrieve the DMS token.
    Requires X-Internal-Key header matching the INTERNAL_API_KEY env var."""
    api_key = os.getenv("INTERNAL_API_KEY", "")
    if not api_key or request.headers.get("X-Internal-Key") != api_key:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not ps_session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    sessions = _read_sessions()
    if ps_session not in sessions:
        raise HTTPException(status_code=401, detail="Session not found or expired")
    s = sessions[ps_session]
    token = s.get("token", "")
    if not token:
        raise HTTPException(status_code=401, detail="No DMS token in session — please re-login with the bookmarklet")
    return {"token": token, "uid": s.get("uid", ""), "cn": s.get("cn", ""), "token_exp": s.get("token_exp", "")}

@app.get("/auth/logout", summary="Clear session and redirect to home")
async def auth_logout(ps_session: str = Cookie(default=None)):
    if ps_session:
        sessions = _read_sessions()
        sessions.pop(ps_session, None)
        _write_sessions(sessions)
    response = RedirectResponse(url="/", status_code=302)
    response.delete_cookie("ps_session")
    return response

@app.get("/deploy/check-auth", summary="Nginx auth_request endpoint — validates ps_session cookie")
async def deploy_check_auth(request: Request):
    """Returns 200 with user-identity headers if session valid, 401 otherwise.

    On 200, nginx forwards X-User-Id / X-User-CN / X-User-Org to the upstream
    app automatically via the auth-response-headers ingress annotation.
    The app just reads these headers — no session logic needed.
    """
    ps_session = request.cookies.get("ps_session")
    if not ps_session:
        return JSONResponse(status_code=401, content={"detail": "Not authenticated"})
    sessions = _read_sessions()
    if ps_session not in sessions:
        return JSONResponse(status_code=401, content={"detail": "Session expired"})
    s = sessions[ps_session]
    return JSONResponse(
        status_code=200,
        content={"status": "ok"},
        headers={
            "X-User-Id":  s.get("uid", ""),
            "X-User-CN":  s.get("cn", ""),
            "X-User-Org": s.get("org", ""),
        },
    )


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


@app.get("/config", summary="Public client configuration (PUBLIC_HOST, Gitea URL)")
async def get_config():
    return {
        "public_host": PUBLIC_HOST,
        "gitea_url": f"http://{PUBLIC_HOST}/gitea",
    }


class PingConfig(BaseModel):
    iam_url: str = ""
    client_id: str = ""
    client_secret: str = ""
    use_user_token: bool = False
    target_url: str
    payload: dict[str, Any] = {}


@app.post("/ping-test", summary="Single dry-run request to validate config")
async def ping_test(config: PingConfig, ps_session: str = Cookie(default=None)):
    """Authenticates with IAM (or uses DMS session token), fires one POST to the target URL and returns the result."""
    import httpx, time

    # Step 1 — resolve bearer token
    try:
        if config.use_user_token:
            _s = _read_sessions()
            if not ps_session or ps_session not in _s:
                raise HTTPException(status_code=401, detail="No active DMS session — please log in again")
            bearer_token = _s[ps_session].get("token", "")
            if not bearer_token:
                raise HTTPException(status_code=401, detail="DMS session has no token — re-login with the bookmarklet")
        else:
            auth = IamAuthClient(
                iam_url=config.iam_url,
                client_id=config.client_id,
                client_secret=config.client_secret,
            )
            bearer_token = await auth.get_bearer_token()
    except HTTPException:
        raise
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
async def run_test(config: TestConfig, ps_session: str = Cookie(default=None)):
    """
    1. Fetches a Bearer token (from IAM or DMS session)
    2. Renders a dynamic K6 script with the token and test parameters
    3. Creates a Kubernetes Job that runs K6 and streams metrics to InfluxDB
    """
    # Step 1 — resolve bearer token
    try:
        if config.use_user_token:
            _s = _read_sessions()
            if not ps_session or ps_session not in _s:
                raise HTTPException(status_code=401, detail="No active DMS session — please log in again")
            bearer_token = _s[ps_session].get("token", "")
            if not bearer_token:
                raise HTTPException(status_code=401, detail="DMS session has no token — re-login with the bookmarklet")
        else:
            auth = IamAuthClient(
                iam_url=config.iam_url,
                client_id=config.client_id,
                client_secret=config.client_secret,
            )
            bearer_token = await auth.get_bearer_token()
    except HTTPException:
        raise
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
            sleep_interval=config.sleep_interval,
            parallelism=config.parallelism,
        )
    except Exception as e:
        logger.error("Failed to create K6 job: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to create K6 job: {e}")

    from datetime import datetime, timezone
    entry = TestHistoryEntry(
        job_name=job_name,
        service_name=config.service_name,
        scenario=config.scenario,
        vus=config.vus,
        duration=config.duration,
        parallelism=config.parallelism,
        sleep_interval=config.sleep_interval,
        started_at=datetime.now(timezone.utc).isoformat(),
        status="running",
    )
    history = _read_history()
    history.insert(0, entry.model_dump())
    _write_history(history)

    logger.info("Test started: job=%s scenario=%s vus=%d duration=%ds", job_name, config.scenario, config.vus, config.duration)
    return TestResult(
        job_name=job_name,
        status="created",
        message=f"Load test started — {config.vus} VUs for {config.duration}s",
    )


@app.get("/test-status/{job_name}", response_model=TestResult, summary="Get test status")
async def test_status(job_name: str):
    """Poll the status of a running or completed K6 Job."""
    import asyncio
    try:
        status, message = await get_job_status(job_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Update history entry when job finishes
    if status in ("completed", "failed"):
        from datetime import datetime, timezone
        history = _read_history()
        updated = False
        for h in history:
            if h.get("job_name") == job_name and h.get("status") == "running":
                h["status"] = status
                h["completed_at"] = datetime.now(timezone.utc).isoformat()
                updated = True
                break
        if updated:
            _write_history(history)
        # Trigger background report save once (only if not already saved)
        if status == "completed":
            saved_path = REPORTS_DIR / f"{job_name}.html"
            if not saved_path.exists():
                asyncio.create_task(_save_report_to_pvc(job_name))

    return TestResult(job_name=job_name, status=status, message=message)


async def _fetch_panel_b64(job_name: str, panel_id: int, from_ms: int, to_ms: int, theme: str = "dark") -> str:
    """Fetch a single Grafana panel as base64 PNG, with retries. Returns empty string on failure."""
    import asyncio, base64, httpx
    PANEL_SIZES = {1: (600, 280), 17: (600, 280), 7: (600, 280), 5: (1400, 420), 8: (1400, 420)}
    w, h = PANEL_SIZES.get(panel_id, (600, 280))
    url = (
        f"http://grafana:3000/grafana/render/d-solo/k6/k6-load-testing-results"
        f"?orgId=1&panelId={panel_id}&from={from_ms}&to={to_ms}"
        f"&width={w}&height={h}&theme={theme}&var-Measurement=http_req_duration"
    )
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=90) as c:
                r = await c.get(url, headers={"Authorization": "Basic YWRtaW46YWRtaW4="})
                r.raise_for_status()
                return base64.b64encode(r.content).decode()
        except Exception as e:
            if attempt < 2:
                await asyncio.sleep(3 * (attempt + 1))
    return ""


async def _query_influx_stats(from_ms: int, to_ms: int) -> dict:
    """Query InfluxDB for aggregate stats across all pods. Returns dict with peak_rps,
    total_reqs, avg, med, p90, p95, p99, p_min, p_max (all floats; 0 on failure)."""
    import httpx
    result = {"peak_rps": 0.0, "total_reqs": 0, "total_iters": 0,
              "avg": 0.0, "med": 0.0, "p90": 0.0, "p95": 0.0, "p99": 0.0,
              "p_min": 0.0, "p_max": 0.0}
    try:
        q_rps  = (f'SELECT sum("value") FROM "http_reqs" '
                  f'WHERE time >= {from_ms}ms AND time <= {to_ms}ms '
                  f'GROUP BY time(1s) fill(0)')
        q_iter = (f'SELECT count("value") FROM "iterations" '
                  f'WHERE time >= {from_ms}ms AND time <= {to_ms}ms')
        q_lat  = (f'SELECT median("value") AS med, mean("value") AS avg, '
                  f'percentile("value",90) AS p90, percentile("value",95) AS p95, '
                  f'percentile("value",99) AS p99, min("value") AS p_min, max("value") AS p_max '
                  f'FROM "http_req_duration" '
                  f'WHERE time >= {from_ms}ms AND time <= {to_ms}ms')
        async with httpx.AsyncClient(timeout=15) as c:
            r_rps  = await c.get("http://influxdb:8086/query",
                                 params={"db": "k6", "q": q_rps,  "epoch": "ms"},
                                 headers={"Authorization": "Token perfstack-token"})
            r_iter = await c.get("http://influxdb:8086/query",
                                 params={"db": "k6", "q": q_iter, "epoch": "ms"},
                                 headers={"Authorization": "Token perfstack-token"})
            r_lat  = await c.get("http://influxdb:8086/query",
                                 params={"db": "k6", "q": q_lat,  "epoch": "ms"},
                                 headers={"Authorization": "Token perfstack-token"})

        counts = [v[1] for v in r_rps.json()["results"][0]["series"][0]["values"] if v[1] is not None]
        result["peak_rps"]   = float(max(counts, default=0))
        result["total_reqs"] = int(sum(counts))
        try:
            result["total_iters"] = int(r_iter.json()["results"][0]["series"][0]["values"][0][1] or 0)
        except Exception:
            pass

        lat_series = r_lat.json()["results"][0]["series"][0]
        cols = lat_series["columns"]   # ["time","med","avg","p90","p95","p99","p_min","p_max"]
        row  = lat_series["values"][0]
        for key in ("med", "avg", "p90", "p95", "p99", "p_min", "p_max"):
            idx = next((i for i, c in enumerate(cols) if c == key), None)
            if idx is not None and row[idx] is not None:
                result[key] = float(row[idx])
    except Exception as e:
        logger.warning("InfluxDB stats query failed: %s", e)
    return result


async def _save_report_to_pvc(job_name: str) -> None:
    """Background task: render all panels inline and write self-contained HTML to PVC."""
    import asyncio, time as _t, httpx
    await asyncio.sleep(5)  # let InfluxDB settle after job completes
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    saved_path = REPORTS_DIR / f"{job_name}.html"
    if saved_path.exists():
        return  # already saved by a concurrent call

    try:
        summary = await get_job_summary(job_name)
    except Exception as e:
        logger.warning("Report save skipped — summary unavailable: %s", e)
        return

    try:
        from_ms, to_ms = await get_job_time_range(job_name)
    except Exception:
        to_ms   = int(_t.time() * 1000)
        from_ms = to_ms - 30 * 60 * 1000

    stats = await _query_influx_stats(from_ms, to_ms)
    hist_entry = next((h for h in _read_history() if h.get("job_name") == job_name), {})
    service_name   = hist_entry.get("service_name", "")
    parallelism    = hist_entry.get("parallelism", 1)
    sleep_interval = hist_entry.get("sleep_interval", 0.0)
    scenario       = hist_entry.get("scenario", "")

    # Fetch all panels for both themes (sequentially to avoid saturating the renderer)
    panel_ids = [1, 17, 7, 5, 8]
    panels_dark:  dict[int, str] = {}
    panels_light: dict[int, str] = {}
    for pid in panel_ids:
        panels_dark[pid]  = await _fetch_panel_b64(job_name, pid, from_ms, to_ms, theme="dark")
        await asyncio.sleep(0.5)
        panels_light[pid] = await _fetch_panel_b64(job_name, pid, from_ms, to_ms, theme="light")
        await asyncio.sleep(0.5)

    common = dict(job_name=job_name, summary=summary, from_ms=from_ms, to_ms=to_ms,
                  service_name=service_name, influx_stats=stats,
                  parallelism=parallelism, sleep_interval=sleep_interval, scenario=scenario)

    (REPORTS_DIR / f"{job_name}.html").write_text(
        _build_report_html(**common, theme="dark",  panels=panels_dark))
    (REPORTS_DIR / f"{job_name}-light.html").write_text(
        _build_report_html(**common, theme="light", panels=panels_light))
    logger.info("Reports (dark + light) saved to PVC: %s", REPORTS_DIR)

    # Update history entry
    history = _read_history()
    for h in history:
        if h.get("job_name") == job_name:
            h["report_saved"] = True
            h["peak_rps"] = stats.get("peak_rps", 0.0)
            break
    _write_history(history)


@app.get("/report/{job_name}", summary="Serve HTML performance report (from PVC if saved, else live)")
async def get_report(job_name: str, theme: str = Query(default="dark")):
    """Serves the report — regenerated with the requested theme, or from PVC when no theme specified."""
    import time as _t
    import httpx
    from fastapi.responses import HTMLResponse

    # Serve cached PVC report when available for the requested theme
    cache_path = REPORTS_DIR / (f"{job_name}-light.html" if theme == "light" else f"{job_name}.html")
    if cache_path.exists():
        return HTMLResponse(content=cache_path.read_text())

    try:
        summary = await get_job_summary(job_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    try:
        from_ms, to_ms = await get_job_time_range(job_name)
    except Exception:
        to_ms   = int(_t.time() * 1000)
        from_ms = to_ms - 30 * 60 * 1000

    stats = await _query_influx_stats(from_ms, to_ms)
    hist_entry = next((h for h in _read_history() if h.get("job_name") == job_name), {})
    service_name   = hist_entry.get("service_name", "")
    parallelism    = hist_entry.get("parallelism", 1)
    sleep_interval = hist_entry.get("sleep_interval", 0.0)
    scenario       = hist_entry.get("scenario", "")
    html = _build_report_html(job_name, summary, from_ms, to_ms,
                              service_name=service_name, influx_stats=stats,
                              parallelism=parallelism, sleep_interval=sleep_interval,
                              scenario=scenario, theme=theme)
    return HTMLResponse(content=html)


@app.get("/report/{job_name}/panel/{panel_id}", summary="Render one Grafana panel (progressive loading)")
async def get_report_panel(job_name: str, panel_id: int, from_ms: int, to_ms: int,
                           theme: str = Query(default="dark")):
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
        f"&width={width}&height={height}&theme={theme}&var-Measurement=http_req_duration"
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

def _chart_block(title: str, panel_id: int, wide: bool = False, b64: str = "") -> str:
    cls = "chart-card chart-wide" if wide else "chart-card"
    if b64:
        inner = f'<img src="data:image/png;base64,{b64}" alt="{title}" style="width:100%;display:block"/>'
    else:
        inner = '<div class="chart-placeholder"><div class="spinner"></div><span>Loading chart\u2026</span></div>'
    return f'<div id="chart-p{panel_id}" class="{cls}"><div class="chart-title">{title}</div>{inner}</div>'

def _build_report_html(
    job_name: str,
    summary: dict,
    from_ms: int,
    to_ms: int,
    peak_rps: float = 0.0,
    service_name: str = "",
    influx_stats: dict | None = None,
    parallelism: int = 1,
    sleep_interval: float = 0.0,
    scenario: str = "",
    theme: str = "dark",
    panels: dict | None = None,
) -> str:
    from datetime import datetime, timezone

    # Build JS block outside the main f-string to avoid nested f-string syntax error
    if panels:
        lazy_js = "<!-- static report — panels embedded inline -->"
    else:
        lazy_js = (
            "<script>\n(function() {{\n"
            "  var JOB  = '" + job_name + "';\n"
            "  var FROM = " + str(from_ms) + ";\n"
            "  var TO   = " + str(to_ms) + ";\n"
            "  var panels = [\n"
            "    {divId:'chart-p1',  panelId:1},\n"
            "    {divId:'chart-p17', panelId:17},\n"
            "    {divId:'chart-p7',  panelId:7},\n"
            "    {divId:'chart-p5',  panelId:5},\n"
            "    {divId:'chart-p8',  panelId:8}\n"
            "  ];\n"
            "  panels.forEach(function(p, i) {\n"
            "    setTimeout(function() {\n"
            "      var url = '/api/report/'+JOB+'/panel/'+p.panelId+'?from_ms='+FROM+'&to_ms='+TO;\n"
            "      var card = document.getElementById(p.divId);\n"
            "      if (!card) return;\n"
            "      fetch(url)\n"
            "        .then(function(r) { return r.json(); })\n"
            "        .then(function(data) {\n"
            "          var ph = card.querySelector('.chart-placeholder');\n"
            "          if (!ph) return;\n"
            "          if (data.img) {\n"
            "            ph.outerHTML = '<img src=\"data:image/png;base64,'+data.img+'\" alt=\"chart\" style=\"width:100%;display:block\"/>';\n"
            "          } else {\n"
            "            ph.outerHTML = '<div class=\"chart-na\">Chart unavailable \u2014 try refreshing</div>';\n"
            "          }\n"
            "        })\n"
            "        .catch(function() {\n"
            "          var ph = card.querySelector('.chart-placeholder');\n"
            "          if (ph) ph.outerHTML = '<div class=\"chart-na\">Render failed</div>';\n"
            "        });\n"
            "    }, i * 500);\n"
            "  });\n"
            "}})();\n</script>"
        )

    m      = summary.get("metrics", {})
    meta   = summary.get("meta",    {})
    checks = summary.get("checks",  [])

    dur_ms  = to_ms - from_ms
    dur_s   = dur_ms / 1000

    ix = influx_stats or {}

    _k6_reqs  = int(m.get("http_reqs", {}).get("count", 0))
    total_reqs    = ix.get("total_reqs") or _k6_reqs
    peak_rps      = ix.get("peak_rps", peak_rps)
    err_rate      = m.get("http_req_failed", {}).get("rate", 0) * 100
    data_rx       = m.get("data_received",   {}).get("count", 0)
    data_tx       = m.get("data_sent",       {}).get("count", 0)
    peak_vus      = int(m.get("vus_max", {}).get("value", meta.get("vus", 0)))
    checks_pass   = m.get("checks", {}).get("rate", 0) * 100
    _k6_iters     = int(m.get("iterations",  {}).get("count", 0))
    total_iters   = ix.get("total_iters") or (_k6_iters * parallelism)
    iter_rate     = m.get("iterations",    {}).get("rate",  0)
    rx_rate       = m.get("data_received", {}).get("rate",  0)
    tx_rate       = m.get("data_sent",     {}).get("rate",  0)

    dur_key = "http_req_duration"
    if dur_key not in m and "custom_req_duration" in m:
        dur_key = "custom_req_duration"
    dr = m.get(dur_key, {})
    # Prefer InfluxDB aggregate (all pods); fall back to single-pod k6 summary
    p_avg = ix.get("avg")  or dr.get("avg",   0)
    p_min = ix.get("p_min") or dr.get("min",   0)
    p_med = ix.get("med")  or dr.get("med",   0)
    p90   = ix.get("p90")  or dr.get("p(90)", 0)
    p95   = ix.get("p95")  or dr.get("p(95)", 0)
    p99   = ix.get("p99")  or dr.get("p(99)", 0) or dr.get("p99", 0)
    p_max = ix.get("p_max") or dr.get("max",   0)

    err_color   = "#ef4444" if err_rate > 5 else "#22c55e" if err_rate == 0 else "#f59e0b"
    check_color = "#22c55e" if checks_pass >= 99 else "#f59e0b" if checks_pass >= 90 else "#ef4444"
    p95_color   = "#ef4444" if p95 > 2000 else "#f59e0b" if p95 > 1000 else "#22c55e"

    gen_time = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    test_ts  = meta.get("timestamp", "")[:19].replace("T", " ") if meta.get("timestamp") else gen_time
    target         = meta.get("target_url", "—")
    svc_label      = service_name or ""
    scenario_name  = (scenario or meta.get("scenario") or "—").capitalize()
    interval_label = (f"{int(sleep_interval*1000)} ms" if sleep_interval > 0
                      else "0 ms (max throughput)")
    conf_vus = meta.get("vus", peak_vus)
    conf_dur = meta.get("duration", round(dur_s))
    # Use configured test duration (not padded InfluxDB window) for avg rate
    avg_rps  = total_reqs / conf_dur if conf_dur > 0 else (total_reqs / dur_s if dur_s > 0 else 0)

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

    is_dark   = (theme != "light")
    logo_src  = "/assets/private/GSA_Logo_Inverted.png" if is_dark else "/assets/private/GSA_Logo.jpg"
    # CSS tokens
    c_bg        = "#0f1117"   if is_dark else "#f1f5f9"
    c_panel     = "#1a1f2e"   if is_dark else "#ffffff"
    c_border    = "#2d3748"   if is_dark else "#e2e8f0"
    c_border2   = "#1e2535"   if is_dark else "#f1f5f9"
    c_text      = "#e2e8f0"   if is_dark else "#1e293b"
    c_text2     = "#cbd5e1"   if is_dark else "#334155"
    c_muted     = "#64748b"
    c_dim       = "#94a3b8"   if is_dark else "#64748b"
    c_sub       = "#475569"
    c_hover     = "#1e2535"   if is_dark else "#f8fafc"
    c_jobname   = "#f1f5f9"   if is_dark else "#0f172a"
    c_hl        = "#f1f5f9"   if is_dark else "#0f172a"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>GSA PerfStack Report — {job_name}</title>
<style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{background:{c_bg};color:{c_text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6}}
  .page{{max-width:1400px;margin:0 auto;padding:32px 24px}}

  /* ── Header ── */
  .header-top{{display:flex;flex-direction:column;align-items:center;gap:10px;padding:28px 28px 24px;background:{c_panel};border:1px solid {c_border};border-radius:12px 12px 0 0;border-bottom:none}}
  .logo-img{{height:90px;object-fit:contain}}
  .job-name{{font-size:22px;font-weight:700;color:{c_jobname};letter-spacing:.3px}}
  .badge{{display:inline-block;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:.6px;background:#166534;color:#86efac;text-transform:uppercase}}
  .target-card{{background:{c_panel};border:1px solid {c_border};border-radius:0 0 12px 12px;padding:0 28px 24px;margin-bottom:24px}}
  .target-divider{{border:none;border-top:1px solid {c_border};margin:0 0 20px}}
  .target-heading{{font-size:11px;font-weight:700;color:{c_muted};text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px;padding-top:20px}}
  .target-svc{{font-size:18px;font-weight:700;color:{c_jobname};margin-bottom:4px}}
  .target-url{{font-size:13px;color:{c_dim};word-break:break-all;margin-bottom:16px}}
  .meta-grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px 24px}}
  .meta-item{{display:flex;flex-direction:column;gap:2px}}
  .meta-label{{font-size:11px;color:{c_muted};text-transform:uppercase;letter-spacing:.6px}}
  .meta-value{{font-size:13px;color:{c_text2};font-weight:500}}

  /* ── KPI Grid ── */
  .kpi-grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}}
  .kpi-card{{background:{c_panel};border:1px solid {c_border};border-radius:10px;padding:16px 14px}}
  .kpi-value{{font-size:26px;font-weight:700;line-height:1.1;margin-bottom:4px}}
  .kpi-label{{font-size:11px;color:{c_muted};text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}}
  .kpi-sub{{font-size:11px;color:{c_sub}}}
  .blue{{color:#6366f1}} .green{{color:#22c55e}} .yellow{{color:#f59e0b}} .purple{{color:#a78bfa}}

  /* ── Charts ── */
  .charts-row{{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px}}
  .chart-card{{background:{c_panel};border:1px solid {c_border};border-radius:10px;overflow:hidden}}
  .chart-card.chart-wide{{grid-column:1/-1}}
  .chart-title{{font-size:12px;font-weight:600;color:{c_dim};text-transform:uppercase;letter-spacing:.6px;padding:12px 16px 8px}}
  .chart-card img{{width:100%;display:block}}
  .chart-na{{padding:40px 20px;text-align:center;color:{c_sub};font-size:12px;font-style:italic}}
  .chart-placeholder{{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:40px 20px;min-height:150px;color:{c_sub};font-size:12px}}
  @keyframes spin{{to{{transform:rotate(360deg)}}}}
  .spinner{{width:24px;height:24px;border:2px solid {c_border};border-top-color:#6366f1;border-radius:50%;animation:spin 0.8s linear infinite}}

  /* ── Tables ── */
  .section{{background:{c_panel};border:1px solid {c_border};border-radius:10px;padding:20px;margin-bottom:12px}}
  .section h2{{font-size:13px;font-weight:600;color:{c_dim};text-transform:uppercase;letter-spacing:.6px;margin-bottom:16px}}
  table{{width:100%;border-collapse:collapse}}
  th{{font-size:11px;font-weight:600;color:{c_muted};text-transform:uppercase;letter-spacing:.5px;padding:8px 12px;border-bottom:1px solid {c_border};text-align:left}}
  td{{padding:8px 12px;border-bottom:1px solid {c_border2};color:{c_text2};font-size:13px}}
  tr:last-child td{{border-bottom:none}}
  tr:hover td{{background:{c_hover}}}
  .num{{text-align:right;font-variant-numeric:tabular-nums}}
  .hl{{font-weight:600;color:{c_hl}}}

  /* ── Footer ── */
  .footer{{text-align:center;color:{c_sub};font-size:11px;margin-top:32px;padding-top:16px;border-top:1px solid {c_border2}}}
</style>
</head>
<body>
<div class="page">

  <!-- HEADER — branding -->
  <div class="header-top">
    <img src="{logo_src}" class="logo-img" alt="GSA logo" />
    <div class="job-name">{job_name}</div>
    <span class="badge">Completed</span>
  </div>

  <!-- TARGET INFORMATION -->
  <div class="target-card">
    <hr class="target-divider"/>
    <div class="target-heading">Target Information</div>
    {"<div class='target-svc'>"+svc_label+"</div>" if svc_label else ""}
    <div class="target-url">{target}</div>
    <div class="meta-grid">
      <div class="meta-item"><span class="meta-label">Config</span><span class="meta-value">{conf_vus} VUs · {conf_dur}s</span></div>
      <div class="meta-item"><span class="meta-label">Scenario</span><span class="meta-value">{scenario_name}</span></div>
      <div class="meta-item"><span class="meta-label">k6 Pods</span><span class="meta-value">{parallelism}</span></div>
      <div class="meta-item"><span class="meta-label">Request Interval</span><span class="meta-value">{interval_label}</span></div>
      <div class="meta-item"><span class="meta-label">Started</span><span class="meta-value">{test_ts}</span></div>
      <div class="meta-item"><span class="meta-label">Report Generated</span><span class="meta-value">{gen_time}</span></div>
      <div class="meta-item"><span class="meta-label">Avg Request Payload</span><span class="meta-value">{_fmt_bytes(data_tx / total_reqs) if total_reqs > 0 else "—"}</span></div>
      <div class="meta-item"><span class="meta-label">Avg Response Payload</span><span class="meta-value">{_fmt_bytes(data_rx / total_reqs) if total_reqs > 0 else "—"}</span></div>
    </div>
  </div>

  <!-- KPI CARDS -->
  <div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-value blue">{total_reqs:,}</div><div class="kpi-label">Total Requests</div><div class="kpi-sub">{avg_rps:.1f} req/s avg</div></div>
    <div class="kpi-card"><div class="kpi-value purple">{peak_rps:.1f}</div><div class="kpi-label">Peak req/s</div><div class="kpi-sub">{total_iters:,} total iterations</div></div>
    <div class="kpi-card"><div class="kpi-value" style="color:{err_color}">{err_rate:.2f}%</div><div class="kpi-label">Error Rate</div><div class="kpi-sub">{int(total_reqs*err_rate/100):,} failed</div></div>
    <div class="kpi-card"><div class="kpi-value" style="color:{check_color}">{checks_pass:.1f}%</div><div class="kpi-label">Checks Passed</div><div class="kpi-sub">{_fmt_bytes(data_rx)} received</div></div>
    <div class="kpi-card"><div class="kpi-value yellow">{_fmt_ms(p_avg)}</div><div class="kpi-label">Avg Response</div><div class="kpi-sub">med {_fmt_ms(p_med)}</div></div>
    <div class="kpi-card"><div class="kpi-value green">{_fmt_ms(p90)}</div><div class="kpi-label">p90 Response</div><div class="kpi-sub">min {_fmt_ms(p_min)}</div></div>
    <div class="kpi-card"><div class="kpi-value" style="color:{p95_color}">{_fmt_ms(p95)}</div><div class="kpi-label">p95 Response</div><div class="kpi-sub">p90 {_fmt_ms(p90)}</div></div>
    <div class="kpi-card"><div class="kpi-value yellow">{_fmt_ms(p99)}</div><div class="kpi-label">p99 Response</div><div class="kpi-sub">max {_fmt_ms(p_max)}</div></div>
  </div>

  <!-- CHARTS ROW 1: VUs / RPS / Errors -->
  <div class="charts-row" style="margin-bottom:12px">
    {_chart_block("Virtual Users", 1, b64=(panels or {{}}).get(1,""))}
    {_chart_block("Requests per Second", 17, b64=(panels or {{}}).get(17,""))}
    {_chart_block("Errors per Second", 7, b64=(panels or {{}}).get(7,""))}
  </div>

  <!-- CHARTS FULL WIDTH -->
  <div class="charts-row" style="margin-bottom:12px">
    {_chart_block("Response Time — p90 / p95 / p99 / max / min  (http_req_duration)", 5, wide=True, b64=(panels or {{}}).get(5,""))}
  </div>
  <div class="charts-row" style="margin-bottom:24px">
    {_chart_block("Response Time Heatmap", 8, wide=True, b64=(panels or {{}}).get(8,""))}
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
        <tr><td class="hl">Data Received</td><td class="num">{_fmt_bytes(data_rx)}</td><td class="num">{_fmt_bytes(rx_rate)}/s</td></tr>
        <tr><td class="hl">Data Sent</td><td class="num">{_fmt_bytes(data_tx)}</td><td class="num">{_fmt_bytes(tx_rate)}/s</td></tr>
      </tbody>
    </table>
  </div>

  <!-- CHECKS TABLE -->
  {"" if not checks_html else f'''<div class="section"><h2>Checks</h2><table>
  <thead><tr><th>Name</th><th class="num">Passes</th><th class="num">Fails</th></tr></thead>
  <tbody>{checks_html}</tbody></table></div>'''}

  <div class="footer">GSA Platform Suite v3.1.0 &nbsp;·&nbsp; {gen_time} &nbsp;·&nbsp; epc_owner@fico.com</div>
</div>
{lazy_js}
</body>
</html>"""


# ── Monitor scheduling helpers ────────────────────────────────────────────────

INTERVAL_MAP = {"5m": 5, "15m": 15, "30m": 30, "1h": 60, "6h": 360, "24h": 1440}


def _schedule_monitor(m: dict) -> None:
    """Add or replace an APScheduler job for a monitor dict."""
    mid = m["id"]
    if _scheduler.get_job(mid):
        _scheduler.remove_job(mid)
    if m.get("enabled"):
        mins = INTERVAL_MAP.get(m.get("interval", "1h"), 60)
        _scheduler.add_job(
            _run_monitor, "interval", minutes=mins,
            id=mid, args=[mid], max_instances=1, coalesce=True,
        )


def _get_nested(obj: Any, path: str) -> tuple[Any, str]:
    """Traverse a dot-separated path. Returns (value, trace) where trace describes where it stopped."""
    try:
        for key in path.split("."):
            if isinstance(obj, dict):
                if key not in obj:
                    return None, f"key '{key}' not found (available: {list(obj.keys())[:8]})"
                obj = obj[key]
            elif isinstance(obj, list) and key.isdigit():
                obj = obj[int(key)]
            else:
                return None, f"expected dict at '{key}', got {type(obj).__name__}"
        return obj, ""
    except Exception as e:
        return None, str(e)


async def _run_monitor(monitor_id: str) -> None:
    """Execute a single monitor check and persist the result."""
    import httpx
    monitors = _read_monitors()
    m = next((x for x in monitors if x["id"] == monitor_id), None)
    if not m or not m.get("enabled"):
        return

    started = datetime.now(timezone.utc).isoformat()
    run = MonitorRun(
        id=str(uuid.uuid4()),
        monitor_id=monitor_id,
        monitor_name=m["name"],
        started_at=started,
        status="error",
    )

    try:
        # Optional IAM auth
        headers = dict(m.get("headers", {}))
        if m.get("iam_url"):
            loop = asyncio.get_event_loop()
            auth = IamAuthClient(
                iam_url=m["iam_url"],
                client_id=m.get("client_id", ""),
                client_secret=m.get("client_secret", ""),
            )
            token = await auth.get_bearer_token()
            headers["Authorization"] = f"Bearer {token}"

        timeout = min(m.get("max_response_ms", 5000) / 1000 + 2, 30)
        t0 = _time.monotonic()
        async with httpx.AsyncClient(timeout=timeout, verify=False, follow_redirects=True) as c:
            payload = m.get("payload") or None
            if m.get("method", "POST").upper() == "GET":
                resp = await c.get(m["target_url"], headers=headers)
            else:
                resp = await c.post(m["target_url"], json=payload, headers=headers)
        elapsed_ms = int((_time.monotonic() - t0) * 1000)

        run.http_status = resp.status_code
        run.response_ms = elapsed_ms

        check_results = []
        all_ok = True

        # Check 1: HTTP status code
        status_ok = resp.status_code == m.get("expected_status", 200)
        check_results.append({
            "check": "status_code", "passed": status_ok,
            "expected": str(m.get("expected_status", 200)),
            "actual": str(resp.status_code),
        })
        if not status_ok:
            all_ok = False

        # Check 2: Response time
        rt_ok = elapsed_ms <= m.get("max_response_ms", 5000)
        check_results.append({
            "check": "response_time_ms", "passed": rt_ok,
            "expected": f"<= {m.get('max_response_ms', 5000)}",
            "actual": str(elapsed_ms),
        })
        if not rt_ok:
            all_ok = False

        # Check 3+: Body JSON field checks
        raw_text = resp.text or ""
        run.response_preview = raw_text[:500]
        body_json = None
        try:
            body_json = resp.json()
        except Exception:
            try:
                import json as _json
                body_json = _json.loads(raw_text)
            except Exception as _je:
                logger.warning("Monitor %s: response body is not JSON: %s — body: %.200s", monitor_id, _je, raw_text)
        for bc in m.get("body_checks", []):
            if body_json is None:
                val, trace = None, f"response is not JSON — {raw_text[:120]}"
            else:
                val, trace = _get_nested(body_json, bc["field"])
            op = bc.get("operator", "eq")
            if op == "exists":
                passed = val is not None
            elif op == "eq":
                passed = str(val) == str(bc.get("value", ""))
            elif op == "contains":
                passed = bc.get("value", "") in str(val or "")
            else:
                passed = False
            actual_str = str(val) if val is not None else (trace or "null")
            check_results.append({
                "check": bc['field'], "passed": passed,
                "expected": f"{op} {bc.get('value', '')}".strip(),
                "actual": actual_str,
            })
            if not passed:
                all_ok = False

        run.status = "ok" if all_ok else "ko"
        run.checks = check_results

    except Exception as e:
        run.status = "error"
        run.error = str(e)

    # Persist run (keep last 1000)
    runs = _read_monitor_runs()
    runs.insert(0, run.model_dump())
    _write_monitor_runs(runs[:1000])

    # Update last_status on the monitor
    for mx in monitors:
        if mx["id"] == monitor_id:
            mx["last_status"] = run.status
            break
    _write_monitors(monitors)

    logger.info("Monitor run: id=%s name=%s status=%s http=%d ms=%d",
                monitor_id, m["name"], run.status, run.http_status, run.response_ms)

    # Send alert email if check failed
    if run.status != "ok":
        if m.get("alert_emails"):
            logger.info("Monitor alert triggered: id=%s name=%s status=%s recipients=%s",
                        monitor_id, m["name"], run.status, m["alert_emails"])
            asyncio.create_task(_send_monitor_alert(m, run.model_dump()))
        else:
            logger.info("Monitor failed but no alert_emails configured: id=%s name=%s", monitor_id, m["name"])


async def _send_monitor_alert(m: dict, run: dict) -> None:
    """Send email alert for a failed monitor check."""
    cfg = _read_email_config()
    if not cfg.get("smtp_host") or not m.get("alert_emails"):
        return

    check_lines = "\n".join(
        f"  {'✓' if c['passed'] else '✗'} {c['check']}: expected {c['expected']} — got {c['actual']}"
        for c in run.get("checks", [])
    )
    body_text = (
        f"Monitor Alert: {m['name']}\n"
        f"Status: {run['status'].upper()}\n"
        f"URL: {m['target_url']}\n"
        f"HTTP status: {run['http_status']}  |  Response time: {run['response_ms']}ms\n"
        f"Time: {run['started_at']}\n\n"
        f"Checks:\n{check_lines or '  (none)'}"
    )
    if run.get("error"):
        body_text += f"\n\nError: {run['error']}"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[PerfStack] Monitor ALERT: {m['name']} — {run['status'].upper()}"
    msg["From"]    = cfg.get("from_addr", "perfstack@localhost")
    msg["To"]      = ", ".join(m["alert_emails"])
    msg.attach(MIMEText(body_text, "plain"))

    try:
        smtp = aiosmtplib.SMTP(hostname=cfg["smtp_host"], port=int(cfg.get("smtp_port", 587)))
        await smtp.connect()
        if cfg.get("use_tls", True):
            await smtp.starttls()
        if cfg.get("username"):
            await smtp.login(cfg["username"], cfg["password"])
        await smtp.send_message(msg)
        await smtp.quit()
        logger.info("Monitor alert email sent to %s", m["alert_emails"])
    except Exception as e:
        logger.warning("Monitor alert email failed: %s", e)


# ── Monitor CRUD endpoints ────────────────────────────────────────────────────

@app.get("/monitors", summary="List all monitors")
async def list_monitors():
    return _read_monitors()


@app.post("/monitors", summary="Create a new monitor")
async def create_monitor(monitor: Monitor):
    monitors = _read_monitors()
    monitor.id = str(uuid.uuid4())
    monitor.created_at = datetime.now(timezone.utc).isoformat()
    entry = monitor.model_dump()
    monitors.append(entry)
    _write_monitors(monitors)
    _schedule_monitor(entry)
    logger.info("Monitor created: id=%s name=%s interval=%s", monitor.id, monitor.name, monitor.interval)
    return entry


@app.put("/monitors/{monitor_id}", summary="Update a monitor")
async def update_monitor(monitor_id: str, monitor: Monitor):
    monitors = _read_monitors()
    idx = next((i for i, m in enumerate(monitors) if m["id"] == monitor_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail=f"Monitor '{monitor_id}' not found")
    monitor.id = monitor_id
    monitor.created_at = monitors[idx].get("created_at", "")
    monitor.last_status = monitors[idx].get("last_status", "")
    entry = monitor.model_dump()
    monitors[idx] = entry
    _write_monitors(monitors)
    _schedule_monitor(entry)
    return entry


@app.delete("/monitors/{monitor_id}", summary="Delete a monitor")
async def delete_monitor(monitor_id: str):
    monitors = _read_monitors()
    updated = [m for m in monitors if m["id"] != monitor_id]
    if len(updated) == len(monitors):
        raise HTTPException(status_code=404, detail=f"Monitor '{monitor_id}' not found")
    _write_monitors(updated)
    if _scheduler.get_job(monitor_id):
        _scheduler.remove_job(monitor_id)
    return {"status": "deleted", "id": monitor_id}


@app.patch("/monitors/{monitor_id}/toggle", summary="Enable or disable a monitor")
async def toggle_monitor(monitor_id: str):
    monitors = _read_monitors()
    idx = next((i for i, m in enumerate(monitors) if m["id"] == monitor_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail=f"Monitor '{monitor_id}' not found")
    monitors[idx]["enabled"] = not monitors[idx].get("enabled", True)
    _write_monitors(monitors)
    _schedule_monitor(monitors[idx])
    return monitors[idx]


@app.post("/monitors/{monitor_id}/run", summary="Trigger a monitor check immediately")
async def run_monitor_now(monitor_id: str):
    monitors = _read_monitors()
    if not any(m["id"] == monitor_id for m in monitors):
        raise HTTPException(status_code=404, detail=f"Monitor '{monitor_id}' not found")
    asyncio.create_task(_run_monitor(monitor_id))
    return {"status": "triggered", "id": monitor_id}


@app.get("/monitors/{monitor_id}/runs", summary="Get run history for a monitor (last 100)")
async def get_monitor_runs(monitor_id: str):
    runs = _read_monitor_runs()
    return [r for r in runs if r.get("monitor_id") == monitor_id][:100]


# ── Email config endpoints ────────────────────────────────────────────────────

@app.get("/email-config", summary="Get email configuration (password masked)")
async def get_email_config():
    cfg = _read_email_config()
    if cfg.get("password"):
        cfg = dict(cfg)
        cfg["password"] = "***"
    return cfg


@app.post("/email-config", summary="Save email configuration")
async def save_email_config(config: EmailConfig):
    existing = _read_email_config()
    data = config.model_dump()
    # Keep existing password if placeholder sent
    if data.get("password") == "***" and existing.get("password"):
        data["password"] = existing["password"]
    _write_email_config(data)
    return {"status": "saved"}


@app.post("/email-config/test", summary="Send a test email")
async def test_email_config():
    cfg = _read_email_config()
    if not cfg.get("smtp_host") or not cfg.get("from_addr"):
        raise HTTPException(status_code=400, detail="Email config incomplete (smtp_host and from_addr required)")
    msg = MIMEText("PerfStack email configuration is working correctly.", "plain")
    msg["Subject"] = "[PerfStack] Test Email"
    msg["From"]    = cfg["from_addr"]
    msg["To"]      = cfg["from_addr"]
    try:
        smtp = aiosmtplib.SMTP(hostname=cfg["smtp_host"], port=int(cfg.get("smtp_port", 587)))
        await smtp.connect()
        if cfg.get("use_tls", True):
            await smtp.starttls()
        if cfg.get("username"):
            await smtp.login(cfg["username"], cfg["password"])
        await smtp.send_message(msg)
        await smtp.quit()
        return {"status": "sent", "to": cfg["from_addr"]}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Email send failed: {e}")


@app.get("/history", summary="List all test run history entries (newest first)")
async def list_history():
    return _read_history()


@app.delete("/history/{job_name}", summary="Delete a history entry and its saved report")
async def delete_history(job_name: str):
    history = _read_history()
    updated = [h for h in history if h.get("job_name") != job_name]
    if len(updated) == len(history):
        raise HTTPException(status_code=404, detail=f"History entry '{job_name}' not found")
    _write_history(updated)
    for fname in (f"{job_name}.html", f"{job_name}-light.html"):
        p = REPORTS_DIR / fname
        if p.exists():
            p.unlink()
    return {"status": "deleted", "job_name": job_name}


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


# ════════════════════════════════════════════════════════════════════════════════
# DeployStack — Gitea + auto-build + auto-deploy
# ════════════════════════════════════════════════════════════════════════════════

class AppConfig(BaseModel):
    app: str
    port: int = 8080
    replicas: int = 1
    env: list[dict] = []

class DeployedApp(BaseModel):
    name: str
    repo: str
    image: str = ""
    port: int = 8080
    replicas: int = 1
    namespace: str = ""
    status: str = "pending"   # pending / building / deploying / running / failed
    build_job: str = ""
    last_deployed: str = ""
    url: str = ""
    error: str = ""

class BuildEntry(BaseModel):
    id: str
    app_name: str
    commit: str
    started_at: str
    status: str = "building"  # building / success / failed
    log: str = ""

class NewAppRequest(BaseModel):
    name: str
    description: str = ""
    auth_required: bool = False
    show_in_home: bool = False

def _slugify(name: str) -> str:
    """Convert an app name to a DNS-safe slug."""
    slug = re.sub(r"[^a-z0-9-]", "-", name.lower().strip())
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug[:40]

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

# ── Kubernetes helper: get a BatchV1Api client ────────────────────────────────
def _batch_v1():
    from kubernetes import config as k8s_config
    try:
        k8s_config.load_incluster_config()
    except Exception:
        k8s_config.load_kube_config()
    return k8s_client.BatchV1Api()

def _apps_v1():
    from kubernetes import config as k8s_config
    try:
        k8s_config.load_incluster_config()
    except Exception:
        k8s_config.load_kube_config()
    return k8s_client.AppsV1Api()

def _core_v1():
    from kubernetes import config as k8s_config
    try:
        k8s_config.load_incluster_config()
    except Exception:
        k8s_config.load_kube_config()
    return k8s_client.CoreV1Api()

def _networking_v1():
    from kubernetes import config as k8s_config
    try:
        k8s_config.load_incluster_config()
    except Exception:
        k8s_config.load_kube_config()
    return k8s_client.NetworkingV1Api()

# ── Create a Docker build Job ─────────────────────────────────────────────────
def _create_build_job(app_name: str, repo: str, commit: str, image_tag: str) -> str:
    """
    Creates a batch/v1 Job that:
      1. Downloads the repo archive from Gitea API
      2. Extracts it
      3. docker build + docker push to local registry
    Returns the Job name.
    """
    short = commit[:8]
    job_name = f"build-{app_name}-{short}"
    context_path = f"/data/builds/{app_name}/{short}"

    # docker:27-cli is Alpine/busybox — wget and tar are built-in, no apk needed
    archive_url = (
        f"http://{GITEA_ADMIN_USER}:{GITEA_ADMIN_PASS}"
        f"@gitea.gitea.svc.cluster.local:3000"
        f"/api/v1/repos/{GITEA_ADMIN_USER}/{repo}/archive/{commit}.tar.gz"
    )
    cmd = (
        f"mkdir -p {context_path} && "
        f"wget -qO- '{archive_url}' "
        f"| tar xz --strip-components=1 -C {context_path} && "
        f"docker build -t {image_tag} {context_path} && "
        f"docker push {image_tag}"
    )

    job = k8s_client.V1Job(
        metadata=k8s_client.V1ObjectMeta(
            name=job_name,
            namespace="perfstack",
            labels={"app": "deploy-builder", "deploy-app": app_name}
        ),
        spec=k8s_client.V1JobSpec(
            ttl_seconds_after_finished=3600,
            backoff_limit=0,
            template=k8s_client.V1PodTemplateSpec(
                spec=k8s_client.V1PodSpec(
                    restart_policy="Never",
                    containers=[k8s_client.V1Container(
                        name="builder",
                        image="docker:27-cli",
                        command=["sh", "-c"],
                        args=[cmd],
                        volume_mounts=[
                            k8s_client.V1VolumeMount(
                                name="docker-sock",
                                mount_path="/var/run/docker.sock"
                            ),
                            k8s_client.V1VolumeMount(
                                name="build-data",
                                mount_path="/data"
                            ),
                        ]
                    )],
                    volumes=[
                        k8s_client.V1Volume(
                            name="docker-sock",
                            host_path=k8s_client.V1HostPathVolumeSource(
                                path="/var/run/docker.sock",
                                type="Socket"
                            )
                        ),
                        k8s_client.V1Volume(
                            name="build-data",
                            persistent_volume_claim=k8s_client.V1PersistentVolumeClaimVolumeSource(
                                claim_name="backend-data"
                            )
                        ),
                    ]
                )
            )
        )
    )

    batch = _batch_v1()
    try:
        batch.delete_namespaced_job(
            name=job_name, namespace="perfstack",
            body=k8s_client.V1DeleteOptions(propagation_policy="Background")
        )
    except Exception:
        pass
    batch.create_namespaced_job(namespace="perfstack", body=job)
    return job_name

# ── Resolve env vars from GSA-Platform-Suite.yaml ────────────────────────────
def _resolve_env_vars(env_vars: list, target_ns: str) -> list:
    """Convert env list from GSA-Platform-Suite.yaml into k8s V1EnvVar objects.

    Supports two formats:
      - Plain value:      { name: FOO, value: "bar" }
      - Secret ref:       { name: FOO, valueFrom: { secretKeyRef: { namespace: src, name: secret, key: k } } }

    For secretKeyRef with a source namespace different from target_ns, the secret
    key is copied from the source namespace into target_ns so the pod can mount it.
    """
    core = _core_v1()
    resolved = []
    for e in env_vars:
        name = e.get("name", "")
        if not name:
            continue
        if "value" in e:
            resolved.append(k8s_client.V1EnvVar(name=name, value=str(e["value"])))
        elif "valueFrom" in e and "secretKeyRef" in e.get("valueFrom", {}):
            ref         = e["valueFrom"]["secretKeyRef"]
            src_ns      = ref.get("namespace", target_ns)
            secret_name = ref["name"]
            secret_key  = ref["key"]
            # Copy secret to target namespace if it lives elsewhere
            if src_ns != target_ns:
                try:
                    src = core.read_namespaced_secret(name=secret_name, namespace=src_ns)
                    key_data = {secret_key: (src.data or {}).get(secret_key, "")}
                    dst = k8s_client.V1Secret(
                        metadata=k8s_client.V1ObjectMeta(name=secret_name, namespace=target_ns),
                        data=key_data
                    )
                    try:
                        core.create_namespaced_secret(namespace=target_ns, body=dst)
                    except Exception:
                        core.replace_namespaced_secret(name=secret_name, namespace=target_ns, body=dst)
                    logger.info("Copied secret %s/%s → %s", src_ns, secret_name, target_ns)
                except Exception as ex:
                    logger.warning("Could not copy secret %s/%s → %s: %s", src_ns, secret_name, target_ns, ex)
            resolved.append(k8s_client.V1EnvVar(
                name=name,
                value_from=k8s_client.V1EnvVarSource(
                    secret_key_ref=k8s_client.V1SecretKeySelector(
                        name=secret_name,
                        key=secret_key,
                        optional=False
                    )
                )
            ))
    return resolved

# ── Deploy app to its own namespace ──────────────────────────────────────────
def _deploy_app_k8s(app_name: str, image_tag: str, port: int, replicas: int, env_vars: list, auth_required: bool = False):
    """Create (or replace) Namespace + Deployment + Service + Ingress for an app."""
    ns = f"app-{app_name}"
    core = _core_v1()
    apps = _apps_v1()
    net = _networking_v1()

    # Namespace
    try:
        core.create_namespace(k8s_client.V1Namespace(
            metadata=k8s_client.V1ObjectMeta(
                name=ns,
                labels={"app.kubernetes.io/managed-by": "gsa-platform-suite", "deploy-app": app_name}
            )
        ))
    except Exception:
        pass  # already exists

    # Deployment
    env = _resolve_env_vars(env_vars, ns)
    deploy_body = k8s_client.V1Deployment(
        metadata=k8s_client.V1ObjectMeta(name=app_name, namespace=ns),
        spec=k8s_client.V1DeploymentSpec(
            replicas=min(max(replicas, 1), 5),
            selector=k8s_client.V1LabelSelector(match_labels={"app": app_name}),
            template=k8s_client.V1PodTemplateSpec(
                metadata=k8s_client.V1ObjectMeta(labels={"app": app_name}),
                spec=k8s_client.V1PodSpec(containers=[
                    k8s_client.V1Container(
                        name=app_name,
                        image=image_tag,
                        image_pull_policy="Always",
                        ports=[k8s_client.V1ContainerPort(container_port=port)],
                        env=env,
                        resources=k8s_client.V1ResourceRequirements(
                            requests={"cpu": "100m", "memory": "128Mi"},
                            limits={"cpu": "500m", "memory": "256Mi"}
                        )
                    )
                ])
            )
        )
    )
    try:
        apps.create_namespaced_deployment(namespace=ns, body=deploy_body)
    except Exception:
        apps.replace_namespaced_deployment(name=app_name, namespace=ns, body=deploy_body)
        # Force pod restart so the new :latest image is actually pulled
        apps.patch_namespaced_deployment(
            name=app_name, namespace=ns,
            body={"spec": {"template": {"metadata": {"annotations": {
                "kubectl.kubernetes.io/restartedAt": _now_iso()
            }}}}}
        )

    # Service
    svc_body = k8s_client.V1Service(
        metadata=k8s_client.V1ObjectMeta(name=app_name, namespace=ns),
        spec=k8s_client.V1ServiceSpec(
            selector={"app": app_name},
            ports=[k8s_client.V1ServicePort(port=port, target_port=port)]
        )
    )
    try:
        core.create_namespaced_service(namespace=ns, body=svc_body)
    except Exception:
        core.replace_namespaced_service(name=app_name, namespace=ns, body=svc_body)

    # Ingress
    path_val = f"/apps/{app_name}(/|$)(.*)"
    ingress_annotations = {
        "nginx.ingress.kubernetes.io/rewrite-target": "/$2",
        "nginx.ingress.kubernetes.io/proxy-read-timeout": "60",
    }
    if auth_required:
        ingress_annotations["nginx.ingress.kubernetes.io/auth-url"] = \
            "http://backend.perfstack.svc.cluster.local:8000/deploy/check-auth"
        # Redirect unauthenticated users to the login page; nginx appends ?rd=<original-url>
        ingress_annotations["nginx.ingress.kubernetes.io/auth-signin"] = \
            f"http://{PUBLIC_HOST}/app-login"
        # Forward user-identity headers from check-auth response to the upstream app
        ingress_annotations["nginx.ingress.kubernetes.io/auth-response-headers"] = \
            "X-User-Id,X-User-CN,X-User-Org"
    ingress_body = k8s_client.V1Ingress(
        metadata=k8s_client.V1ObjectMeta(
            name=app_name, namespace=ns,
            annotations=ingress_annotations,
        ),
        spec=k8s_client.V1IngressSpec(
            ingress_class_name="nginx",
            rules=[k8s_client.V1IngressRule(
                http=k8s_client.V1HTTPIngressRuleValue(paths=[
                    k8s_client.V1HTTPIngressPath(
                        path=path_val,
                        path_type="ImplementationSpecific",
                        backend=k8s_client.V1IngressBackend(
                            service=k8s_client.V1IngressServiceBackend(
                                name=app_name,
                                port=k8s_client.V1ServiceBackendPort(number=port)
                            )
                        )
                    )
                ])
            )]
        )
    )
    try:
        net.create_namespaced_ingress(namespace=ns, body=ingress_body)
    except Exception:
        net.replace_namespaced_ingress(name=app_name, namespace=ns, body=ingress_body)

# ── Background: poll build job, then deploy ───────────────────────────────────
async def _watch_build_and_deploy(app_name: str, build_id: str, image_tag: str,
                                   cfg: dict, job_name: str):
    """Polls the build Job until completion, then deploys the app."""
    batch = _batch_v1()
    ns = "perfstack"
    MAX_WAIT = 600  # 10 minutes

    start = _time.time()
    while _time.time() - start < MAX_WAIT:
        await asyncio.sleep(5)
        try:
            job = batch.read_namespaced_job(name=job_name, namespace=ns)
            if job.status.succeeded and job.status.succeeded >= 1:
                break
            if job.status.failed and job.status.failed >= 1:
                _update_app_status(app_name, "failed", error="Build job failed")
                _update_build_status(build_id, "failed")
                return
        except Exception as e:
            logger.warning("Build poll error: %s", e)

    else:
        _update_app_status(app_name, "failed", error="Build timed out")
        _update_build_status(build_id, "failed")
        return

    # Build succeeded — now deploy
    _update_build_status(build_id, "success")
    _update_app_status(app_name, "deploying")
    try:
        apps_list = _read_apps()
        app_entry = next((a for a in apps_list if a.get("name") == app_name), {})
        auth_required = app_entry.get("auth_required", False)
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: _deploy_app_k8s(
            app_name, image_tag, cfg.get("port", 8080),
            cfg.get("replicas", 1), cfg.get("env", []), auth_required
        ))
        now = _now_iso()
        _update_app_status(app_name, "running",
                           last_deployed=now,
                           url=f"http://{PUBLIC_HOST}/apps/{app_name}",
                           port=cfg.get("port", 8080),
                           replicas=cfg.get("replicas", 1),
                           env=cfg.get("env", []))
    except Exception as e:
        logger.error("Deploy failed for %s: %s", app_name, e)
        _update_app_status(app_name, "failed", error=str(e))

def _update_app_status(name: str, status: str, **kwargs):
    apps = _read_apps()
    for a in apps:
        if a.get("name") == name:
            a["status"] = status
            if status in ("running", "deploying", "building"):
                a["error"] = ""
            for k, v in kwargs.items():
                a[k] = v
            break
    _write_apps(apps)

def _update_build_status(build_id: str, status: str):
    builds = _read_builds()
    for b in builds:
        if b.get("id") == build_id:
            b["status"] = status
            break
    _write_builds(builds)

# ── Routes ────────────────────────────────────────────────────────────────────

def _fix_app_urls(app: dict) -> dict:
    """Rewrite stored localhost URLs to use the current PUBLIC_HOST."""
    name = app.get("name", "")
    repo = app.get("repo", name)
    app["url"]        = f"http://{PUBLIC_HOST}/apps/{name}"
    app["gitea_url"]  = f"http://{PUBLIC_HOST}/gitea/{GITEA_ADMIN_USER}/{repo}"
    app["clone_url"]  = f"http://{PUBLIC_HOST}/gitea/{GITEA_ADMIN_USER}/{repo}.git"
    return app


@app.get("/deploy/apps", summary="List all DeployStack apps")
async def list_deploy_apps():
    return [_fix_app_urls(a) for a in _read_apps()]


@app.post("/deploy/apps", summary="Create a new app and its Gitea repo")
async def create_deploy_app(req: NewAppRequest):
    name = _slugify(req.name)
    if not name:
        raise HTTPException(status_code=400, detail="Invalid app name")

    apps = _read_apps()
    if any(a.get("name") == name for a in apps):
        raise HTTPException(status_code=409, detail=f"App '{name}' already exists")

    # Create Gitea repo via API
    async with __import__("httpx").AsyncClient(timeout=15) as hx:
        r = await hx.post(
            f"{GITEA_INTERNAL_URL}/api/v1/user/repos",
            auth=(GITEA_ADMIN_USER, GITEA_ADMIN_PASS),
            json={"name": name, "description": req.description,
                  "private": False, "auto_init": True, "default_branch": "main"}
        )
        if r.status_code not in (201, 409):
            raise HTTPException(status_code=502,
                                detail=f"Gitea repo creation failed: {r.text}")

        # Register webhook pointing to backend
        await hx.post(
            f"{GITEA_INTERNAL_URL}/api/v1/repos/{GITEA_ADMIN_USER}/{name}/hooks",
            auth=(GITEA_ADMIN_USER, GITEA_ADMIN_PASS),
            json={
                "type": "gitea",
                "active": True,
                "events": ["push"],
                "config": {
                    "url": f"http://backend.perfstack.svc.cluster.local:8000/deploy/webhook",
                    "content_type": "json",
                    "secret": WEBHOOK_SECRET,
                }
            }
        )

    app_entry = {
        "name": name,
        "repo": name,
        "image": f"{LOCAL_REGISTRY}/apps/{name}:latest",
        "port": 8080,
        "replicas": 1,
        "namespace": f"app-{name}",
        "status": "pending",
        "build_job": "",
        "last_deployed": "",
        "url": f"http://{PUBLIC_HOST}/apps/{name}",
        "error": "",
        "auth_required": req.auth_required,
        "show_in_home": req.show_in_home,
        "gitea_url": f"http://{PUBLIC_HOST}/gitea/{GITEA_ADMIN_USER}/{name}",
        "clone_url": f"http://{PUBLIC_HOST}/gitea/{GITEA_ADMIN_USER}/{name}.git",
    }
    apps.append(app_entry)
    _write_apps(apps)
    return app_entry


@app.get("/deploy/apps/{name}", summary="Get app status")
async def get_deploy_app(name: str):
    apps = _read_apps()
    app_entry = next((a for a in apps if a.get("name") == name), None)
    if not app_entry:
        raise HTTPException(status_code=404, detail=f"App '{name}' not found")
    return _fix_app_urls(app_entry)


@app.post("/deploy/apps/{name}/toggle-auth", summary="Toggle auth_required for a DeployStack app")
async def toggle_deploy_app_auth(name: str):
    apps = _read_apps()
    app_entry = next((a for a in apps if a.get("name") == name), None)
    if not app_entry:
        raise HTTPException(status_code=404, detail=f"App '{name}' not found")

    app_entry["auth_required"] = not app_entry.get("auth_required", False)
    _write_apps(apps)

    # Re-deploy with updated ingress annotations (no rebuild needed)
    image_tag = f"{CLUSTER_REGISTRY}/apps/{name}:latest"
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: _deploy_app_k8s(
            name, image_tag,
            app_entry.get("port", 8080),
            app_entry.get("replicas", 1),
            app_entry.get("env", []),
            app_entry["auth_required"],
        ))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"app": name, "auth_required": app_entry["auth_required"]}


@app.post("/deploy/apps/{name}/toggle-home", summary="Toggle show_in_home for a DeployStack app")
async def toggle_deploy_app_home(name: str):
    apps = _read_apps()
    app_entry = next((a for a in apps if a.get("name") == name), None)
    if not app_entry:
        raise HTTPException(status_code=404, detail=f"App '{name}' not found")
    app_entry["show_in_home"] = not app_entry.get("show_in_home", False)
    _write_apps(apps)
    return {"app": name, "show_in_home": app_entry["show_in_home"]}


@app.post("/deploy/apps/{name}/restart", summary="Redeploy app using existing image (no rebuild)")
async def restart_deploy_app(name: str):
    apps = _read_apps()
    app_entry = next((a for a in apps if a.get("name") == name), None)
    if not app_entry:
        raise HTTPException(status_code=404, detail=f"App '{name}' not found")

    # Always refresh env/port/replicas from the live GSA-Platform-Suite.yaml in
    # Gitea so that cluster recreations pick up the correct config even when
    # deployed_apps.json was written before this field was persisted.
    repo_name = app_entry.get("repo", name)
    try:
        async with __import__("httpx").AsyncClient(timeout=10) as hx:
            r = await hx.get(
                f"{GITEA_INTERNAL_URL}/api/v1/repos/{GITEA_ADMIN_USER}/{repo_name}"
                f"/raw/GSA-Platform-Suite.yaml",
                auth=(GITEA_ADMIN_USER, GITEA_ADMIN_PASS),
                params={"ref": "main"},
            )
            if r.status_code == 200:
                raw = yaml.safe_load(r.text)
                if isinstance(raw, dict):
                    if "port"     in raw: app_entry["port"]     = int(raw["port"])
                    if "replicas" in raw: app_entry["replicas"] = int(raw["replicas"])
                    app_entry["env"] = raw.get("env", [])
                    _write_apps(apps)
                    logger.info("Refreshed config from GSA-Platform-Suite.yaml for %s", name)
    except Exception as exc:
        logger.warning("Could not refresh GSA-Platform-Suite.yaml for %s: %s", name, exc)

    image_tag     = f"{CLUSTER_REGISTRY}/apps/{name}:latest"
    port          = app_entry.get("port", 8080)
    replicas      = app_entry.get("replicas", 1)
    env_vars      = app_entry.get("env", [])
    auth_required = app_entry.get("auth_required", False)

    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: _deploy_app_k8s(name, image_tag, port, replicas, env_vars, auth_required))
        _update_app_status(name, "running",
                           last_deployed=_now_iso(),
                           url=f"http://{PUBLIC_HOST}/apps/{name}")
    except Exception as e:
        _update_app_status(name, "failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "restarted", "app": name}


@app.delete("/deploy/apps/{name}", summary="Delete app and its Kubernetes namespace")
async def delete_deploy_app(name: str):
    apps = _read_apps()
    if not any(a.get("name") == name for a in apps):
        raise HTTPException(status_code=404, detail=f"App '{name}' not found")

    # Delete k8s namespace (removes Deployment + Service + Ingress)
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: _core_v1().delete_namespace(
            name=f"app-{name}",
            body=k8s_client.V1DeleteOptions(propagation_policy="Background")
        ))
    except Exception:
        pass

    updated = [a for a in apps if a.get("name") != name]
    _write_apps(updated)
    builds = [b for b in _read_builds() if b.get("app_name") != name]
    _write_builds(builds)
    return {"status": "deleted", "name": name}


@app.get("/deploy/apps/{name}/builds", summary="Build history for an app (last 20)")
async def deploy_app_builds(name: str):
    builds = _read_builds()
    app_builds = [b for b in builds if b.get("app_name") == name]
    return sorted(app_builds, key=lambda b: b.get("started_at", ""), reverse=True)[:20]


@app.get("/deploy/apps/{name}/pods", summary="Pod status for a deployed app")
async def deploy_app_pods(name: str):
    ns = f"app-{name}"
    try:
        loop = asyncio.get_event_loop()
        pod_list = await loop.run_in_executor(
            None,
            lambda: _core_v1().list_namespaced_pod(namespace=ns)
        )
        result = []
        for pod in pod_list.items:
            phase = pod.status.phase or "Unknown"
            ready = all(
                cs.ready for cs in (pod.status.container_statuses or [])
            )
            result.append({
                "name": pod.metadata.name,
                "phase": phase,
                "ready": ready,
                "node": pod.spec.node_name or "",
            })
        return result
    except Exception as e:
        return []


@app.post("/deploy/webhook", summary="Gitea push webhook receiver")
async def deploy_webhook(request: Request):
    """Receives push events from Gitea, triggers build + deploy pipeline."""
    # Validate event type
    event = request.headers.get("X-Gitea-Event", "")
    if event != "push":
        return {"status": "ignored", "event": event}

    body = await request.json()
    repo_name = body.get("repository", {}).get("name", "")
    commit = body.get("after", "")
    if not repo_name or not commit or commit == "0000000000000000000000000000000000000000":
        return {"status": "ignored", "reason": "no commit"}

    # Find app entry
    apps = _read_apps()
    app_entry = next((a for a in apps if a.get("repo") == repo_name), None)
    if not app_entry:
        return {"status": "ignored", "reason": "no app registered for this repo"}

    app_name = app_entry["name"]
    short = commit[:8]
    push_image_tag    = f"{LOCAL_REGISTRY}/apps/{app_name}:latest"    # for docker push (host daemon)
    deploy_image_tag  = f"{CLUSTER_REGISTRY}/apps/{app_name}:latest"  # for k8s Deployment (in-cluster pull)
    build_id = str(uuid.uuid4())

    # Persist build entry
    build = {
        "id": build_id,
        "app_name": app_name,
        "commit": commit,
        "started_at": _now_iso(),
        "status": "building",
        "log": "",
    }
    builds = _read_builds()
    builds.insert(0, build)
    _write_builds(builds[:200])

    # Update app status
    _update_app_status(app_name, "building", build_job=f"build-{app_name}-{short}")

    # Create build Job
    try:
        job_name = _create_build_job(app_name, repo_name, commit, push_image_tag)
    except Exception as e:
        _update_app_status(app_name, "failed", error=str(e))
        _update_build_status(build_id, "failed")
        raise HTTPException(status_code=500, detail=str(e))

    # Read GSA-Platform-Suite.yaml from archive to get port/replicas/env
    cfg: dict = {"port": 8080, "replicas": 1, "env": []}
    try:
        async with __import__("httpx").AsyncClient(timeout=10) as hx:
            r = await hx.get(
                f"{GITEA_INTERNAL_URL}/api/v1/repos/{GITEA_ADMIN_USER}/{repo_name}/archive/{commit}.tar.gz",
                auth=(GITEA_ADMIN_USER, GITEA_ADMIN_PASS)
            )
            if r.status_code == 200:
                with tarfile.open(fileobj=io.BytesIO(r.content), mode="r:gz") as tf:
                    for member in tf.getmembers():
                        if member.name.endswith("GSA-Platform-Suite.yaml"):
                            f = tf.extractfile(member)
                            if f:
                                raw = yaml.safe_load(f.read())
                                if isinstance(raw, dict):
                                    cfg["port"] = int(raw.get("port", 8080))
                                    cfg["replicas"] = int(raw.get("replicas", 1))
                                    cfg["env"] = raw.get("env", [])
                            break
    except Exception as e:
        logger.warning("Could not read GSA-Platform-Suite.yaml: %s", e)

    # Update port/replicas/env in app entry (persisted so restarts use correct config)
    for a in apps:
        if a.get("name") == app_name:
            a["port"] = cfg["port"]
            a["replicas"] = cfg["replicas"]
            a["env"] = cfg["env"]
            break
    _write_apps(apps)

    # Start background watcher
    asyncio.create_task(_watch_build_and_deploy(app_name, build_id, deploy_image_tag, cfg, job_name))

    return {"status": "building", "app": app_name, "commit": short, "build_id": build_id}
