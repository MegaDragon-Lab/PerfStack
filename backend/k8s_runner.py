"""
PerfStack — Kubernetes TestRun Runner (k6 Operator)
Creates and monitors K6 TestRun CRs with horizontal scaling (parallelism=8)
"""
import json
import logging
from typing import Any

from kubernetes import client, config as k8s_config
from jinja2 import Environment, FileSystemLoader
import pathlib

logger = logging.getLogger(__name__)

NAMESPACE      = "perfstack"
INFLUXDB_ADDR  = "http://influxdb:8086"
INFLUXDB_TOKEN = "perfstack-token"
INFLUXDB_ORG   = "perfstack"
INFLUXDB_BUCKET = "k6"
TEMPLATE_PATH  = pathlib.Path(__file__).parent / "k6_template.js"
PARALLELISM    = 4

# Resources per runner pod
RUNNER_REQUESTS = {"cpu": "500m",  "memory": "512Mi"}
RUNNER_LIMITS   = {"cpu": "1000m", "memory": "1024Mi"}

# Load Kubernetes config (in-cluster or local kubeconfig)
try:
    k8s_config.load_incluster_config()
    logger.info("Using in-cluster Kubernetes config")
except k8s_config.ConfigException:
    k8s_config.load_kube_config()
    logger.info("Using local kubeconfig")


def _render_k6_script(
    bearer_token: str,
    target_url: str,
    payload: dict[str, Any],
    vus: int,
    duration: int,
    stages: list[dict],
) -> str:
    """Render the Jinja2 K6 template with runtime values."""
    env = Environment(loader=FileSystemLoader(str(TEMPLATE_PATH.parent)))
    template = env.get_template(TEMPLATE_PATH.name)
    return template.render(
        bearer_token=bearer_token,
        target_url=target_url,
        payload=json.dumps(payload),
        vus=vus,
        duration=duration,
        stages=json.dumps(stages),
    )


def _cleanup_completed_testruns() -> None:
    """Delete all finished/errored TestRun CRs (pods are garbage-collected in cascade)."""
    custom = client.CustomObjectsApi()
    try:
        runs = custom.list_namespaced_custom_object(
            group="k6.io", version="v1alpha1",
            namespace=NAMESPACE, plural="testruns",
        )
        for tr in runs.get("items", []):
            stage = tr.get("status", {}).get("stage", "")
            if stage in ("finished", "error"):
                name = tr["metadata"]["name"]
                custom.delete_namespaced_custom_object(
                    group="k6.io", version="v1alpha1",
                    namespace=NAMESPACE, plural="testruns", name=name,
                )
                logger.info("Cleaned up completed TestRun '%s'", name)
    except Exception as e:
        logger.warning("TestRun cleanup failed (non-fatal): %s", e)


async def create_k6_job(
    job_name: str,
    bearer_token: str,
    target_url: str,
    payload: dict[str, Any],
    vus: int,
    duration: int,
    stages: list[dict],
) -> None:
    """Create a k6 Operator TestRun CR with parallelism=8."""
    _cleanup_completed_testruns()

    k6_script = _render_k6_script(bearer_token, target_url, payload, vus, duration, stages)

    # Store script in a ConfigMap
    core_v1  = client.CoreV1Api()
    custom   = client.CustomObjectsApi()

    cm_name = f"{job_name}-script"
    core_v1.create_namespaced_config_map(
        namespace=NAMESPACE,
        body=client.V1ConfigMap(
            metadata=client.V1ObjectMeta(name=cm_name, namespace=NAMESPACE),
            data={"test.js": k6_script},
        ),
    )
    logger.info("ConfigMap '%s' created", cm_name)

    test_run = {
        "apiVersion": "k6.io/v1alpha1",
        "kind": "TestRun",
        "metadata": {
            "name": job_name,
            "namespace": NAMESPACE,
            "labels": {"app": "k6-runner", "managed-by": "perfstack"},
        },
        "spec": {
            "parallelism": PARALLELISM,
            "arguments": "--out xk6-influxdb --insecure-skip-tls-verify --no-thresholds",
            "script": {
                "configMap": {
                    "name": cm_name,
                    "file": "test.js",
                }
            },
            "runner": {
                "image": "k3d-perfstack-registry:5000/library/perfstack-k6:latest",
                "imagePullPolicy": "Always",
                "env": [
                    {"name": "K6_INFLUXDB_ADDR",   "value": INFLUXDB_ADDR},
                    {"name": "K6_INFLUXDB_TOKEN",  "value": INFLUXDB_TOKEN},
                    {"name": "K6_INFLUXDB_ORGANIZATION", "value": INFLUXDB_ORG},
                    {"name": "K6_INFLUXDB_BUCKET", "value": INFLUXDB_BUCKET},
                ],
                "serviceAccountName": "k6-runner-sa",
                "resources": {
                    "requests": RUNNER_REQUESTS,
                    "limits":   RUNNER_LIMITS,
                },
            },
        },
    }

    custom.create_namespaced_custom_object(
        group="k6.io",
        version="v1alpha1",
        namespace=NAMESPACE,
        plural="testruns",
        body=test_run,
    )
    logger.info("TestRun '%s' created in namespace '%s' (parallelism=%d)", job_name, NAMESPACE, PARALLELISM)


