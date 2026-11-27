"""test_parameter.verify_min, verify_max (F10 verification threshold)

Revision ID: 0009_verify_threshold
Revises: 0008_test_results
Create Date: 2026-11-27 18:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_verify_threshold"
down_revision: str | None = "0008_test_results"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("test_parameter", sa.Column("verify_min", sa.Numeric(), nullable=True))
    op.add_column("test_parameter", sa.Column("verify_max", sa.Numeric(), nullable=True))


def downgrade() -> None:
    op.drop_column("test_parameter", "verify_max")
    op.drop_column("test_parameter", "verify_min")
