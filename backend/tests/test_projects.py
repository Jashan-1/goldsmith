from collections.abc import Callable

from fastapi.testclient import TestClient

from goldsmith.models import User

ClientAs = Callable[[User], TestClient]
MakeUser = Callable[[str], User]


def test_create_list_get_patch(client_as: ClientAs, make_user: MakeUser) -> None:
    client = client_as(make_user("a@example.com"))

    res = client.post("/api/projects", json={"name": "Support bot", "task_type": "qa"})
    assert res.status_code == 201
    project = res.json()
    assert project["review_threshold"] == 0.5
    assert project["status"] == "draft"

    assert [p["id"] for p in client.get("/api/projects").json()] == [project["id"]]
    assert client.get(f"/api/projects/{project['id']}").json()["name"] == "Support bot"

    res = client.patch(f"/api/projects/{project['id']}", json={"review_threshold": 0.7})
    assert res.json()["review_threshold"] == 0.7
    assert res.json()["name"] == "Support bot"
    assert res.json()["updated_at"] >= project["updated_at"]


def test_validation(client_as: ClientAs, make_user: MakeUser) -> None:
    client = client_as(make_user("a@example.com"))
    assert client.post("/api/projects", json={"name": "x", "task_type": "nope"}).status_code == 422
    assert client.post("/api/projects", json={"name": "", "task_type": "qa"}).status_code == 422
    pid = client.post("/api/projects", json={"name": "x", "task_type": "qa"}).json()["id"]
    assert client.patch(f"/api/projects/{pid}", json={"review_threshold": 1.5}).status_code == 422


def test_users_cannot_see_each_others_projects(client_as: ClientAs, make_user: MakeUser) -> None:
    alice = client_as(make_user("alice@example.com"))
    bob = client_as(make_user("bob@example.com"))
    pid = alice.post("/api/projects", json={"name": "Alice's", "task_type": "chat"}).json()["id"]

    assert bob.get("/api/projects").json() == []
    assert bob.get(f"/api/projects/{pid}").status_code == 404
    assert bob.patch(f"/api/projects/{pid}", json={"name": "pwned"}).status_code == 404
    assert alice.get(f"/api/projects/{pid}").json()["name"] == "Alice's"
