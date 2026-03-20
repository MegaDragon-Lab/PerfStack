import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('custom_errors');
const reqDuration = new Trend('custom_req_duration');

export const options = {
  stages: [
    { duration: '30s', target: {{ vus }} },       // ramp up
    { duration: '{{ duration }}s', target: {{ vus }} }, // sustain
    { duration: '10s', target: 0 },               // ramp down
  ],
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

  sleep(1);
}
