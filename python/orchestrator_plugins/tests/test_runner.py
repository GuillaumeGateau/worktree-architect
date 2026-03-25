from orchestrator_plugins.runner import run_echo_gate


def test_echo_gate():
    r = run_echo_gate({"id": "abc"})
    assert r.passed
    assert "abc" in (r.message or "")
