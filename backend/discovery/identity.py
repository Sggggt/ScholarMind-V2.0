"""Device identity management for ScholarMind mDNS discovery."""

from __future__ import annotations

import json
import os
import socket
import uuid
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path

# Device identity storage path
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
IDENTITY_FILE = DATA_DIR / "device_identity.json"


@dataclass
class DeviceIdentity:
    """Device identity for mDNS service discovery."""

    device_id: str
    name: str
    fingerprint: str

    @classmethod
    def load_or_create(cls) -> "DeviceIdentity":
        """Load existing identity or create a new one."""
        IDENTITY_FILE.parent.mkdir(parents=True, exist_ok=True)

        if IDENTITY_FILE.exists():
            try:
                with open(IDENTITY_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                return cls(**data)
            except (json.JSONDecodeError, TypeError, KeyError):
                # File corrupted, create new identity
                pass

        # Create new identity
        hostname = socket.gethostname()
        device_id = str(uuid.uuid4())
        fingerprint = sha256(device_id.encode()).hexdigest()[:32]

        identity = cls(
            device_id=device_id,
            name=hostname,
            fingerprint=fingerprint,
        )

        # Save to disk
        with open(IDENTITY_FILE, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "device_id": identity.device_id,
                    "name": identity.name,
                    "fingerprint": identity.fingerprint,
                },
                f,
                ensure_ascii=False,
                indent=2,
            )

        return identity
