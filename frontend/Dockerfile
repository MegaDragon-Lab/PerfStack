# ── Build stage ───────────────────────────────────────────────────────────────
FROM --platform=linux/arm64 node:18-alpine AS builder

ARG CERT_FILE=""
WORKDIR /app
COPY . .

# Inject cert + set npm trusted hosts for Zscaler
RUN if [ -n "$CERT_FILE" ] && [ -f "$CERT_FILE" ]; then \
      apk add --no-cache ca-certificates && \
      cp "$CERT_FILE" /usr/local/share/ca-certificates/zscaler.crt && \
      update-ca-certificates; \
    fi

# Tell npm to skip strict SSL (equivalent of --trusted-host for pip)
RUN npm config set strict-ssl false && \
    npm install && \
    npm run build

# ── Serve stage ───────────────────────────────────────────────────────────────
FROM --platform=linux/arm64 nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
