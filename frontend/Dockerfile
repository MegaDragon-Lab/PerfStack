# ── Build stage ───────────────────────────────────────────────────────────────
FROM --platform=linux/arm64 node:18-alpine AS builder

# Zscaler / corporate CA cert (optional)
ARG CERT_FILE=""
WORKDIR /app
COPY . .

RUN if [ -n "$CERT_FILE" ] && [ -f "$CERT_FILE" ]; then \
      cp "$CERT_FILE" /usr/local/share/ca-certificates/zscaler.crt && \
      apk add --no-cache ca-certificates && \
      update-ca-certificates && \
      npm config set cafile "$CERT_FILE"; \
    fi

RUN npm install && npm run build

# ── Serve stage ───────────────────────────────────────────────────────────────
FROM --platform=linux/arm64 nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
