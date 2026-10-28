from sqlalchemy.orm import Session

from app.core.errors import Unprocessable
from app.db.models import Customer, User
from app.domain.gstin import STATE_CODES, InvalidGSTIN, validate_gstin


def create_customer(
    db: Session, user: User, *, name: str, gstin: str | None, state_code: str | None
) -> Customer:
    name = name.strip()
    if not name:
        raise Unprocessable("invalid_name", "Name is required")

    derived: str | None = None
    if gstin:
        try:
            gstin = validate_gstin(gstin)
        except InvalidGSTIN as exc:
            raise Unprocessable("invalid_gstin", str(exc)) from None
        derived = gstin[:2]
    else:
        gstin = None

    if state_code and derived and state_code != derived:
        raise Unprocessable("state_mismatch", "State code does not match the GSTIN")
    state = state_code or derived
    if not state:
        raise Unprocessable("state_required", "Provide a GSTIN or a state code")
    if state not in STATE_CODES:
        raise Unprocessable("unknown_state", "Unknown state code")

    customer = Customer(user_id=user.id, name=name, gstin=gstin, state_code=state)
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer
