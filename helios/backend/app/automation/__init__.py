"""Automation module.

V1 keeps the scheduler in-process (same pattern as the task reminder worker):
a background poller looks for automations whose ``next_run_at`` has passed,
evaluates a simple condition, runs an action built from existing tools, and
posts the result into the single chat timeline as an assistant message.
"""

from .actions import execute_action

__all__ = ["execute_action"]
