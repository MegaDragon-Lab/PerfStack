# Build custom k6 with xk6-output-influxdb extension (supports InfluxDB v2)
FROM golang:alpine AS builder

ARG CERT_FILE=""

# Inject Zscaler cert BEFORE apk runs (apk needs SSL to reach Alpine CDN)
# golang:alpine already has /etc/ssl/certs/ca-certificates.crt — append to it
COPY . .
RUN if [ -n "${CERT_FILE}" ] && [ -f "${CERT_FILE}" ]; then \
      cat "${CERT_FILE}" >> /etc/ssl/certs/ca-certificates.crt; \
    fi

RUN apk add --no-cache git

# Pin to last known-stable versions — avoids pulling k6 v2.0-rc1 via @latest
RUN go install go.k6.io/xk6/cmd/xk6@latest
RUN xk6 build v1.7.1 --with github.com/grafana/xk6-output-influxdb@v0.7.0 --output /k6

# Minimal runtime image — copy certs from builder (avoids apk SSL issues)
FROM alpine:3.19
COPY --from=builder /etc/ssl/certs /etc/ssl/certs
COPY --from=builder /usr/local/share/ca-certificates /usr/local/share/ca-certificates
COPY --from=builder /k6 /usr/bin/k6-real
COPY k6-wrapper.sh /usr/bin/k6
RUN chmod +x /usr/bin/k6
ENTRYPOINT ["/usr/bin/k6"]
