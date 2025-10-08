# api/app/realtime.py
from typing import Dict, Set, Any
from fastapi import WebSocket
from collections import defaultdict
import json
import asyncio

class ThreadHub:
    def __init__(self):
        # thread_id -> set(WebSocket)
        self.rooms: Dict[str, Set[WebSocket]] = defaultdict(set)
        self.lock = asyncio.Lock()

    async def connect(self, thread_id: str, ws: WebSocket):
        await ws.accept()
        async with self.lock:
            self.rooms[thread_id].add(ws)

    async def disconnect(self, thread_id: str, ws: WebSocket):
        async with self.lock:
            if ws in self.rooms.get(thread_id, set()):
                self.rooms[thread_id].remove(ws)

    async def broadcast(self, thread_id: str, event: dict[str, Any]):
        # remove sockets quebrados
        dead = []
        data = json.dumps(event, ensure_ascii=False)
        for ws in list(self.rooms.get(thread_id, set())):
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        if dead:
            async with self.lock:
                for ws in dead:
                    self.rooms[thread_id].discard(ws)

hub = ThreadHub()
