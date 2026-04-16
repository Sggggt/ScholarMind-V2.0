from __future__ import annotations
"""Singleton Redis client for caching."""

import json
import logging
import time
from typing import Optional

import config

logger = logging.getLogger(__name__)

_redis: Optional[object] = None
_redis_init_attempted = False
_redis_warning_logged = False
_memory_cache: dict[str, tuple[float | None, str]] = {}


def _log_redis_warning_once(message: str, *args) -> None:
    global _redis_warning_logged
    if _redis_warning_logged:
        return
    logger.warning(message, *args)
    _redis_warning_logged = True


def _memory_purge_expired() -> None:
    now = time.time()
    expired = [key for key, (expires_at, _) in _memory_cache.items() if expires_at is not None and expires_at <= now]
    for key in expired:
        _memory_cache.pop(key, None)


def _get_redis():
    global _redis, _redis_init_attempted
    if _redis_init_attempted:
        return _redis
    _redis_init_attempted = True

    url = config.REDIS_URL
    if not url:
        return None

    try:
        import redis.asyncio as aioredis
        _redis = aioredis.from_url(url, decode_responses=True)
        logger.info("[Redis] Connected to %s", url.split("@")[-1] if "@" in url else url)
    except Exception as exc:
        _log_redis_warning_once("[Redis] Connection failed, using in-memory cache fallback: %s", exc)
        _redis = None

    return _redis


async def get_cache(key: str) -> Optional[str]:
    client = _get_redis()
    if client is not None:
        try:
            return await client.get(key)
        except Exception:
            pass

    _memory_purge_expired()
    entry = _memory_cache.get(key)
    return entry[1] if entry is not None else None


async def set_cache(key: str, value: str, ttl: int = 120) -> None:
    client = _get_redis()
    if client is not None:
        try:
            await client.setex(key, ttl, value)
            return
        except Exception:
            pass

    expires_at = time.time() + ttl if ttl and ttl > 0 else None
    _memory_cache[key] = (expires_at, value)


async def delete_cache(*keys: str) -> None:
    client = _get_redis()
    if client is not None:
        try:
            await client.delete(*keys)
        except Exception:
            pass

    for key in keys:
        _memory_cache.pop(key, None)


async def get_json(key: str) -> Optional[object]:
    raw = await get_cache(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


async def set_json(key: str, value: object, ttl: int = 120) -> None:
    await set_cache(key, json.dumps(value, ensure_ascii=False), ttl)


async def close_redis() -> None:
    global _redis, _redis_init_attempted
    if _redis is not None:
        try:
            await _redis.aclose()
        except Exception:
            pass
        _redis = None
        logger.info("[Redis] Connection closed")
    _redis_init_attempted = False
