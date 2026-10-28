import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import User
from app.db.session import get_db

bearer_scheme = HTTPBearer(auto_error=False)
_jwks_client: PyJWKClient | None = None


def get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(get_settings().clerk_jwks_url)
    return _jwks_client


def verify_token(token: str, jwks: PyJWKClient) -> dict[str, object]:
    signing_key = jwks.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        issuer=get_settings().clerk_issuer,
        leeway=10,
        options={"require": ["exp", "iat", "sub"]},
    )


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
    jwks: PyJWKClient = Depends(get_jwks_client),
) -> User:
    if credentials is None:
        raise _unauthorized()
    try:
        claims = verify_token(credentials.credentials, jwks)
    except jwt.PyJWTError:
        raise _unauthorized() from None  # never reveal why validation failed

    auth_id = str(claims["sub"])
    user = db.scalar(select(User).where(User.auth_id == auth_id))
    if user is None:
        user = User(auth_id=auth_id)
        db.add(user)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            user = db.scalar(select(User).where(User.auth_id == auth_id))
            assert user is not None
    return user
