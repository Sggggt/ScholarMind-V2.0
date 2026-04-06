"""ScholarMind device discovery module."""

from .identity import DeviceIdentity
from .mdns_publisher import MdnsServicePublisher

__all__ = ["DeviceIdentity", "MdnsServicePublisher"]
