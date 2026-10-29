from app.agent.llm.nvidia import NvidiaClient
from app.agent.llm.types import LLMClient, LLMError
from app.config import get_settings


def build_llm_client() -> LLMClient:
    settings = get_settings()
    key = settings.nvidia_api_key.get_secret_value().strip() if settings.nvidia_api_key else ""
    if not key:
        raise LLMError("NVIDIA_API_KEY is not set")
    return NvidiaClient(
        key,
        base_url=settings.llm_base_url,
        model=settings.llm_model,
        timeout=settings.llm_timeout_seconds,
    )
