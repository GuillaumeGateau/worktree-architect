from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Optional


@dataclass
class GateResult:
    gate_id: str
    passed: bool
    message: Optional[str] = None
    details: Optional[Mapping[str, Any]] = None


def run_echo_gate(job: Mapping[str, Any]) -> GateResult:
    """Example gate: always passes; echoes job id for smoke tests."""
    jid = str(job.get("id", ""))
    return GateResult(gate_id="echo", passed=True, message=f"ok:{jid}")


def run_shell_command(cmd: str, cwd: Optional[Path] = None) -> GateResult:
    """Run a shell command; pass if exit code 0."""
    proc = subprocess.run(
        cmd,
        shell=True,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=600,
    )
    ok = proc.returncode == 0
    return GateResult(
        gate_id="shell",
        passed=ok,
        message=("ok" if ok else f"exit {proc.returncode}"),
        details={
            "stdout": (proc.stdout or "")[-4000:],
            "stderr": (proc.stderr or "")[-4000:],
        },
    )


def load_job_file(path: Path) -> dict[str, Any]:
    data = path.read_text(encoding="utf-8")
    if path.suffix.lower() in {".yaml", ".yml"}:
        try:
            import yaml  # type: ignore

            obj = yaml.safe_load(data)
        except Exception as e:  # noqa: BLE001
            raise ValueError("PyYAML required for YAML job files") from e
    else:
        obj = json.loads(data)
    if not isinstance(obj, dict):
        raise ValueError("job file must be a JSON/YAML object")
    return obj
