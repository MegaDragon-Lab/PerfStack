"""
PerfStack — Kubernetes Job Runner
Creates and monitors K6 load test Jobs in the cluster
"""
import json
import logging
from typing import Any

from kubernetes import client, config as k8s_config
from jinja2 import Environment, FileSystemLoader
import pathlib

logger = logging.getLogger(__name__)

NAMESPACE = "perfstack"
INFLUXDB_URL = "http://influxdb:8086/k6"
TEMPLATE_PATH = pathlib.Path(__file__).parent / "k6_template.js"

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


async def create_k6_job(
    job_name: str,
    bearer_token: str,
    target_url: str,
    payload: dict[str, Any],
    vus: int,
    duration: int,
    stages: list[dict],
) -> None:
    """Create a Kubernetes Job that runs a K6 load test."""
    k6_script = _render_k6_script(bearer_token, target_url, payload, vus, duration, stages)

    # Store script in a ConfigMap to avoid env var size limits
    core_v1 = client.CoreV1Api()
    batch_v1 = client.BatchV1Api()

    cm_name = f"{job_name}-script"
    configmap = client.V1ConfigMap(
        metadata=client.V1ObjectMeta(name=cm_name, namespace=NAMESPACE),
        data={"test.js": k6_script},
    )
    core_v1.create_namespaced_config_map(namespace=NAMESPACE, body=configmap)
    logger.info("ConfigMap '%s' created", cm_name)

    job = client.V1Job(
        api_version="batch/v1",
        kind="Job",
        metadata=client.V1ObjectMeta(
            name=job_name,
            namespace=NAMESPACE,
            labels={"app": "k6-runner", "managed-by": "perfstack"},
        ),
        spec=client.V1JobSpec(
            ttl_seconds_after_finished=3600,
            template=client.V1PodTemplateSpec(
                spec=client.V1PodSpec(
                    restart_policy="Never",
                    service_account_name="k6-runner-sa",
                    containers=[
                        client.V1Container(
                            name="k6",
                            image="grafana/k6:latest",
                            args=["run", "--insecure-skip-tls-verify", "--out", f"influxdb={INFLUXDB_URL}", "/scripts/test.js"],
                            volume_mounts=[
                                client.V1VolumeMount(
                                    name="k6-script",
                                    mount_path="/scripts",
                                )
                            ],
                            resources=client.V1ResourceRequirements(
                                requests={"memory": "128Mi", "cpu": "100m"},
                                limits={"memory": "256Mi", "cpu": "500m"},
                            ),
                        )
                    ],
                    volumes=[
                        client.V1Volume(
                            name="k6-script",
                            config_map=client.V1ConfigMapVolumeSource(name=cm_name),
                        )
                    ],
                )
            ),
        ),
    )

    batch_v1.create_namespaced_job(namespace=NAMESPACE, body=job)
    logger.info("K6 Job '%s' created in namespace '%s'", job_name, NAMESPACE)


async def get_job_summary(job_name: str) -> dict:
    """Read k6 summary JSON from completed job pod logs."""
    core_v1 = client.CoreV1Api()

    pods = core_v1.list_namespaced_pod(
        namespace=NAMESPACE,
        label_selector=f"job-name={job_name}",
    )
    if not pods.items:
        raise ValueError(f"No pod found for job '{job_name}'")

    pod_name = pods.items[0].metadata.name
    logs = core_v1.read_namespaced_pod_log(name=pod_name, namespace=NAMESPACE)

    start_marker = "__PERFSTACK_SUMMARY_START__"
    end_marker = "__PERFSTACK_SUMMARY_END__"
    start = logs.find(start_marker)
    end = logs.find(end_marker)
    if start == -1 or end == -1:
        raise ValueError("Summary not found in pod logs — test may still be running or failed before completion")

    json_str = logs[start + len(start_marker):end].strip()
    return json.loads(json_str)


async def get_job_status(job_name: str) -> tuple[str, str]:
    """Returns (status, message) for a given Job name."""
    batch_v1 = client.BatchV1Api()
    try:
        job = batch_v1.read_namespaced_job(name=job_name, namespace=NAMESPACE)
    except client.exceptions.ApiException as e:
        if e.status == 404:
            raise ValueError(f"Job '{job_name}' not found")
        raise

    s = job.status
    if s.succeeded:
        return "completed", f"Test completed successfully ({s.succeeded} pod succeeded)"
    elif s.failed:
        return "failed", f"Test failed ({s.failed} pod failed) — check Grafana for partial metrics"
    elif s.active:
        return "running", f"Test running ({s.active} active pod)"
    else:
        return "pending", "Job is pending scheduling"
