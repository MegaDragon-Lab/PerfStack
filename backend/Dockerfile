# ── Multi-arch friendly + optional Zscaler support
ARG CERT_FILE=""
FROM python:3.11-slim

WORKDIR /app
COPY . .

# --- Optional Zscaler cert injection ---
RUN if [ -n "$CERT_FILE" ] && [ -f "$CERT_FILE" ]; then \
      echo "Injecting Zscaler cert: $CERT_FILE"; \
      cp "$CERT_FILE" /usr/local/share/ca-certificates/zscaler.crt && \
      update-ca-certificates; \
    else \
      echo "No Zscaler cert provided, skipping..."; \
    fi

# pip install dependencies
RUN pip install --no-cache-dir \
      --trusted-host pypi.org \
      --trusted-host pypi.python.org \
      --trusted-host files.pythonhosted.org \
      -r requirements.txt

# SSL runtime env
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]