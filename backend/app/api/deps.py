from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.models import User
from app.db.session import get_db

UserDep = Annotated[User, Depends(get_current_user)]
DbDep = Annotated[Session, Depends(get_db)]
