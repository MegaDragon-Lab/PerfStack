# ── Build stage ───────────────────────────────────────────────────────────────
FROM --platform=linux/arm64 node:18-alpine AS builder

ARG CERT_FILE=""
WORKDIR /app

# Copy everything first (cert needs to be available as a file)
COPY . .

# Inject Zscaler cert before npm install
RUN if [ -n "$CERT_FILE" ] && [ -f "$CERT_FILE" ]; then \
      apk add --no-cache ca-certificates && \
      cp "$CERT_FILE" /usr/local/share/ca-certificates/zscaler.crt && \
      update-ca-certificates && \
      npm config set cafile /usr/local/share/ca-certificates/zscaler.crt && \
      export NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/zscaler.crt; \
    fi && \
    npm install && npm run build

# ── Serve stage ───────────────────────────────────────────────────────────────
FROM --platform=linux/arm64 nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]

