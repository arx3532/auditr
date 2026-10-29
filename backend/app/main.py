from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.deps import UserDep
from app.api.routes import chat, customers, exports, invoices, profile, public, reports
from app.config import get_settings
from app.core.errors import DomainError
from app.core.lifespan import lifespan
from app.db.session import get_db

settings = get_settings()
app = FastAPI(title="Finance Agent API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
)

app.include_router(profile.router)
app.include_router(customers.router)
app.include_router(invoices.router)
app.include_router(reports.router)
app.include_router(exports.router)
app.include_router(public.router)
app.include_router(chat.router)


@app.exception_handler(DomainError)
def domain_error_handler(_: Request, exc: DomainError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message}},
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
def ready(db: Session = Depends(get_db)) -> dict[str, str]:
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable") from None
    return {"status": "ready"}


@app.get("/me")
def me(user: UserDep) -> dict[str, str | None]:
    return {"id": str(user.id), "stateCode": user.state_code, "businessName": user.business_name}