async def get_job_status(job_name: str) -> tuple[str, str]:
    """Returns (status, message) for a given TestRun name."""
    custom = client.CustomObjectsApi()
    try:
        tr = custom.get_namespaced_custom_object(
            group="k6.io",
            version="v1alpha1",
            namespace=NAMESPACE,
            plural="testruns",
            name=job_name,
        )
    except client.exceptions.ApiException as e:
        if e.status == 404:
            raise ValueError(f"TestRun '{job_name}' not found")
        raise

    stage = tr.get("status", {}).get("stage", "")
    if stage == "finished":
        return "completed", f"Test completed successfully ({PARALLELISM} pods)"
    elif stage == "error":
        return "failed", "Test failed — check Grafana for partial metrics"
    elif stage in ("started", "running", "created", "initialized", "initialization"):
        return "running", f"Test running (stage: {stage}, pods: {PARALLELISM})"
    else:
        return "pending", f"Job is pending (stage: {stage or 'unknown'})"


async def get_job_summary(job_name: str) -> dict:
    """Read k6 summary JSON from one of the completed runner pod logs."""
    core_v1 = client.CoreV1Api()

    # k6 Operator labels runner pods with k6_cr=<testrun-name> and role=runner
    pods = core_v1.list_namespaced_pod(
        namespace=NAMESPACE,
        label_selector=f"k6_cr={job_name},role=runner",
    )
    if not pods.items:
        # Fallback: try without role label (older operator versions)
        pods = core_v1.list_namespaced_pod(
            namespace=NAMESPACE,
            label_selector=f"k6_cr={job_name}",
        )
    if not pods.items:
        raise ValueError(f"No runner pods found for TestRun '{job_name}'")

    # Try each pod until we find the summary (only one pod emits it)
    start_marker = "__PERFSTACK_SUMMARY_START__"
    end_marker   = "__PERFSTACK_SUMMARY_END__"

    for pod in pods.items:
        try:
            logs = core_v1.read_namespaced_pod_log(
                name=pod.metadata.name, namespace=NAMESPACE
            )
            start = logs.find(start_marker)
            end   = logs.find(end_marker)
            if start != -1 and end != -1:
                return json.loads(logs[start + len(start_marker):end].strip())
        except Exception:
            continue

    raise ValueError(
        "Summary not found in any runner pod logs — "
        "test may still be running or failed before completion"
    )


async def get_job_pods(job_name: str) -> list[dict]:
    """Return real-time pod info for all k6 runner pods of a TestRun."""
    core_v1 = client.CoreV1Api()
    custom  = client.CustomObjectsApi()

    # 1. List all pods for the job, then filter to runner pods only
    pods = core_v1.list_namespaced_pod(
        namespace=NAMESPACE,
        label_selector=f"k6_cr={job_name},role=runner",
    )
    if not pods.items:
        pods = core_v1.list_namespaced_pod(
            namespace=NAMESPACE,
            label_selector=f"k6_cr={job_name}",
        )

    # Exclude initializer and starter — only actual runner pods
    runner_pods = [
        p for p in pods.items
        if "initializer" not in p.metadata.name
        and "starter" not in p.metadata.name
    ]
    n_runners = len(runner_pods)

    # 2. Fetch CPU/memory from metrics-server
    metrics_by_pod: dict[str, dict] = {}
    try:
        pod_metrics = custom.list_namespaced_custom_object(
            group="metrics.k8s.io",
            version="v1beta1",
            namespace=NAMESPACE,
            plural="pods",
        )
        for pm in pod_metrics.get("items", []):
            name = pm["metadata"]["name"]
            containers = pm.get("containers", [])
            if containers:
                cpu_str = containers[0]["usage"].get("cpu", "0")
                mem_str = containers[0]["usage"].get("memory", "0")
                # nanocores → millicores
                if cpu_str.endswith("n"):
                    cpu_m = round(int(cpu_str[:-1]) / 1_000_000)
                elif cpu_str.endswith("m"):
                    cpu_m = int(cpu_str[:-1])
                else:
                    cpu_m = round(float(cpu_str) * 1000)
                # Ki / Mi / Gi → MiB
                if mem_str.endswith("Ki"):
                    mem_mi = round(int(mem_str[:-2]) / 1024)
                elif mem_str.endswith("Mi"):
                    mem_mi = int(mem_str[:-2])
                elif mem_str.endswith("Gi"):
                    mem_mi = round(float(mem_str[:-2]) * 1024)
                else:
                    mem_mi = 0
                metrics_by_pod[name] = {"cpu_m": cpu_m, "memory_mi": mem_mi}
    except Exception:
        pass  # metrics-server not available — resource columns show "—"

    # 3. Build result — pod name format: {job_name}-{index}-{random5chars}
    result = []
    for pod in runner_pods:
        pod_name = pod.metadata.name
        labels   = pod.metadata.labels or {}

        instance = labels.get("job-index", "")
        if not instance:
            suffix   = pod_name[len(job_name) + 1:] if pod_name.startswith(job_name + "-") else pod_name
            instance = suffix.split("-")[0]

        m = metrics_by_pod.get(pod_name, {})
        result.append({
            "name":      pod_name,
            "instance":  instance,
            "status":    pod.status.phase or "Unknown",
            "cpu_m":     m.get("cpu_m"),
            "memory_mi": m.get("memory_mi"),
        })

    result.sort(key=lambda p: p["instance"])
    return result
