import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate  = new Rate('custom_errors');
const reqDuration = new Trend('custom_req_duration');
const http2xx    = new Counter('http_2xx');
const http503    = new Counter('http_503');

export const options = {
  stages: {{ stages }},
  thresholds: {
    'http_req_duration': ['p(95)<2000'],
    'http_req_failed':   ['rate<0.05'],
    'custom_errors':     ['rate<0.05'],
  },
};

const TARGET_URL = '{{ target_url }}';
const PAYLOAD    = JSON.stringify({{ payload }});
const TOKEN      = '{{ bearer_token }}';

const PARAMS = {
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type':  'application/json',
    'Accept':        'application/json',
  },
};

export default function () {
  const res = http.post(TARGET_URL, PAYLOAD, PARAMS);

  const success = check(res, {
    'status is 2xx':       (r) => r.status >= 200 && r.status < 300,
    'response time < 2s':  (r) => r.timings.duration < 2000,
  });

  errorRate.add(!success);
  reqDuration.add(res.timings.duration);
  if (res.status >= 200 && res.status < 300) {
    http2xx.add(1);
  } else if (res.status >= 500) {
    http503.add(1);
  }

  sleep(0.1);
}
