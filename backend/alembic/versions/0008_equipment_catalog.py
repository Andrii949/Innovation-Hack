"""equipment_catalog table

Revision ID: 0008_equipment_catalog
Revises: 0007_forms_and_checks
Create Date: 2026-11-27 16:41:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008_equipment_catalog"
down_revision: str | None = "0007_forms_and_checks"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "equipment_catalog",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=100), nullable=False),
        sa.Column("manufacturer", sa.String(length=255), nullable=False),
        sa.Column("model", sa.String(length=255), nullable=False),
        sa.Column("software_version", sa.String(length=100), nullable=True),
        sa.Column("suggested_lab_code", sa.String(length=16), nullable=True),
        sa.Column("calibration_required", sa.Boolean(), nullable=False),
        sa.Column("calibration_interval_months", sa.Integer(), nullable=True),
        sa.Column("calibration_mode", sa.String(length=32), nullable=False),
        sa.Column("lead_months", sa.Integer(), nullable=False),
        sa.Column("acceptance_criteria", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("search_aliases", sa.String(length=255), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_equipment_catalog_manufacturer", "equipment_catalog", ["manufacturer"], unique=False
    )
    op.create_index("ix_equipment_catalog_slug", "equipment_catalog", ["slug"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_equipment_catalog_slug", table_name="equipment_catalog")
    op.drop_index("ix_equipment_catalog_manufacturer", table_name="equipment_catalog")
    op.drop_table("equipment_catalog")
