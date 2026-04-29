# GSA Platform Suite — Changelog

---

## v3.4.0 — 2026-04-28

### What's New: Role-Based Access Control (RBAC)

Users are now assigned roles that control which modules they can see and which
deployed apps they can access. Everything is driven by a single YAML file
(`backend/rbac.yaml`) that can be updated without redeploying the platform.

#### Roles

| Role        | Modules                              | Deployed Apps      |
|-------------|--------------------------------------|--------------------|
| `admin`     | PerfStack, MonitorStack, DeployStack | all (`*`)          |
| `gsa_team` | PerfStack, MonitorStack              | `epc-*`, `fraud-*` |
| `readonly`  | MonitorStack only                    | none               |

Resolution order for email matching: exact match → domain wildcard (`*@fico.com`) → catch-all (`*`).

#### New: `backend/rbac.yaml`

Declarative config for roles and assignments. Supports both single-email and
multi-email entries per assignment:

```yaml
assignments:
  - emails:
      - "alice@fico.com"
      - "bob@fico.com"
    role: admin
  - email: "*@fico.com"
    role: gsa_team
  - email: "*"
    role: readonly
```

#### New: Zero-downtime config reload — `reload_rbac.sh`

```bash
./reload_rbac.sh
```

Injects the updated `rbac.yaml` into the running backend pod via `kubectl cp`.
Changes take effect on the next request — no pod restart or redeploy needed.

#### Backend changes (`backend/main.py`)

- Added `resolve_role(uid)` — resolves a user's role from `rbac.yaml`
- Added `get_modules(uid)` — returns the list of allowed modules for a user
- Added `can_access_app(uid, app_name)` — checks wildcard patterns for app access
- `/auth/me` now returns `role` and `modules` fields alongside existing user info
- `/deploy/check-auth` (nginx `auth_request` endpoint) now enforces per-role app
  access; users whose role doesn't match the app's name pattern receive 403
- `GET /api/rbac` — returns the current RBAC config (admin only)
- `PUT /api/rbac` — overwrites `rbac.yaml` in-place (admin only); changes are
  live immediately without restarting the pod
- `rbac.yaml` is read from `/data/rbac.yaml` (persistent volume) with fallback
  to the image-baked copy — so `reload_rbac.sh` always wins over the default

#### Bug fix: nginx `auth_request` app check was never enforced

nginx-ingress passes the request URI as `X-Original-URL` (full URL, e.g.
`http://localhost/apps/test/`), not `X-Original-URI`. The backend was reading
the wrong header, getting an empty string, and silently skipping the app-name
RBAC check — letting every authenticated user through regardless of role.
Fixed: the endpoint now reads `X-Original-URL` and uses `urlparse()` to extract
the path before checking `can_access_app`.

#### Frontend changes (`frontend/src/App.jsx`)

- Tab buttons (PerfStack, MonitorStack, DeployStack) are now rendered
  conditionally based on `currentUser.modules` returned by `/auth/me`
- If the active tab is not in the user's allowed modules (e.g. after a role
  change), the UI automatically redirects to the home tab
- Role badge displayed next to the username in the header (e.g. `ADMIN`,
  `PERF_TEAM`, `READONLY`)

---

## v3.1.0 — prior release

- PerfStack load testing (K6 + Grafana + InfluxDB on k3d)
- MonitorStack Grafana dashboards with live pod metrics
- DeployStack app lifecycle management (deploy, restart, logs, builds)
- DMS / Okta SSO authentication (`ps_session` HttpOnly cookie)
- Dark / Light theme with Grafana iframe sync
- Persistent storage for web services and custom scenarios
- Downloadable HTML test reports
- Dry Run mode for config validation
- Zscaler SSL support
