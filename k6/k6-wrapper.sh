#!/bin/sh
# Run k6 with all arguments passed by the k6 Operator, then emit the HTML
# report to stdout so the backend can read it from pod logs (exec is unavailable
# on completed/Succeeded pods).
/usr/bin/k6 "$@"
EXIT_CODE=$?
if [ -f /tmp/k6-report.html ]; then
  printf '\n__K6_HTML_REPORT_START__\n'
  cat /tmp/k6-report.html
  printf '\n__K6_HTML_REPORT_END__\n'
fi
exit $EXIT_CODE
