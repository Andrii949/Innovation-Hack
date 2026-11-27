"""reagent, reagent_lot, stock_count tables

Revision ID: 0010_reagents
Revises: 0009_verify_threshold
Create Date: 2026-11-27 19:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010_reagents"
down_revision: str | None = "0009_verify_threshold"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "reagent",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("lab_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("unit", sa.String(length=32), nullable=False),
        sa.Column("min_stock", sa.Numeric(), nullable=True),
        sa.Column("stock_count_interval_days", sa.Integer(), nullable=False),
        sa.Column("expiry_lead_months", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["lab_id"], ["lab.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reagent_lab_id", "reagent", ["lab_id"], unique=False)

    op.create_table(
        "reagent_lot",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("reagent_id", sa.Integer(), nullable=False),
        sa.Column("lot_no", sa.String(length=100), nullable=False),
        sa.Column("expiry_date", sa.Date(), nullable=False),
        sa.Column("quantity", sa.Numeric(), nullable=False),
        sa.Column("received_on", sa.Date(), nullable=False),
        sa.Column("disposed_on", sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(["reagent_id"], ["reagent.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reagent_lot_reagent_id", "reagent_lot", ["reagent_id"], unique=False)

    op.create_table(
        "stock_count",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("reagent_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Numeric(), nullable=False),
        sa.Column("counted_on", sa.Date(), nullable=False),
        sa.Column("counted_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["reagent_id"], ["reagent.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["counted_by"], ["app_user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stock_count_reagent_id", "stock_count", ["reagent_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_stock_count_reagent_id", table_name="stock_count")
    op.drop_table("stock_count")
    op.drop_index("ix_reagent_lot_reagent_id", table_name="reagent_lot")
    op.drop_table("reagent_lot")
    op.drop_index("ix_reagent_lab_id", table_name="reagent")
    op.drop_table("reagent")
