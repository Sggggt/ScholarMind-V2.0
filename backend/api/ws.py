"""WebSocket 连接管理 — 向手机/桌面端推送实时进度"""

from typing import Optional, Dict, List
import json
from fastapi import WebSocket
from api.schemas import WSMessage


class ConnectionManager:
    """管理所有 WebSocket 连接"""

    def __init__(self):
        # task_id -> [websocket, ...]
        self._task_connections: Dict[str, List[WebSocket]] = {}
        # 全局订阅(接收所有任务消息)
        self._global_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket, task_id: Optional[str] = None):
        await websocket.accept()
        if task_id:
            self._task_connections.setdefault(task_id, []).append(websocket)
        else:
            self._global_connections.append(websocket)

    def disconnect(self, websocket: WebSocket, task_id: Optional[str] = None):
        if task_id and task_id in self._task_connections:
            conns = self._task_connections[task_id]
            if websocket in conns:
                conns.remove(websocket)
        if websocket in self._global_connections:
            self._global_connections.remove(websocket)

    async def send(self, msg: WSMessage):
        """发送消息给订阅了该任务的连接 + 全局连接"""
        payload = msg.model_dump_json()
        targets = list(self._global_connections)
        if msg.task_id in self._task_connections:
            targets += self._task_connections[msg.task_id]
        for ws in targets:
            try:
                await ws.send_text(payload)
            except Exception:
                pass  # 连接已断开，忽略

    async def broadcast(self, data: dict):
        """广播原始 dict"""
        payload = json.dumps(data, ensure_ascii=False)
        for ws in self._global_connections:
            try:
                await ws.send_text(payload)
            except Exception:
                pass


manager = ConnectionManager()
