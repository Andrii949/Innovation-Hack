import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session


@pytest.mark.req("17025-7.11.3")
def test_db_fixture_connects_to_postgres(db: Session) -> None:
    assert db.execute(text("SELECT 1")).scalar_one() == 1
