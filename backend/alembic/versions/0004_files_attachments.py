"""attachment table

Revision ID: 0004_files_attachments
Revises: 0003_auth_labs_users
Create Date: 2026-11-27 15:20:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_files_attachments"
down_revision: str | None = "0003_auth_labs_users"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "attachment",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("owner_type", sa.String(length=64), nullable=True),
        sa.Column("owner_id", sa.Integer(), nullable=True),
        sa.Column("lab_id", sa.Integer(), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("storage_key", sa.String(length=255), nullable=False),
        sa.Column("uploaded_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["lab_id"], ["lab.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["uploaded_by"], ["app_user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key"),
    )
    op.create_index("ix_attachment_lab_id", "attachment", ["lab_id"], unique=False)
    op.create_index("ix_attachment_owner_id", "attachment", ["owner_id"], unique=False)
    op.create_index("ix_attachment_owner_type", "attachment", ["owner_type"], unique=False)
    op.create_index("ix_attachment_uploaded_by", "attachment", ["uploaded_by"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_attachment_uploaded_by", table_name="attachment")
    op.drop_index("ix_attachment_owner_type", table_name="attachment")
    op.drop_index("ix_attachment_owner_id", table_name="attachment")
    op.drop_index("ix_attachment_lab_id", table_name="attachment")
    op.drop_table("attachment")
