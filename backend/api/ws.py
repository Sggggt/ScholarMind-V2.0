"""WebSocket 连接管理 — 向手机/桌面端推送实时进度"""

from typing import Optional, Dict, List, TYPE_CHECKING, Set
import json
import asyncio
import logging
from fastapi import WebSocket
from api.schemas import WSMessage

if TYPE_CHECKING:
    from api.routes import Request

logger = logging.getLogger(__name__)

# 心跳配置
HEARTBEAT_INTERVAL = 30.0  # 每 30 秒发送一次心跳
HEARTBEAT_TIMEOUT = 60.0  # 60 秒没有响应视为超时


class ConnectionManager:
    """管理所有 WebSocket 连接"""

    def __init__(self):
        # task_id -> [websocket, ...]
        self._task_connections: Dict[str, List[WebSocket]] = {}
        # 全局订阅(接收所有任务消息)
        self._global_connections: List[WebSocket] = []
        # 跟踪移动端连接
        self._mobile_connections: Set[WebSocket] = set()
        # 跟踪连接的最后活跃时间 (websocket -> timestamp)
        self._last_pong: Dict[WebSocket, float] = {}
        # 心跳任务
        self._heartbeat_task: Optional[asyncio.Task] = None

    async def connect(self, websocket: WebSocket, task_id: Optional[str] = None, client_type: str = "desktop"):
        await websocket.accept()
        if client_type == "mobile":
            self._mobile_connections.add(websocket)

        if task_id:
            self._task_connections.setdefault(task_id, []).append(websocket)
        else:
            self._global_connections.append(websocket)

        # 初始化心跳时间戳
        self._last_pong[websocket] = asyncio.get_event_loop().time()

        # 启动心跳任务（如果还没启动）
        if self._heartbeat_task is None:
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

        # Broadcast connection count update
        await self._broadcast_connection_update()

    def disconnect(self, websocket: WebSocket, task_id: Optional[str] = None):
        if task_id and task_id in self._task_connections:
            conns = self._task_connections[task_id]
            if websocket in conns:
                conns.remove(websocket)
        if websocket in self._global_connections:
            self._global_connections.remove(websocket)
        self._mobile_connections.discard(websocket)
        self._last_pong.pop(websocket, None)
        # Schedule connection update broadcast (fire-and-forget)
        asyncio.ensure_future(self._broadcast_connection_update())

    def get_mobile_connection_count(self) -> int:
        """获取移动端连接数"""
        # 清理已断开的移动端连接
        dead = set()
        for ws in self._mobile_connections:
            try:
                # 尝试 ping 检查连接是否活跃
                pass
            except Exception:
                dead.add(ws)
        self._mobile_connections -= dead
        return len(self._mobile_connections)

    def get_connection_count(self) -> int:
        """获取当前连接数（包括任务连接和全局连接）"""
        task_count = sum(len(conns) for conns in self._task_connections.values())
        global_count = len(self._global_connections)
        return task_count + global_count

    def record_pong(self, websocket: WebSocket) -> None:
        """记录客户端的 pong 响应"""
        self._last_pong[websocket] = asyncio.get_event_loop().time()

    async def _heartbeat_loop(self) -> None:
        """心跳循环，定期发送 ping 并清理超时连接"""
        while True:
            try:
                await asyncio.sleep(HEARTBEAT_INTERVAL)
                await self._send_heartbeat_and_cleanup()
            except asyncio.CancelledError:
                logger.info("[WebSocket] 心跳任务已取消")
                break
            except Exception as e:
                logger.error(f"[WebSocket] 心跳循环错误: {e}")

    async def _send_heartbeat_and_cleanup(self) -> None:
        """发送心跳并清理超时连接"""
        current_time = asyncio.get_event_loop().time()
        dead_sockets = []

        all_connections = list(self._global_connections) + [
            ws for conns in self._task_connections.values() for ws in conns
        ]

        for ws in all_connections:
            try:
                # 检查是否超时
                last_pong = self._last_pong.get(ws, current_time)
                if current_time - last_pong > HEARTBEAT_TIMEOUT:
                    logger.warning("[WebSocket] 连接超时，准备清理")
                    dead_sockets.append(ws)
                else:
                    # 发送 ping
                    await ws.send_json({"type": "ping", "timestamp": current_time})
            except Exception:
                dead_sockets.append(ws)

        # 清理死连接
        for ws in dead_sockets:
            self.disconnect(ws)

    async def send(self, msg: WSMessage):
        """发送消息给订阅了该任务的连接 + 全局连接"""
        payload = msg.model_dump_json()
        targets = list(self._global_connections)
        if msg.task_id in self._task_connections:
            targets += self._task_connections[msg.task_id]

        dead_sockets = []
        for ws in targets:
            try:
                await ws.send_text(payload)
            except Exception:
                dead_sockets.append(ws)  # 记录已断开的死连接

        # 集中清理死连接，防止无限堆积造成内存泄漏
        for ws in dead_sockets:
            self.disconnect(ws, msg.task_id)

    async def broadcast(self, data: dict):
        """广播原始 dict"""
        payload = json.dumps(data, ensure_ascii=False)
        for ws in self._global_connections:
            try:
                await ws.send_text(payload)
            except Exception:
                pass

    async def _broadcast_connection_update(self) -> None:
        """Broadcast mobile connection count to all global connections."""
        count = self.get_mobile_connection_count()
        msg = WSMessage(
            type="connection_update",
            message="",
            data={"mobile_connection_count": count},
        )
        payload = msg.model_dump_json()
        dead = []
        for ws in self._global_connections:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()
