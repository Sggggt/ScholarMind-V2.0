from __future__ import annotations

from dataclasses import dataclass, asdict
import json
import socket
from typing import Iterable
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

from fastapi import Request

import config


@dataclass(frozen=True)
class ConnectionAddress:
    scope: str
    label: str
    url: str
    ws_url: str
    source: str
    recommended: bool = False


def _normalize_base_url(url: str) -> str:
    return (url or "").strip().rstrip("/")


def _default_port(scheme: str) -> int:
    return 443 if scheme == "https" else 80


def _parse_host_port(value: str) -> tuple[str, int | None]:
    raw = (value or "").strip()
    if not raw:
        return "", None

    if "://" in raw:
        parsed = urllib_parse.urlparse(raw)
        return parsed.hostname or "", parsed.port

    if raw.count(":") == 1 and raw.rsplit(":", 1)[1].isdigit():
        host, port = raw.rsplit(":", 1)
        return host, int(port)

    return raw, None


def _is_private_ipv4(hostname: str) -> bool:
    return (
        hostname.startswith("10.")
        or hostname.startswith("127.")
        or hostname.startswith("192.168.")
        or any(hostname.startswith(f"172.{prefix}.") for prefix in range(16, 32))
    )


def _is_local_host(hostname: str) -> bool:
    normalized = (hostname or "").strip().lower()
    return (
        normalized in {"localhost", "127.0.0.1", "::1"}
        or normalized.endswith(".local")
        or ("." not in normalized and not normalized.replace(":", "").isdigit())
    )


def _is_public_host(hostname: str) -> bool:
    normalized = (hostname or "").strip().lower()
    return bool(normalized) and not _is_local_host(normalized) and not _is_private_ipv4(normalized)


def _http_to_ws(url: str) -> str:
    normalized = _normalize_base_url(url)
    if normalized.startswith("https://"):
        return f"wss://{normalized.removeprefix('https://')}/ws"
    if normalized.startswith("http://"):
        return f"ws://{normalized.removeprefix('http://')}/ws"
    return f"{normalized}/ws"


def _build_base_url(scheme: str, hostname: str, port: int | None) -> str:
    normalized_scheme = "https" if scheme == "https" else "http"
    normalized_host = (hostname or "").strip()
    if not normalized_host:
        return ""
    effective_port = port if port is not None else config.PORT
    port_segment = "" if effective_port == _default_port(normalized_scheme) else f":{effective_port}"
    return f"{normalized_scheme}://{normalized_host}{port_segment}"


def _make_address(scope: str, url: str, source: str) -> ConnectionAddress | None:
    normalized = _normalize_base_url(url)
    if not normalized:
        return None
    return ConnectionAddress(
        scope=scope,
        label="LAN" if scope == "lan" else "Public / Tunnel",
        url=normalized,
        ws_url=_http_to_ws(normalized),
        source=source,
    )


def _dedupe_addresses(items: Iterable[ConnectionAddress]) -> list[ConnectionAddress]:
    seen: set[str] = set()
    deduped: list[ConnectionAddress] = []
    for item in items:
        key = f"{item.scope}:{item.url}"
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _discover_lan_hosts() -> list[str]:
    candidates: set[str] = set()

    explicit_host = (config.HOST or "").strip().lower()
    if explicit_host and explicit_host not in {"0.0.0.0", "::"}:
        if _is_private_ipv4(explicit_host) or explicit_host.endswith(".local"):
            candidates.add(explicit_host)

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            outbound_ip = sock.getsockname()[0]
            if _is_private_ipv4(outbound_ip):
                candidates.add(outbound_ip)
    except OSError:
        pass

    for host_candidate in {socket.gethostname(), socket.getfqdn()}:
        if not host_candidate:
            continue
        try:
            _, _, ips = socket.gethostbyname_ex(host_candidate)
        except OSError:
            continue
        for ip in ips:
            if _is_private_ipv4(ip):
                candidates.add(ip)

    return sorted(candidates)


def _discover_ngrok_urls() -> list[str]:
    if not config.NGROK_API_URL:
        return []

    try:
        with urllib_request.urlopen(config.NGROK_API_URL, timeout=1.2) as response:
            payload = json.load(response)
    except (urllib_error.URLError, TimeoutError, ValueError, OSError):
        return []

    urls: list[str] = []
    for tunnel in payload.get("tunnels", []) if isinstance(payload, dict) else []:
        if not isinstance(tunnel, dict):
            continue
        public_url = _normalize_base_url(str(tunnel.get("public_url", "")))
        if public_url.startswith("http://") or public_url.startswith("https://"):
            urls.append(public_url)
    return urls


def _extract_request_public_url(request: Request) -> str:
    forwarded_host = request.headers.get("x-forwarded-host", "")
    forwarded_proto = request.headers.get("x-forwarded-proto", "")
    host_value = forwarded_host.split(",", 1)[0].strip() or request.headers.get("host", "")
    scheme_value = forwarded_proto.split(",", 1)[0].strip().lower() or request.url.scheme or "http"
    hostname, port = _parse_host_port(host_value)
    if not _is_public_host(hostname):
        return ""
    return _build_base_url(scheme_value, hostname, port)


def build_connection_info(request: Request | None = None, mobile_connection_count: int = 0) -> dict:
    lan_urls = _dedupe_addresses(
        address
        for address in (
            _make_address("lan", _build_base_url("http", host, config.PORT), "lan_scan")
            for host in _discover_lan_hosts()
        )
        if address is not None
    )

    public_candidates: list[ConnectionAddress] = []
    configured_public = _normalize_base_url(config.PUBLIC_BASE_URL)
    if configured_public:
        address = _make_address("public", configured_public, "env_public_base_url")
        if address is not None:
            public_candidates.append(address)

    for detected_url in _discover_ngrok_urls():
        address = _make_address("public", detected_url, "ngrok_api")
        if address is not None:
            public_candidates.append(address)

    if request is not None:
        request_url = _extract_request_public_url(request)
        address = _make_address("public", request_url, "request_headers")
        if address is not None:
            public_candidates.append(address)

    public_urls = _dedupe_addresses(public_candidates)

    if public_urls:
        public_urls[0] = ConnectionAddress(**{**asdict(public_urls[0]), "recommended": True})
    elif lan_urls:
        lan_urls[0] = ConnectionAddress(**{**asdict(lan_urls[0]), "recommended": True})

    notes = [
        "Use a LAN URL when phone and computer are on the same Wi-Fi.",
        "Use a public URL when connecting over the internet through ngrok, cloudflared, or frp.",
    ]
    if not public_urls:
        notes.append("No public tunnel was detected. For a fixed cloudflared/frp domain, set PUBLIC_BASE_URL in backend/.env.")

    return {
        "host": config.HOST,
        "port": config.PORT,
        "api_base_path": "/api",
        "ws_base_path": "/ws",
        "health_path": "/api/health",
        "public_base_url": configured_public,
        "lan_urls": [asdict(address) for address in lan_urls],
        "public_urls": [asdict(address) for address in public_urls],
        "recommended_mobile_url": public_urls[0].url if public_urls else (lan_urls[0].url if lan_urls else ""),
        "recommended_mobile_ws_url": public_urls[0].ws_url if public_urls else (lan_urls[0].ws_url if lan_urls else ""),
        "mobile_connection_count": mobile_connection_count,
        "notes": notes,
    }
