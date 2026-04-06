"""mDNS service publisher for ScholarMind backend."""

from __future__ import annotations

import logging
import socket
import threading
from typing import TYPE_CHECKING

from zeroconf import IPVersion, InterfaceChoice, ServiceInfo, Zeroconf

from services.connection_service import API_BASE_PATH, HEALTH_PATH, WS_BASE_PATH

if TYPE_CHECKING:
    from .identity import DeviceIdentity

SERVICE_TYPE = "_scholarmind._tcp.local."

logger = logging.getLogger(__name__)


class MdnsServicePublisher:
    """Publishes ScholarMind backend service via mDNS/Bonjour."""

    def __init__(self, identity: "DeviceIdentity") -> None:
        """Initialize the mDNS service publisher.

        Args:
            identity: Device identity containing device_id, name, and fingerprint.
        """
        self.identity = identity
        self.zeroconf: Zeroconf | None = None
        self.info: ServiceInfo | None = None
        self._lock = threading.Lock()
        self._port: int | None = None
        self._interface_ip: str | None = None
        self._log = logging.getLogger(__name__)

    def configure_port(self, port: int) -> None:
        """Configure the service port.

        Can be called before or after start() to update the port.

        Args:
            port: The TCP port number the backend is listening on.
        """
        self._port = port
        if self.zeroconf and self.info:
            # Re-register with new port
            self.stop()
            self.start()

    def configure_interface(self, interface_ip: str | None) -> None:
        """Bind mDNS advertisements to a specific interface.

        Args:
            interface_ip: IPv4 address of the interface to bind to, or None for all interfaces.
        """
        self._interface_ip = interface_ip
        if self.zeroconf:
            self.stop()
            self.start()

    def start(self) -> None:
        """Start mDNS service broadcasting.

        This method is thread-safe and can be called multiple times.
        """
        if not self._lock.acquire(timeout=1):
            self._log.warning("Failed to acquire lock for mDNS start")
            return

        try:
            if self.zeroconf or self._port is None:
                return

            interfaces = [self._interface_ip] if self._interface_ip else InterfaceChoice.All
            errors: list[Exception] = []

            for iface_choice in (interfaces, InterfaceChoice.Default):
                try:
                    self._log.info("Starting mDNS publisher on %s", iface_choice)
                    self.zeroconf = Zeroconf(ip_version=IPVersion.All, interfaces=iface_choice)

                    hostname = self.identity.name
                    service_name = f"{hostname}-{self.identity.device_id[:8]}.{SERVICE_TYPE}"

                    # TXT records with device metadata
                    txt = {
                        "id": self.identity.device_id,
                        "name": self.identity.name,
                        "fpr": self.identity.fingerprint,
                        "ver": "1",
                        "role": "backend",
                        "service": "scholarmind-backend",
                        "scheme": "http",
                        "api": API_BASE_PATH,
                        "ws": WS_BASE_PATH,
                        "health": HEALTH_PATH,
                        "api_port": str(self._port),
                    }

                    # Build addresses for the service
                    addresses = None
                    if self._interface_ip:
                        try:
                            addresses = [socket.inet_aton(self._interface_ip)]
                        except OSError:
                            pass

                    self.info = ServiceInfo(
                        type_=SERVICE_TYPE,
                        name=service_name,
                        port=self._port,
                        addresses=addresses,
                        properties=txt,
                    )

                    self.zeroconf.register_service(self.info)
                    self._log.info(
                        "mDNS service registered: %s at port %d",
                        service_name,
                        self._port,
                    )
                    return
                except Exception as exc:
                    errors.append(exc)
                    self._log.warning(
                        "mDNS publisher start failed on %s: %s",
                        iface_choice,
                        exc,
                    )
                    if self.zeroconf:
                        try:
                            self.zeroconf.close()
                        except Exception:
                            pass
                        self.zeroconf = None
                        self.info = None

            if errors:
                raise errors[-1]

        finally:
            self._lock.release()

    def stop(self) -> None:
        """Stop mDNS service broadcasting.

        This method is thread-safe and can be called multiple times.
        """
        if not self._lock.acquire(timeout=1):
            return

        try:
            if self.zeroconf and self.info:
                zc = self.zeroconf
                info = self.info

                def closer() -> None:
                    try:
                        try:
                            zc.unregister_service(info)
                        except Exception:
                            pass
                        zc.close()
                    except Exception:
                        pass

                t = threading.Thread(target=closer, daemon=True)
                t.start()
                t.join(timeout=2)

            self.zeroconf = None
            self.info = None
        finally:
            self._lock.release()
