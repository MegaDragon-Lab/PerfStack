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
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  thresholds: {
    'http_req_duration': ['p(95)<2000'],
    'http_req_failed':   ['rate<0.05'],
    'custom_errors':     ['rate<0.05'],
  },
};

const TARGET_URL = '{{ target_url }}';
const METHOD     = '{{ method }}';
const PAYLOAD    = JSON.stringify({{ payload }});
const TOKEN      = '{{ bearer_token }}';

const CUSTOM_HEADERS = {{ custom_headers }};

const PARAMS = {
  headers: {
    'Content-Type':  'application/json',
    'Accept':        'application/json',
    ...CUSTOM_HEADERS,
    'Authorization': `Bearer ${TOKEN}`,
  },
};

export default function () {
  const body = (METHOD === 'GET' || METHOD === 'HEAD') ? null : PAYLOAD;
  const res = http.request(METHOD, TARGET_URL, body, PARAMS);

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

  sleep({{ sleep_interval }});
}

export function handleSummary(data) {
  const report = {
    meta: {
      target_url: TARGET_URL,
      vus: {{ vus }},
      duration: {{ duration }},
      scenario: '{{ scenario }}',
      timestamp: new Date().toISOString(),
    },
    metrics: {},
    thresholds: {},
  };

  for (const [key, metric] of Object.entries(data.metrics)) {
    report.metrics[key] = metric.values;
  }

  if (data.root_group && data.root_group.checks) {
    report.checks = data.root_group.checks;
  }

  for (const [key, threshold] of Object.entries(data.metrics)) {
    if (threshold.thresholds) {
      report.thresholds[key] = threshold.thresholds;
    }
  }

  return {
    stdout: '\n__PERFSTACK_SUMMARY_START__\n' + JSON.stringify(report) + '\n__PERFSTACK_SUMMARY_END__\n',
  };
}
