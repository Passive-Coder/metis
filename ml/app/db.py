from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from pgvector.psycopg import register_vector
from psycopg.rows import dict_row

from .config import settings


@contextmanager
def get_connection() -> Iterator[psycopg.Connection]:
    conn = psycopg.connect(settings.database_url, row_factory=dict_row, autocommit=True)
    register_vector(conn)
    try:
        yield conn
    finally:
        conn.close()
