"""App-user accounts: signup / login / me (JWT + role). Distinct from the DStv
session endpoints under /api/auth."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import get_current_user
from app.db import get_db
from app.models.accounts import AccountPublic, LoginRequest, SignupRequest, TokenResponse
from app.models.user import User
from app.services.accounts import to_public
from app.services.security import create_access_token, hash_password, verify_password

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/accounts", tags=["accounts"])


def _token_response(user: User) -> TokenResponse:
    token = create_access_token(subject=str(user.id), role=user.role)
    return TokenResponse(access_token=token, user=to_public(user))


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    email = body.email.strip().lower()
    if "@" not in email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_EMAIL", "message": "Enter a valid email address."},
        )
    existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "EMAIL_TAKEN", "message": "An account with this email already exists."},
        )
    user = User(
        email=email,
        display_name=body.display_name.strip(),
        hashed_password=hash_password(body.password),
        role="user",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    logger.info("New account registered: %s", email)
    return _token_response(user)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    email = body.email.strip().lower()
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_CREDENTIALS", "message": "Incorrect email or password."},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCOUNT_DISABLED", "message": "This account is disabled."},
        )
    return _token_response(user)


@router.get("/me", response_model=AccountPublic)
async def me(user: User = Depends(get_current_user)) -> AccountPublic:
    return to_public(user)
