"""equipment, calibration, calibration_point tables

Revision ID: 0005_equipment_calibrations
Revises: 0004_files_attachments
Create Date: 2026-11-27 15:27:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_equipment_calibrations"
down_revision: str | None = "0004_files_attachments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "equipment",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("public_id", sa.String(length=16), nullable=False),
        sa.Column("lab_id", sa.Integer(), nullable=False),
        sa.Column("number", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column("manufacturer", sa.String(length=255), nullable=True),
        sa.Column("model", sa.String(length=255), nullable=True),
        sa.Column("serial_no", sa.String(length=255), nullable=True),
        sa.Column("software_version", sa.String(length=100), nullable=True),
        sa.Column("location", sa.String(length=255), nullable=True),
        sa.Column("calibration_required", sa.Boolean(), nullable=False),
        sa.Column("calibration_interval_months", sa.Integer(), nullable=True),
        sa.Column("calibration_mode", sa.String(length=32), nullable=False),
        sa.Column("lead_months", sa.Integer(), nullable=False),
        sa.Column("acceptance_criteria", sa.Text(), nullable=True),
        sa.Column("withdrawn_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("withdrawn_reason", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["lab_id"], ["lab.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("lab_id", "number", name="uq_equipment_lab_number"),
    )
    op.create_index("ix_equipment_lab_id", "equipment", ["lab_id"], unique=False)
    op.create_index("ix_equipment_public_id", "equipment", ["public_id"], unique=True)

    op.create_table(
        "calibration",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=False),
        sa.Column("calibrated_month", sa.Date(), nullable=False),
        sa.Column("vendor", sa.String(length=255), nullable=True),
        sa.Column("certificate_no", sa.String(length=255), nullable=True),
        sa.Column("adjustments", sa.Text(), nullable=True),
        sa.Column("result", sa.String(length=8), nullable=False),
        sa.Column("next_due_month", sa.Date(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("ocr_meta", sa.JSON(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["app_user.id"]),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_calibration_equipment_id", "calibration", ["equipment_id"], unique=False)

    op.create_table(
        "calibration_point",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("calibration_id", sa.Integer(), nullable=False),
        sa.Column("point", sa.String(length=100), nullable=False),
        sa.Column("error", sa.Numeric(), nullable=False),
        sa.Column("uncertainty", sa.Numeric(), nullable=False),
        sa.Column("unit", sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(["calibration_id"], ["calibration.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_calibration_point_calibration_id",
        "calibration_point",
        ["calibration_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_calibration_point_calibration_id", table_name="calibration_point")
    op.drop_table("calibration_point")
    op.drop_index("ix_calibration_equipment_id", table_name="calibration")
    op.drop_table("calibration")
    op.drop_index("ix_equipment_public_id", table_name="equipment")
    op.drop_index("ix_equipment_lab_id", table_name="equipment")
    op.drop_table("equipment")
