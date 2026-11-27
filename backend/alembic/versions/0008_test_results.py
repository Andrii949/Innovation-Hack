"""test_parameter, test_result tables

Revision ID: 0008_test_results
Revises: 0007_forms_and_checks
Create Date: 2026-11-27 18:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008_test_results"
down_revision: str | None = "0007_forms_and_checks"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "test_parameter",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("material", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("unit", sa.String(length=32), nullable=False),
        sa.Column("min_value", sa.Numeric(), nullable=True),
        sa.Column("max_value", sa.Numeric(), nullable=True),
        sa.Column("method", sa.String(length=255), nullable=True),
        sa.Column("accredited", sa.Boolean(), nullable=False),
        sa.Column("out_of_range_action", sa.String(length=8), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "material", "name", "unit", name="uq_test_parameter_material_name_unit"
        ),
    )

    op.create_table(
        "test_result",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("parameter_id", sa.Integer(), nullable=False),
        sa.Column("sample_label", sa.String(length=255), nullable=False),
        sa.Column("value", sa.Numeric(), nullable=False),
        sa.Column("min_snapshot", sa.Numeric(), nullable=True),
        sa.Column("max_snapshot", sa.Numeric(), nullable=True),
        sa.Column("in_range", sa.Boolean(), nullable=False),
        sa.Column("repeat_of_id", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["parameter_id"], ["test_parameter.id"]),
        sa.ForeignKeyConstraint(["repeat_of_id"], ["test_result.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["app_user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_test_result_parameter_id", "test_result", ["parameter_id"], unique=False)
    op.create_index("ix_test_result_created_at", "test_result", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_test_result_created_at", table_name="test_result")
    op.drop_index("ix_test_result_parameter_id", table_name="test_result")
    op.drop_table("test_result")
    op.drop_table("test_parameter")
