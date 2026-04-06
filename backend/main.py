"""
PerfStack — FastAPI Backend
Orchestrates IAM auth, K6 script generation and Kubernetes job lifecycle
"""
import uuid
import logging
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from auth import IamAuthClient
from k8s_runner import create_k6_job, get_job_status, get_job_summary

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

@app.get("/health")
async def health():
    return {"status": "ok"}


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
