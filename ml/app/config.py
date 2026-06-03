from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql://metis:metis_local_password@localhost:5433/metis"
    neo4j_uri: str | None = None
    neo4j_user: str = "neo4j"
    neo4j_password: str = "metis_graph_password"
    statement_model_name: str = "sentence-transformers/all-MiniLM-L6-v2"
    code_model_name: str = "microsoft/codebert-base"
    allow_hash_fallback: bool = True
    ranker_model: str = "heuristic"
    lightgbm_model_path: str | None = None
    lightfm_model_path: str | None = None
    gnn_model_path: str | None = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
