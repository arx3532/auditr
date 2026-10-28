from fastapi import APIRouter

from app.api.deps import DbDep, UserDep
from app.api.schemas import ProfileIn
from app.core.errors import Unprocessable
from app.domain.gstin import STATE_CODES

router = APIRouter(tags=["profile"])


@router.put("/me/profile")
def update_profile(body: ProfileIn, user: UserDep, db: DbDep) -> dict[str, str | None]:
    if body.state_code not in STATE_CODES:
        raise Unprocessable("unknown_state", "Unknown state code")
    user.state_code = body.state_code
    user.business_name = (body.business_name or "").strip() or None
    db.commit()
    return {"stateCode": user.state_code, "businessName": user.business_name}
