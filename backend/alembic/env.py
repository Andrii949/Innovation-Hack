from logging.config import fileConfig

from alembic import context
from app.audit.models import AuditLog
from app.auth.models import Lab, Role, User, UserSession, user_lab
from app.config import get_settings
from app.db import Base
from app.settings.models import Setting
from sqlalchemy import create_engine, pool

_REGISTERED_MODELS = (Setting, AuditLog, Lab, Role, User, UserSession, user_lab)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=get_settings().database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(get_settings().database_url, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()

    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
