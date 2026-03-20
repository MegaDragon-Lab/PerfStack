# PerfStack — Zscaler / Corporate Proxy Setup

If you're behind a Zscaler or corporate TLS-inspection proxy, Docker pulls
inside Minikube will fail with:

```
x509: certificate signed by unknown authority
```

## Fix in 3 steps

### 1. Get your Zscaler cert

```bash
# Option A — export from macOS Keychain
security find-certificate -a -c "Zscaler" -p > zscaler.pem

# Option B — your IT team should provide a zscaler.pem file directly
# Copy it into the PerfStack project root:
cp /path/to/zscaler.pem ./zscaler.pem
```

### 2. Run the deploy script as normal

```bash
./deploy.sh
```

The script detects `zscaler.pem` in the project root automatically and:
- Injects the cert into the **Minikube VM** (so it can pull images)
- Passes it as a `--build-arg` to **both Docker builds** (so pip and npm can pull packages)
- Runs `update-ca-certificates` inside each container

### 3. If your cert is in a different location

```bash
ZSCALER_CERT=/path/to/your/cert.pem ./deploy.sh
```

## What the script does internally

```
1. minikube cp zscaler.pem /etc/ssl/certs/zscaler.pem
2. minikube ssh "sudo update-ca-certificates && sudo systemctl restart docker"
3. docker build --build-arg CERT_FILE=zscaler.pem ...
   → COPY zscaler.pem + update-ca-certificates inside the container
   → pip install / npm install now trust the Zscaler CA
```

## Verify it worked

```bash
# Test that Minikube can pull images after cert injection
minikube ssh "docker pull python:3.11-slim"
```

## Note

`zscaler.pem` is in `.gitignore` — it will never be committed to the repo.
