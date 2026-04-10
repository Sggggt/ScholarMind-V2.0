"""mDNS service publisher for ScholarMind backend."""

from __future__ import annotations

import asyncio
import logging
import threading
import re
from typing import TYPE_CHECKING

from zeroconf import IPVersion, InterfaceChoice, ServiceInfo, Zeroconf

from services.connection_service import API_BASE_PATH, HEALTH_PATH, WS_BASE_PATH, discover_lan_hosts

if TYPE_CHECKING:
    from .identity import DeviceIdentity

SERVICE_TYPE = "_scholarmind._tcp.local."

logger = logging.getLogger(__name__)


def _sanitize_host_label(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9-]", "-", (value or "").strip())
    normalized = re.sub(r"-{2,}", "-", normalized).strip("-").lower()
    return normalized or "scholarmind"


def _build_server_name(value: str) -> str:
    return f"{_sanitize_host_label(value)}.local."


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

    def _build_txt(self) -> dict[str, str]:
        return {
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

    def _build_service_info(self, service_name: str, server_name: str, interface_ip: str | None) -> ServiceInfo:
        kwargs = {
            "type_": SERVICE_TYPE,
            "name": service_name,
            "port": self._port,
            "server": server_name,
            "properties": self._build_txt(),
        }
        if interface_ip:
            kwargs["parsed_addresses"] = [interface_ip]
        return ServiceInfo(**kwargs)

    async def start_async(self) -> None:
        """Start mDNS service broadcasting inside an async event loop."""
        if not self._lock.acquire(timeout=1):
            self._log.warning("Failed to acquire lock for mDNS start")
            return

        try:
            if self.zeroconf or self._port is None:
                return

            candidate_ips = [self._interface_ip] if self._interface_ip else discover_lan_hosts()
            errors: list[Exception] = []
            server_name = _build_server_name(self.identity.name)
            hostname = self.identity.name
            service_name = f"{hostname}-{self.identity.device_id[:8]}.{SERVICE_TYPE}"

            for interface_ip in candidate_ips:
                try:
                    self._log.info("Starting mDNS publisher on %s", interface_ip)
                    self.zeroconf = Zeroconf(ip_version=IPVersion.V4Only, interfaces=[interface_ip])
                    await self.zeroconf.async_wait_for_start(timeout=1.5)
                    self.info = self._build_service_info(service_name, server_name, interface_ip)
                    await self.zeroconf.async_register_service(self.info)
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
                        interface_ip,
                        repr(exc),
                    )
                    if self.zeroconf:
                        try:
                            self.zeroconf.close()
                        except Exception:
                            pass
                        self.zeroconf = None
                        self.info = None

            if not candidate_ips:
                try:
                    self._log.info("Starting mDNS publisher on default IPv4 interface")
                    self.zeroconf = Zeroconf(ip_version=IPVersion.V4Only, interfaces=InterfaceChoice.Default)
                    await self.zeroconf.async_wait_for_start(timeout=1.5)
                    self.info = self._build_service_info(service_name, server_name, None)
                    await self.zeroconf.async_register_service(self.info)
                    self._log.info("mDNS service registered on default interface: %s", service_name)
                    return
                except Exception as exc:
                    errors.append(exc)
                    self._log.warning("mDNS publisher start failed on default IPv4 interface: %s", repr(exc))
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

    def start(self) -> None:
        """Synchronous wrapper for non-async callers."""
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            asyncio.run(self.start_async())
            return
        raise RuntimeError("MdnsServicePublisher.start() cannot be used inside a running event loop")

    async def stop_async(self) -> None:
        """Stop mDNS service broadcasting inside an async event loop."""
        if not self._lock.acquire(timeout=1):
            return

        try:
            if self.zeroconf and self.info:
                zc = self.zeroconf
                info = self.info
                try:
                    await zc.async_unregister_service(info)
                except Exception:
                    pass
                try:
                    zc.close()
                except Exception:
                    pass

            self.zeroconf = None
            self.info = None
        finally:
            self._lock.release()

    def stop(self) -> None:
        """Synchronous wrapper for non-async callers."""
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            asyncio.run(self.stop_async())
            return
        raise RuntimeError("MdnsServicePublisher.stop() cannot be used inside a running event loop")
