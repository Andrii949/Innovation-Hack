"""form_template, check_plan, check_record tables

Revision ID: 0007_forms_and_checks
Revises: 0006_equipment_authorizations
Create Date: 2026-11-27 15:35:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_forms_and_checks"
down_revision: str | None = "0006_equipment_authorizations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "form_template",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("fields", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "check_plan",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("interval_months", sa.Integer(), nullable=False),
        sa.Column("lead_months", sa.Integer(), nullable=False),
        sa.Column("form_template_id", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["form_template_id"], ["form_template.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_check_plan_equipment_id", "check_plan", ["equipment_id"], unique=False)

    op.create_table(
        "check_record",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("check_plan_id", sa.Integer(), nullable=False),
        sa.Column("performed_on", sa.Date(), nullable=False),
        sa.Column("values", sa.JSON(), nullable=False),
        sa.Column("out_of_range", sa.Boolean(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("performed_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["check_plan_id"], ["check_plan.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["performed_by"], ["app_user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_check_record_check_plan_id", "check_record", ["check_plan_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_check_record_check_plan_id", table_name="check_record")
    op.drop_table("check_record")
    op.drop_index("ix_check_plan_equipment_id", table_name="check_plan")
    op.drop_table("check_plan")
    op.drop_table("form_template")
