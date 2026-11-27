"""audit_log table

Revision ID: 0002_audit_log
Revises: 0001_settings
Create Date: 2026-11-27 15:07:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_audit_log"
down_revision: str | None = "0001_settings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("entity", sa.String(length=64), nullable=False),
        sa.Column("entity_id", sa.String(length=64), nullable=True),
        sa.Column("before", sa.JSON(), nullable=True),
        sa.Column("after", sa.JSON(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_log_at", "audit_log", ["at"], unique=False)
    op.create_index("ix_audit_log_user_id", "audit_log", ["user_id"], unique=False)
    op.create_index("ix_audit_log_action", "audit_log", ["action"], unique=False)
    op.create_index("ix_audit_log_entity", "audit_log", ["entity"], unique=False)
    op.create_index("ix_audit_log_entity_id", "audit_log", ["entity_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_audit_log_entity_id", table_name="audit_log")
    op.drop_index("ix_audit_log_entity", table_name="audit_log")
    op.drop_index("ix_audit_log_action", table_name="audit_log")
    op.drop_index("ix_audit_log_user_id", table_name="audit_log")
    op.drop_index("ix_audit_log_at", table_name="audit_log")
    op.drop_table("audit_log")
