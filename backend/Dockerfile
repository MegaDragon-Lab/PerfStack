FROM --platform=linux/arm64 python:3.11-slim

# ── Zscaler / corporate CA cert (optional) ───────────────────────────────────
# Pass --build-arg CERT_FILE=zscaler.pem when behind a corporate proxy
ARG CERT_FILE=""
COPY . /app/
WORKDIR /app

RUN if [ -n "$CERT_FILE" ] && [ -f "$CERT_FILE" ]; then \
      cp "$CERT_FILE" /usr/local/share/ca-certificates/zscaler.crt && \
      update-ca-certificates; \
    fi

# ── Dependencies ──────────────────────────────────────────────────────────────
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
