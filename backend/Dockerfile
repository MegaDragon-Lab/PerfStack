FROM --platform=linux/arm64 python:3.11-slim

ARG CERT_FILE=""

WORKDIR /app

COPY . .

# Inject Zscaler cert into system bundle
RUN if [ -n "$CERT_FILE" ] && [ -f "$CERT_FILE" ]; then \
      cp "$CERT_FILE" /usr/local/share/ca-certificates/zscaler.crt && \
      update-ca-certificates; \
    fi

# pip: trust PyPI explicitly and use system CA bundle (Zscaler intercepts TLS)
RUN pip install --no-cache-dir \
      --trusted-host pypi.org \
      --trusted-host pypi.python.org \
      --trusted-host files.pythonhosted.org \
      --cert /etc/ssl/certs/ca-certificates.crt \
      -r requirements.txt

# Runtime SSL env — so the app itself trusts Zscaler when making HTTP calls
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
