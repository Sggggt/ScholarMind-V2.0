from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from api.schemas import WSMessage
from api.ws import manager
from db.database import async_session
from db.models import AgentEvent, AgentRun, AgentTask
from services.redis_service import delete_cache

ROOT_AGENT_KEY = "root-coordinator"
ROOT_ROLE = "coordinator"
FIXED_WORKER_ROLES = (
    "code-worker",
    "env-worker",
    "dataset-worker",
    "baseline-worker",
    "experiment-worker",
    "summary-worker",
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None) -> str:
    if not value:
        return ""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


@dataclass(slots=True)
class AgentSnapshot:
    active_cycle: dict[str, Any]
    root_agent: dict[str, Any]
    child_agents: list[dict[str, Any]]
    recent_summary: dict[str, Any]
    recent_events: list[dict[str, Any]]

    def as_dict(self) -> dict[str, Any]:
        return {
            "active_cycle": self.active_cycle,
            "root_agent": self.root_agent,
            "child_agents": self.child_agents,
            "recent_summary": self.recent_summary,
            "recent_events": self.recent_events,
        }


class AgentRuntime:
    def __init__(self, task_id: str):
        self.task_id = task_id

    async def ensure_cycle(self, *, project_dir: str = "", phase: str = "m4") -> AgentRun:
        async with async_session() as db:
            run = await self._ensure_cycle_in_session(db, project_dir=project_dir, phase=phase)
            return run

    async def begin_phase(
        self,
        *,
        module: int,
        phase: str,
        project_dir: str = "",
        root_message: str = "",
        root_payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        async with async_session() as db:
            run = await self._ensure_cycle_in_session(db, project_dir=project_dir, phase=phase)
            run.phase = phase
            run.status = "running"
            if project_dir:
                run.project_dir = project_dir
            if root_message:
                run.root_decision = {
                    "module": module,
                    "phase": phase,
                    "message": root_message,
                    "payload": root_payload or {},
                    "updated_at": _iso(_utcnow()),
                }
                root = await self._get_root_in_session(db, run.id)
                root.status = "running"
                root.phase = phase
                root.last_message = root_message
                root.summary = run.root_decision
                await self._create_event_in_session(
                    db,
                    run=run,
                    agent=root,
                    module=module,
                    phase=phase,
                    kind="decision",
                    message=root_message,
                    payload=root_payload or {},
                )
            await db.commit()
            snapshot = await self._build_snapshot_in_session(db, run.id)
        await self._broadcast_tree(snapshot)
        return snapshot

    async def update_root_decision(
        self,
        *,
        module: int,
        phase: str,
        message: str,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return await self.begin_phase(
            module=module,
            phase=phase,
            root_message=message,
            root_payload=payload,
        )

    async def start_worker(
        self,
        *,
        role: str,
        module: int,
        phase: str,
        message: str,
        ownership: dict[str, Any] | None = None,
        parent_role: str | None = None,
        specialist_key: str | None = None,
    ) -> dict[str, Any]:
        async with async_session() as db:
            run = await self._ensure_cycle_in_session(db, phase=phase)
            agent = await self._ensure_agent_in_session(
                db,
                run=run,
                role=role,
                phase=phase,
                parent_role=parent_role,
                specialist_key=specialist_key,
            )
            agent.status = "running"
            agent.phase = phase
            agent.last_message = message
            if ownership is not None:
                agent.ownership = ownership
            await self._create_event_in_session(
                db,
                run=run,
                agent=agent,
                module=module,
                phase=phase,
                kind="worker_start",
                message=message,
                payload={"ownership": ownership or {}},
            )
            await db.commit()
            snapshot = await self._build_snapshot_in_session(db, run.id)
        await self._broadcast_event("agent_event", message, snapshot, module=module)
        return snapshot

    async def complete_worker(
        self,
        *,
        role: str,
        module: int,
        phase: str,
        message: str,
        summary: dict[str, Any] | None = None,
        artifact_refs: dict[str, Any] | None = None,
        parent_role: str | None = None,
        specialist_key: str | None = None,
    ) -> dict[str, Any]:
        return await self._finish_worker(
            role=role,
            module=module,
            phase=phase,
            status="completed",
            message=message,
            summary=summary,
            artifact_refs=artifact_refs,
            parent_role=parent_role,
            specialist_key=specialist_key,
        )

    async def skip_worker(
        self,
        *,
        role: str,
        module: int,
        phase: str,
        message: str,
        summary: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return await self._finish_worker(
            role=role,
            module=module,
            phase=phase,
            status="skipped",
            message=message,
            summary=summary,
        )

    async def fail_worker(
        self,
        *,
        role: str,
        module: int,
        phase: str,
        message: str,
        error_fingerprint: str = "",
        summary: dict[str, Any] | None = None,
        parent_role: str | None = None,
        specialist_key: str | None = None,
    ) -> dict[str, Any]:
        return await self._finish_worker(
            role=role,
            module=module,
            phase=phase,
            status="failed",
            message=message,
            summary=summary,
            error_fingerprint=error_fingerprint,
            parent_role=parent_role,
            specialist_key=specialist_key,
        )

    async def record_summary(
        self,
        *,
        module: int,
        phase: str,
        message: str,
        summary: dict[str, Any],
        artifact_refs: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        async with async_session() as db:
            run = await self._ensure_cycle_in_session(db, phase=phase)
            summary_agent = await self._ensure_agent_in_session(db, run=run, role="summary-worker", phase=phase)
            summary_agent.status = "completed"
            summary_agent.phase = phase
            summary_agent.last_message = message
            summary_agent.summary = summary
            summary_agent.artifact_refs = artifact_refs or {}
            run.latest_summary = {
                "module": module,
                "phase": phase,
                "message": message,
                "summary": summary,
                "artifact_refs": artifact_refs or {},
                "updated_at": _iso(_utcnow()),
            }
            await self._create_event_in_session(
                db,
                run=run,
                agent=summary_agent,
                module=module,
                phase=phase,
                kind="summary",
                message=message,
                payload=run.latest_summary,
            )
            await db.commit()
            snapshot = await self._build_snapshot_in_session(db, run.id)
        await self._broadcast_summary(snapshot, module=module)
        return snapshot

    async def log_event(
        self,
        *,
        module: int,
        phase: str,
        kind: str,
        message: str,
        payload: dict[str, Any] | None = None,
        role: str | None = None,
    ) -> dict[str, Any]:
        async with async_session() as db:
            run = await self._ensure_cycle_in_session(db, phase=phase)
            agent = None
            if role:
                agent = await self._ensure_agent_in_session(db, run=run, role=role, phase=phase)
            await self._create_event_in_session(
                db,
                run=run,
                agent=agent,
                module=module,
                phase=phase,
                kind=kind,
                message=message,
                payload=payload or {},
            )
            await db.commit()
            snapshot = await self._build_snapshot_in_session(db, run.id)
        await self._broadcast_event("agent_event", message, snapshot, module=module)
        return snapshot

    async def rollback(self, *, module: int, phase: str, reason: str) -> dict[str, Any]:
        async with async_session() as db:
            run = await self._ensure_cycle_in_session(db, phase=phase)
            run.cycle_revision += 1
            run.phase = "m4"
            run.status = "running"
            root = await self._get_root_in_session(db, run.id)
            root.status = "running"
            root.phase = "m4"
            root.last_message = reason
            root.summary = {
                "action": "rollback",
                "reason": reason,
                "to_phase": "m4",
                "cycle_revision": run.cycle_revision,
            }
            workers = await self._get_run_agents_in_session(db, run.id)
            for worker in workers:
                if worker.id == root.id:
                    continue
                worker.status = "pending"
                worker.phase = "m4"
                worker.last_message = ""
                worker.error_fingerprint = ""
            await self._create_event_in_session(
                db,
                run=run,
                agent=root,
                module=module,
                phase=phase,
                kind="rollback",
                message=reason,
                payload={"cycle_revision": run.cycle_revision, "to_phase": "m4"},
            )
            await db.commit()
            snapshot = await self._build_snapshot_in_session(db, run.id)
        await self._broadcast_event("agent_event", reason, snapshot, module=module)
        return snapshot

    async def mark_cycle_complete(self, *, status: str, phase: str, module: int, message: str) -> dict[str, Any]:
        async with async_session() as db:
            run = await self._ensure_cycle_in_session(db, phase=phase)
            run.status = status
            root = await self._get_root_in_session(db, run.id)
            root.status = "completed" if status == "completed" else status
            root.last_message = message
            await self._create_event_in_session(
                db,
                run=run,
                agent=root,
                module=module,
                phase=phase,
                kind="cycle_status",
                message=message,
                payload={"status": status},
            )
            await db.commit()
            snapshot = await self._build_snapshot_in_session(db, run.id)
        await self._broadcast_tree(snapshot)
        return snapshot

    async def get_snapshot(self) -> dict[str, Any] | None:
        return await get_task_agent_snapshot(self.task_id)

    async def _finish_worker(
        self,
        *,
        role: str,
        module: int,
        phase: str,
        status: str,
        message: str,
        summary: dict[str, Any] | None = None,
        artifact_refs: dict[str, Any] | None = None,
        error_fingerprint: str = "",
        parent_role: str | None = None,
        specialist_key: str | None = None,
    ) -> dict[str, Any]:
        async with async_session() as db:
            run = await self._ensure_cycle_in_session(db, phase=phase)
            agent = await self._ensure_agent_in_session(
                db,
                run=run,
                role=role,
                phase=phase,
                parent_role=parent_role,
                specialist_key=specialist_key,
            )
            agent.status = status
            agent.phase = phase
            agent.last_message = message
            if summary is not None:
                agent.summary = summary
            if artifact_refs is not None:
                agent.artifact_refs = artifact_refs
            if error_fingerprint:
                agent.error_fingerprint = error_fingerprint
            await self._create_event_in_session(
                db,
                run=run,
                agent=agent,
                module=module,
                phase=phase,
                kind=f"worker_{status}",
                message=message,
                payload={
                    "summary": summary or {},
                    "artifact_refs": artifact_refs or {},
                    "error_fingerprint": error_fingerprint,
                },
            )
            await db.commit()
            snapshot = await self._build_snapshot_in_session(db, run.id)
        await self._broadcast_event("agent_event", message, snapshot, module=module)
        return snapshot

    async def _ensure_cycle_in_session(self, db, *, project_dir: str = "", phase: str = "m4") -> AgentRun:
        stmt = (
            select(AgentRun)
            .where(AgentRun.task_id == self.task_id)
            .order_by(AgentRun.id.desc())
            .limit(1)
        )
        run = (await db.execute(stmt)).scalar_one_or_none()
        if run is None:
            run = AgentRun(
                task_id=self.task_id,
                cycle_key=f"{self.task_id}-cycle",
                cycle_revision=1,
                phase=phase,
                status="running",
                project_dir=project_dir,
            )
            db.add(run)
            await db.flush()
            root = AgentTask(
                run_id=run.id,
                task_id=self.task_id,
                agent_key=ROOT_AGENT_KEY,
                role=ROOT_ROLE,
                phase=phase,
                status="running",
                ownership={"responsibility": "decision_and_dispatch"},
            )
            db.add(root)
            await db.flush()
            run.active_root_agent_id = root.id
            for role in FIXED_WORKER_ROLES:
                db.add(
                    AgentTask(
                        run_id=run.id,
                        task_id=self.task_id,
                        agent_key=role,
                        parent_id=root.id,
                        role=role,
                        phase=phase,
                        status="pending",
                        ownership={"responsibility": role},
                    )
                )
            await db.flush()
            await self._create_event_in_session(
                db,
                run=run,
                agent=root,
                module=4,
                phase=phase,
                kind="bootstrap",
                message="Initialized multi-agent cycle",
                payload={"cycle_revision": run.cycle_revision},
            )
        else:
            if project_dir:
                run.project_dir = project_dir
            if phase:
                run.phase = phase
            run.updated_at = _utcnow()
            await self._ensure_fixed_workers_in_session(db, run)
        return run

    async def _ensure_fixed_workers_in_session(self, db, run: AgentRun) -> None:
        root = await self._get_root_in_session(db, run.id)
        stmt = select(AgentTask).where(AgentTask.run_id == run.id)
        existing = (await db.execute(stmt)).scalars().all()
        existing_keys = {agent.agent_key for agent in existing}
        for role in FIXED_WORKER_ROLES:
            if role in existing_keys:
                continue
            db.add(
                AgentTask(
                    run_id=run.id,
                    task_id=self.task_id,
                    agent_key=role,
                    parent_id=root.id,
                    role=role,
                    phase=run.phase,
                    status="pending",
                    ownership={"responsibility": role},
                )
            )
        await db.flush()

    async def _get_root_in_session(self, db, run_id: int) -> AgentTask:
        stmt = (
            select(AgentTask)
            .where(AgentTask.run_id == run_id, AgentTask.agent_key == ROOT_AGENT_KEY)
            .limit(1)
        )
        root = (await db.execute(stmt)).scalar_one()
        return root

    async def _ensure_agent_in_session(
        self,
        db,
        *,
        run: AgentRun,
        role: str,
        phase: str,
        parent_role: str | None = None,
        specialist_key: str | None = None,
    ) -> AgentTask:
        if role == ROOT_ROLE:
            return await self._get_root_in_session(db, run.id)

        agent_key = specialist_key.strip() if specialist_key else role
        stmt = (
            select(AgentTask)
            .where(AgentTask.run_id == run.id, AgentTask.agent_key == agent_key)
            .limit(1)
        )
        agent = (await db.execute(stmt)).scalar_one_or_none()
        if agent is not None:
            return agent

        parent_id = None
        if parent_role:
            parent_stmt = (
                select(AgentTask)
                .where(AgentTask.run_id == run.id, AgentTask.role == parent_role)
                .limit(1)
            )
            parent = (await db.execute(parent_stmt)).scalar_one_or_none()
            parent_id = parent.id if parent else None
        if parent_id is None:
            parent_id = (await self._get_root_in_session(db, run.id)).id

        agent = AgentTask(
            run_id=run.id,
            task_id=self.task_id,
            agent_key=agent_key,
            parent_id=parent_id,
            role=role,
            phase=phase,
            status="pending",
            ownership={"responsibility": role},
        )
        db.add(agent)
        await db.flush()
        return agent

    async def _get_run_agents_in_session(self, db, run_id: int) -> list[AgentTask]:
        stmt = select(AgentTask).where(AgentTask.run_id == run_id).order_by(AgentTask.id.asc())
        return list((await db.execute(stmt)).scalars().all())

    async def _create_event_in_session(
        self,
        db,
        *,
        run: AgentRun,
        agent: AgentTask | None,
        module: int,
        phase: str,
        kind: str,
        message: str,
        payload: dict[str, Any],
        level: str = "info",
    ) -> AgentEvent:
        event = AgentEvent(
            run_id=run.id,
            task_id=self.task_id,
            agent_task_id=agent.id if agent else None,
            module=module,
            phase=phase,
            kind=kind,
            level=level,
            message=message,
            payload=payload,
        )
        db.add(event)
        await db.flush()
        return event

    async def _build_snapshot_in_session(self, db, run_id: int) -> dict[str, Any]:
        run = await db.get(AgentRun, run_id)
        agents = await self._get_run_agents_in_session(db, run_id)
        root = next((agent for agent in agents if agent.agent_key == ROOT_AGENT_KEY), None)
        children = [agent for agent in agents if root and agent.parent_id == root.id]
        event_stmt = (
            select(AgentEvent)
            .where(AgentEvent.run_id == run_id)
            .order_by(AgentEvent.id.desc())
            .limit(10)
        )
        recent_events = list((await db.execute(event_stmt)).scalars().all())
        snapshot = AgentSnapshot(
            active_cycle={
                "id": run.id,
                "cycle_key": run.cycle_key,
                "cycle_revision": run.cycle_revision,
                "phase": run.phase,
                "status": run.status,
                "project_dir": run.project_dir,
                "updated_at": _iso(run.updated_at),
            },
            root_agent=self._serialize_agent(root),
            child_agents=[self._serialize_agent(agent) for agent in children],
            recent_summary=run.latest_summary or {},
            recent_events=[self._serialize_event(event) for event in recent_events],
        )
        return snapshot.as_dict()

    def _serialize_agent(self, agent: AgentTask | None) -> dict[str, Any]:
        if agent is None:
            return {}
        return {
            "id": agent.id,
            "agent_key": agent.agent_key,
            "parent_id": agent.parent_id,
            "role": agent.role,
            "phase": agent.phase,
            "status": agent.status,
            "ownership": agent.ownership or {},
            "summary": agent.summary or {},
            "artifact_refs": agent.artifact_refs or {},
            "error_fingerprint": agent.error_fingerprint or "",
            "last_message": agent.last_message or "",
            "updated_at": _iso(agent.updated_at),
        }

    def _serialize_event(self, event: AgentEvent) -> dict[str, Any]:
        return {
            "id": event.id,
            "agent_task_id": event.agent_task_id,
            "module": event.module,
            "phase": event.phase,
            "kind": event.kind,
            "level": event.level,
            "message": event.message,
            "payload": event.payload or {},
            "created_at": _iso(event.created_at),
        }

    async def _broadcast_tree(self, snapshot: dict[str, Any]) -> None:
        await delete_cache(f"task:{self.task_id}", "tasks:list:all")
        await manager.send(
            WSMessage(
                type="agent_tree",
                task_id=self.task_id,
                module=self._module_from_phase(snapshot.get("active_cycle", {}).get("phase")),
                message="Agent tree updated",
                timestamp=_iso(_utcnow()),
                data=snapshot,
            )
        )

    async def _broadcast_event(self, msg_type: str, message: str, snapshot: dict[str, Any], *, module: int) -> None:
        await delete_cache(f"task:{self.task_id}", "tasks:list:all")
        await manager.send(
            WSMessage(
                type=msg_type,
                task_id=self.task_id,
                module=f"M{module}",
                message=message,
                timestamp=_iso(_utcnow()),
                data=snapshot,
            )
        )

    async def _broadcast_summary(self, snapshot: dict[str, Any], *, module: int) -> None:
        await delete_cache(f"task:{self.task_id}", "tasks:list:all")
        summary = snapshot.get("recent_summary", {})
        await manager.send(
            WSMessage(
                type="agent_summary",
                task_id=self.task_id,
                module=f"M{module}",
                message=str(summary.get("message") or "Agent summary updated"),
                timestamp=_iso(_utcnow()),
                data=snapshot,
            )
        )

    def _module_from_phase(self, phase: str | None) -> str:
        mapping = {"m4": "M4", "m5": "M5", "m6": "M6"}
        return mapping.get((phase or "").lower(), "M4")


async def get_task_agent_snapshot(task_id: str) -> dict[str, Any] | None:
    async with async_session() as db:
        stmt = (
            select(AgentRun)
            .where(AgentRun.task_id == task_id)
            .order_by(AgentRun.id.desc())
            .limit(1)
        )
        run = (await db.execute(stmt)).scalar_one_or_none()
        if run is None:
            return None
        runtime = AgentRuntime(task_id)
        return await runtime._build_snapshot_in_session(db, run.id)


def summarize_error_fingerprint(error_text: str) -> str:
    text = (error_text or "").strip()
    if not text:
        return ""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    head = lines[-1] if lines else text
    return head[:240]


def compact_summary(data: dict[str, Any] | None) -> str:
    if not data:
        return ""
    try:
        text = json.dumps(data, ensure_ascii=False, sort_keys=True)
    except TypeError:
        text = str(data)
    return text[:1000]
