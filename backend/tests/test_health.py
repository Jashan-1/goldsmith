from fastapi.testclient import TestClient

from goldsmith.main import create_app


def test_health() -> None:
    res = TestClient(create_app()).get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
