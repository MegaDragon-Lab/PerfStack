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
from k8s_runner import create_k6_job, get_job_status, get_job_summary, get_job_pods, get_k6_html_report

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


@app.get("/k6-html-report/{job_name}", summary="Get the k6 web-dashboard HTML report")
async def k6_html_report(job_name: str):
    """Returns the self-contained k6 dashboard HTML generated by K6_WEB_DASHBOARD_EXPORT."""
    from fastapi.responses import HTMLResponse
    try:
        html = await get_k6_html_report(job_name)
        return HTMLResponse(content=html)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
