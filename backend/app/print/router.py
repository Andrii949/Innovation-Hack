from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.auth.models import User
from app.core.clock import get_today
from app.db import get_db
from app.equipment.service import get_equipment_for_user
from app.print.service import equipment_history, render_pdf

router = APIRouter(prefix="/equipment", tags=["print"])


@router.get("/{equipment_id}/history.pdf")
def get_equipment_history_pdf(
    equipment_id: int,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
    today: Annotated[date, Depends(get_today)],
) -> Response:
    eq = get_equipment_for_user(db, user, equipment_id)
    history = equipment_history(db, eq, today=today)
    pdf = render_pdf("equipment-history.typ", history)
    filename = history.code.replace("/", "-")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}.pdf"'},
    )
