"""equipment_authorization table

Revision ID: 0006_equipment_authorizations
Revises: 0005_equipment_calibrations
Create Date: 2026-11-27 15:29:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_equipment_authorizations"
down_revision: str | None = "0005_equipment_calibrations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "equipment_authorization",
        sa.Column("equipment_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("equipment_id", "user_id"),
    )


def downgrade() -> None:
    op.drop_table("equipment_authorization")
