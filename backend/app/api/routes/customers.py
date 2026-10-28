from fastapi import APIRouter

from app.api.deps import DbDep, UserDep
from app.api.mappers import customer_out
from app.api.schemas import CustomerIn, CustomerOut
from app.db import repositories as repo
from app.services import customers as customer_service

router = APIRouter(prefix="/customers", tags=["customers"])


@router.post("", status_code=201, response_model=CustomerOut, response_model_exclude_none=True)
def create_customer(body: CustomerIn, user: UserDep, db: DbDep) -> CustomerOut:
    customer = customer_service.create_customer(
        db, user, name=body.name, gstin=body.gstin, state_code=body.state_code
    )
    return customer_out(customer)


@router.get("", response_model=list[CustomerOut], response_model_exclude_none=True)
def list_customers(user: UserDep, db: DbDep) -> list[CustomerOut]:
    return [customer_out(c) for c in repo.list_customers(db, user.id)]
