"""notification, notification_rule tables

Revision ID: 0011_notifications
Revises: 0010_reagents
Create Date: 2026-11-27 19:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_notifications"
down_revision: str | None = "0010_reagents"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "notification",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("ref_type", sa.String(length=64), nullable=False),
        sa.Column("ref_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("due", sa.Date(), nullable=True),
        sa.Column("dedupe_key", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "dedupe_key", name="uq_notification_user_dedupe"),
    )
    op.create_index("ix_notification_user_id", "notification", ["user_id"], unique=False)

    op.create_table(
        "notification_rule",
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("recipient_roles", sa.JSON(), nullable=False),
        sa.Column("lab_scoped", sa.Boolean(), nullable=False),
        sa.Column("channels", sa.JSON(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("kind"),
    )


def downgrade() -> None:
    op.drop_table("notification_rule")
    op.drop_index("ix_notification_user_id", table_name="notification")
    op.drop_table("notification")
