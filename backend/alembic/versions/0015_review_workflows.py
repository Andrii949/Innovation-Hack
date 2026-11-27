"""Calibration dispatch plans and reviewable test results."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015_review_workflows"
down_revision: str | None = "0014_equipment_catalog"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_APPROVE = "calibration:approve"
_REVIEW = "result:review"


def _update_roles(*, add: bool) -> None:
    connection = op.get_bind()
    roles = sa.table("role", sa.column("name"), sa.column("permissions", sa.JSON()))
    for name, additions in (("manager", {_APPROVE, _REVIEW}), ("admin", {_REVIEW})):
        existing = connection.execute(
            sa.select(roles.c.permissions).where(roles.c.name == name)
        ).scalar_one_or_none()
        if existing is not None:
            permissions = set(existing)
            next_permissions = permissions | additions if add else permissions - additions
            connection.execute(
                roles.update()
                .where(roles.c.name == name)
                .values(permissions=sorted(next_permissions))
            )


def upgrade() -> None:
    op.create_table(
        "calibration_plan",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("equipment_id", sa.Integer(), sa.ForeignKey("equipment.id"), nullable=False),
        sa.Column("dispatch_on", sa.Date(), nullable=False),
        sa.Column("return_on", sa.Date(), nullable=False),
        sa.Column("note", sa.Text()),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("app_user.id"), nullable=False),
        sa.Column("approved_by", sa.Integer(), sa.ForeignKey("app_user.id")),
        sa.Column("approved_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_calibration_plan_equipment_id", "calibration_plan", ["equipment_id"])
    op.add_column(
        "test_result", sa.Column("equipment_id", sa.Integer(), sa.ForeignKey("equipment.id"))
    )
    op.create_index("ix_test_result_equipment_id", "test_result", ["equipment_id"])
    op.add_column(
        "test_result",
        sa.Column("review_calibration_id", sa.Integer(), sa.ForeignKey("calibration.id")),
    )
    op.add_column("test_result", sa.Column("review_decision", sa.String(16)))
    op.add_column("test_result", sa.Column("review_note", sa.Text()))
    op.add_column(
        "test_result", sa.Column("reviewed_by", sa.Integer(), sa.ForeignKey("app_user.id"))
    )
    op.add_column("test_result", sa.Column("reviewed_at", sa.DateTime(timezone=True)))
    _update_roles(add=True)


def downgrade() -> None:
    _update_roles(add=False)
    for column in (
        "reviewed_at",
        "reviewed_by",
        "review_note",
        "review_decision",
        "review_calibration_id",
    ):
        op.drop_column("test_result", column)
    op.drop_index("ix_test_result_equipment_id", table_name="test_result")
    op.drop_column("test_result", "equipment_id")
    op.drop_table("calibration_plan")
