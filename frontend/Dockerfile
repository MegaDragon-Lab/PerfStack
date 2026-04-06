# ── Build stage ───────────────────────────────────────────────────────────────
FROM --platform=linux/arm64 node:18-alpine AS builder

ARG CERT_FILE=""
WORKDIR /app
COPY . .

# npm: skip strict SSL (Zscaler intercepts TLS)
RUN npm config set strict-ssl false && \
    npm install && \
    npm run build

# ── Serve stage ───────────────────────────────────────────────────────────────
FROM --platform=linux/arm64 nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
