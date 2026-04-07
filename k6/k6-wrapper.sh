#!/bin/sh
# Transparent wrapper for k6. Installed as /usr/bin/k6 (real binary at /usr/bin/k6-real).
# The k6 Operator calls `k6 run ...` — it gets this wrapper instead.
# After k6 finishes, emits /tmp/k6-report.html to stdout so the backend can
# read it from pod logs (kubectl exec is unavailable on Succeeded pods).
/usr/bin/k6-real "$@"
EXIT_CODE=$?
if [ -f /tmp/k6-report.html ]; then
  printf '\n__K6_HTML_REPORT_START__\n'
  cat /tmp/k6-report.html
  printf '\n__K6_HTML_REPORT_END__\n'
fi
exit $EXIT_CODE
