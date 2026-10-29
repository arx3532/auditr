import base64
import uuid
from datetime import date, datetime

from sqlalchemy import func, select, tuple_
from sqlalchemy.orm import Session

from app.core.errors import Unprocessable
from app.db.models import ChatThread, Customer, Invoice, Payment, User
from app.domain.invoice_rules import InvoiceStatus

LISTABLE_STATUSES = {s.value for s in InvoiceStatus} | {"overdue"}
OPEN_STATUSES = [InvoiceStatus.ISSUED.value, InvoiceStatus.PARTIALLY_PAID.value]


def get_customer(db: Session, user_id: uuid.UUID, customer_id: uuid.UUID) -> Customer | None:
    return db.scalar(
        select(Customer).where(Customer.id == customer_id, Customer.user_id == user_id)
    )


def list_customers(db: Session, user_id: uuid.UUID) -> list[Customer]:
    stmt = select(Customer).where(Customer.user_id == user_id).order_by(Customer.name).limit(200)
    return list(db.scalars(stmt))


def get_invoice(
    db: Session, user_id: uuid.UUID, invoice_id: uuid.UUID, *, for_update: bool = False
) -> Invoice | None:
    stmt = select(Invoice).where(Invoice.id == invoice_id, Invoice.user_id == user_id)
    if for_update:
        stmt = stmt.with_for_update(of=Invoice).execution_options(populate_existing=True)
    return db.scalar(stmt)


def list_payments(db: Session, user_id: uuid.UUID, invoice_id: uuid.UUID) -> list[Payment]:
    stmt = (
        select(Payment)
        .where(Payment.user_id == user_id, Payment.invoice_id == invoice_id)
        .order_by(Payment.created_at, Payment.id)
    )
    return list(db.scalars(stmt))


def _encode_cursor(created_at: datetime, invoice_id: uuid.UUID) -> str:
    return base64.urlsafe_b64encode(f"{created_at.isoformat()}|{invoice_id}".encode()).decode()


def _decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        created, ident = raw.split("|")
        return datetime.fromisoformat(created), uuid.UUID(ident)
    except ValueError:
        raise Unprocessable("invalid_cursor", "Invalid cursor") from None


def list_invoices(
    db: Session,
    user_id: uuid.UUID,
    *,
    status: str | None,
    today: date,
    cursor: str | None,
    limit: int,
) -> tuple[list[Invoice], str | None]:
    if status is not None and status not in LISTABLE_STATUSES:
        raise Unprocessable("invalid_status", "Unknown status")
    stmt = select(Invoice).where(Invoice.user_id == user_id)
    if status == "overdue":
        stmt = stmt.where(Invoice.status.in_(OPEN_STATUSES), Invoice.due_date < today)
    elif status is not None:
        stmt = stmt.where(Invoice.status == status)
    if cursor:
        created_at, last_id = _decode_cursor(cursor)
        stmt = stmt.where(tuple_(Invoice.created_at, Invoice.id) < tuple_(created_at, last_id))
    stmt = stmt.order_by(Invoice.created_at.desc(), Invoice.id.desc()).limit(limit + 1)
    rows = list(db.scalars(stmt))
    next_cursor = None
    if len(rows) > limit:
        rows = rows[:limit]
        next_cursor = _encode_cursor(rows[-1].created_at, rows[-1].id)
    return rows, next_cursor


SHAREABLE = [
    InvoiceStatus.ISSUED.value,
    InvoiceStatus.PARTIALLY_PAID.value,
    InvoiceStatus.PAID.value,
]


def get_invoice_by_public_token(db: Session, token: str) -> tuple[Invoice, str | None] | None:
    row = db.execute(
        select(Invoice, User.business_name)
        .join(User, User.id == Invoice.user_id)
        .where(Invoice.public_token == token, Invoice.status.in_(SHAREABLE))
    ).first()
    return None if row is None else (row[0], row[1])


def get_invoice_by_number(db: Session, user_id: uuid.UUID, number: str) -> Invoice | None:
    return db.scalar(select(Invoice).where(Invoice.user_id == user_id, Invoice.number == number))


def find_customers(db: Session, user_id: uuid.UUID, query: str, limit: int = 6) -> list[Customer]:
    """Exact name match (ignoring case) first, then a 'contains' match."""
    text = query.strip()
    exact = list(
        db.scalars(
            select(Customer)
            .where(Customer.user_id == user_id, func.lower(Customer.name) == text.lower())
            .limit(limit)
        )
    )
    if exact:
        return exact
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    stmt = (
        select(Customer)
        .where(Customer.user_id == user_id, Customer.name.ilike(f"%{escaped}", escape="\\"))
        .order_by(Customer.name)
        .limit(limit)
    )
    return list(db.scalars(stmt))


def search_invoices(
    db: Session,
    user_id: uuid.UUID,
    *,
    status: str | None,
    customer_id: uuid.UUID | None,
    today: date,
    limit: int,
) -> list[Invoice]:
    stmt = select(Invoice).where(Invoice.user_id == user_id)
    if customer_id is not None:
        stmt = stmt.where(Invoice.customer_id == customer_id)
    if status == "overdue":
        stmt = stmt.where(Invoice.status.in_(OPEN_STATUSES), Invoice.due_date < today)
    elif status is not None:
        stmt = stmt.where(Invoice.status == status)
    stmt = stmt.order_by(Invoice.created_at.desc(), Invoice.id.desc()).limit(limit)
    return list(db.scalars(stmt))


def create_thread(db: Session, user_id: uuid.UUID) -> ChatThread:
    thread = ChatThread(user_id=user_id)
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return thread


def get_thread(
    db: Session, user_id: uuid.UUID, thread_id: uuid.UUID, *, for_update: bool = False
) -> ChatThread | None:
    stmt = select(ChatThread).where(ChatThread.id == thread_id, ChatThread.user_id == user_id)
    if for_update:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    return db.scalar(stmt)
