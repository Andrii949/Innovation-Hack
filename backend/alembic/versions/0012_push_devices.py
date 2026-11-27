"""device_token table, notification.pushed_at

Revision ID: 0012_push_devices
Revises: 0011_notifications
Create Date: 2026-11-27 20:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012_push_devices"
down_revision: str | None = "0011_notifications"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("notification", sa.Column("pushed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "device_token",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False),
        sa.Column("fid", sa.String(length=512), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("fid"),
    )
    op.create_index("ix_device_token_user_id", "device_token", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_device_token_user_id", table_name="device_token")
    op.drop_table("device_token")
    op.drop_column("notification", "pushed_at")
