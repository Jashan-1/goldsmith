from fastapi.testclient import TestClient

from goldsmith.core.rules import assign_rule_ids
from tests.helpers import new_project


def test_assign_rule_ids_keeps_existing_and_fills_gaps():
    rules = [{"id": "r3", "text": "a"}, {"text": "b"}, {"id": None, "text": "c"}, {"id": "x"}]
    assert [r["id"] for r in assign_rule_ids(rules)] == ["r3", "r4", "r5", "x"]


def test_rules_are_versioned(client: TestClient):
    url = f"/api/projects/{new_project(client)}/rules"
    assert client.get(url).json() == {"version": 0, "rules": []}

    v1 = client.put(url, json={"rules": [{"text": "Be polite", "kind": "rubric"}]}).json()
    assert v1["version"] == 1
    assert v1["rules"] == [{"id": "r1", "text": "Be polite", "kind": "rubric"}]

    # Same content again: no new version.
    assert client.put(url, json={"rules": v1["rules"]}).json()["version"] == 1

    rules = [*v1["rules"], {"text": "Never give medical dosing", "kind": "guardrail"}]
    v2 = client.put(url, json={"rules": rules}).json()
    assert v2["version"] == 2
    assert [r["id"] for r in v2["rules"]] == ["r1", "r2"]
    assert client.get(url).json() == v2

    assert client.put(url, json={"rules": []}).json() == {"version": 3, "rules": []}


def test_rules_validation(client: TestClient):
    url = f"/api/projects/{new_project(client)}/rules"
    assert client.put(url, json={"rules": [{"text": "", "kind": "rubric"}]}).status_code == 422
    assert client.put(url, json={"rules": [{"text": "x", "kind": "vibe"}]}).status_code == 422
    dup = [{"id": "r1", "text": "a", "kind": "rubric"}, {"id": "r1", "text": "b", "kind": "rubric"}]
    assert client.put(url, json={"rules": dup}).status_code == 422


def test_rules_are_private(client: TestClient, client_as, make_user):
    url = f"/api/projects/{new_project(client)}/rules"
    bob = client_as(make_user("bob@example.com"))
    assert bob.get(url).status_code == 404
    assert bob.put(url, json={"rules": []}).status_code == 404
