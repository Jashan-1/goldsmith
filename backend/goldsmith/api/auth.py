from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from goldsmith.api.deps import current_user
from goldsmith.config import settings
from goldsmith.db import get_db
from goldsmith.models import User
from goldsmith.schemas import UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])

oauth = OAuth()
oauth.register(
    "google",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


def _sign_in(request: Request, db: Session, *, sub: str, email: str, name: str) -> Response:
    user = db.scalar(select(User).where(User.google_sub == sub))
    if user is None:
        user = User(google_sub=sub, email=email, name=name)
        db.add(user)
    else:
        user.email, user.name = email, name
    db.commit()
    request.session.clear()  # drops leftover OAuth state
    request.session["user_id"] = str(user.id)
    return RedirectResponse(settings.frontend_url)


@router.get("/google/login")
async def login(request: Request, db: Session = Depends(get_db)) -> Response:
    if settings.dev_auth_bypass:
        return _sign_in(request, db, sub="dev-user", email="dev@localhost", name="Dev User")
    if not settings.google_client_id:
        raise HTTPException(
            503, "Google sign-in isn't configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
        )
    # Callback goes through the frontend origin so the session cookie lands there.
    redirect_uri = f"{settings.frontend_url}/api/auth/google/callback"
    response: Response = await oauth.google.authorize_redirect(request, redirect_uri)
    return response


@router.get("/google/callback")
async def callback(request: Request, db: Session = Depends(get_db)) -> Response:
    try:
        token = await oauth.google.authorize_access_token(request)
    except OAuthError as e:
        raise HTTPException(400, "Google sign-in failed. Please try again.") from e
    info = token["userinfo"]
    return _sign_in(request, db, sub=info["sub"], email=info["email"], name=info.get("name", ""))


@router.post("/logout", status_code=204)
def logout(request: Request) -> None:
    request.session.clear()


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> User:
    return user
