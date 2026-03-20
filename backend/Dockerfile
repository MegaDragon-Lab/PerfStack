FROM --platform=linux/arm64 python:3.11-slim

# ── Zscaler / corporate CA cert ───────────────────────────────────────────────
ARG CERT_FILE=""

WORKDIR /app

# Copy cert first (before any network calls)
COPY . .

RUN if [ -n "$CERT_FILE" ] && [ -f "$CERT_FILE" ]; then \
      cp "$CERT_FILE" /usr/local/share/ca-certificates/zscaler.crt && \
      update-ca-certificates && \
      pip config set global.cert /usr/local/share/ca-certificates/zscaler.crt; \
    fi

# ── Dependencies ──────────────────────────────────────────────────────────────
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

