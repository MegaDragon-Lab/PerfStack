"""
PerfStack — IAM Authentication Client
OAuth2 Client Credentials Flow with token caching
"""
import time
import logging
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger(__name__)


@dataclass
class IamAuthClient:
    """Fetches and caches Bearer tokens via OAuth2 client credentials."""

    iam_url: str
    client_id: str
    client_secret: str
    _token: str = field(default="", repr=False)
    _expires_at: float = field(default=0.0, repr=False)

    async def get_bearer_token(self) -> str:
        """
        Returns a valid Bearer token.
        Uses cached token if still valid (refreshes 30s before expiry).
        """
        if self._token and time.time() < self._expires_at - 30:
            logger.debug("Using cached token (expires in %.0fs)", self._expires_at - time.time())
            return self._token
        return await self._fetch_token()

    async def _fetch_token(self) -> str:
        logger.info("Requesting new token from IAM (client_id=%s)", self.client_id)
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                self.iam_url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

        if response.status_code != 200:
            logger.error("IAM returned %d", response.status_code)
            raise RuntimeError(
                f"IAM authentication failed ({response.status_code}): {response.text}"
            )

        data = response.json()
        self._token = data["access_token"]
        expires_in = data.get("expires_in", 3600)
        self._expires_at = time.time() + expires_in
        logger.info("Token obtained, expires in %ds", expires_in)
        return self._token
