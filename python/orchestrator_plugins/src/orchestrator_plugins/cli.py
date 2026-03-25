from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from orchestrator_plugins.runner import load_job_file, run_echo_gate


def main() -> None:
    p = argparse.ArgumentParser(prog="orch-plugin")
    sub = p.add_subparsers(dest="cmd", required=True)

    v = sub.add_parser("validate", help="Validate job file (JSON Schema when available)")
    v.add_argument("--job-file", required=True, type=Path)

    g = sub.add_parser("echo-gate", help="Run example echo gate")
    g.add_argument("--job-file", required=True, type=Path)

    args = p.parse_args()
    job = load_job_file(args.job_file)

    if args.cmd == "validate":
        schema_path = _find_schema()
        if schema_path is None:
            print("No schema found; performing minimal key check only", file=sys.stderr)
            _minimal_check(job)
            print(json.dumps({"ok": True, "mode": "minimal"}))
            return
        try:
            import jsonschema  # type: ignore

            schema = json.loads(schema_path.read_text(encoding="utf-8"))
            jsonschema.validate(instance=job, schema=schema)
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": str(e)}))
            sys.exit(1)
        print(json.dumps({"ok": True, "mode": "jsonschema"}))
        return

    if args.cmd == "echo-gate":
        r = run_echo_gate(job)
        print(json.dumps({"passed": r.passed, "gateId": r.gate_id, "message": r.message}))
        sys.exit(0 if r.passed else 1)


def _minimal_check(job: dict) -> None:
    for k in ("id", "status", "contractVersion", "createdAt", "updatedAt"):
        if k not in job:
            raise ValueError(f"missing field: {k}")


def _find_schema():
    here = Path(__file__).resolve()
    candidates = [
        here.parents[4] / "packages" / "core" / "dist" / "job-envelope.schema.json",
        here.parents[3] / "packages" / "core" / "dist" / "job-envelope.schema.json",
        Path.cwd() / "node_modules" / "@orch-os" / "core" / "dist" / "job-envelope.schema.json",
    ]
    for c in candidates:
        if c.is_file():
            return c
    return None


if __name__ == "__main__":
    main()
