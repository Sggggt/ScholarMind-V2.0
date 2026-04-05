"""Pydantic request and response models shared with the frontend."""

from typing import Optional

from pydantic import BaseModel, Field


MODULE_NAMES = {
    0: "初始化",
    1: "文献调研",
    2: "选题开题",
    3: "Idea打分",
    4: "代码生成",
    5: "实验设计",
    6: "Agent实验",
    7: "结果分析",
    8: "论文写作",
    9: "评审打分",
}


def module_int_to_id(n: int) -> str:
    return f"M{max(n, 1)}"


def module_id_to_int(module_id: str) -> int:
    normalized = (module_id or "").strip().upper()
    if not normalized.startswith("M"):
        raise ValueError(f"Invalid module id: {module_id}")

    value = int(normalized[1:])
    if value < 1 or value > 9:
        raise ValueError(f"Invalid module id: {module_id}")
    return value


class TaskCreateRequest(BaseModel):
    topic: str = Field(..., description="Research topic")
    description: str = Field("", description="Extra description")
    config: dict = Field(default_factory=dict, description="Task-scoped configuration")


class TaskReviewRequest(BaseModel):
    action: str = Field(..., description="approve / reject / revise")
    comment: str = Field("", description="Human review comment")


class TaskModuleResetRequest(BaseModel):
    module_id: str = Field(..., description="Target module id, e.g. M3")


class ChatSessionCreateRequest(BaseModel):
    title: str = Field("", description="Optional session title")


class ChatMessageCreateRequest(BaseModel):
    content: str = Field(..., description="User message content")
    task_description: str = Field("", description="Optional generated task description")
    task_config: dict = Field(default_factory=dict, description="Optional task config overrides")


class ChatSessionBindTaskRequest(BaseModel):
    task_id: str = Field(..., description="Existing task id to bind to the chat session")


class RuntimeSettingsRequest(BaseModel):
    llm_provider: str = Field("openai", description="Runtime LLM provider id")
    api_key: str = Field("", description="Provider API key")
    model: str = Field("gpt-4o", description="Provider model name")
    provider_base_url: str = Field("https://api.openai.com/v1", description="Provider base URL")
    search_provider: str = Field("brave", description="Preferred search provider")
    search_api_key: str = Field("", description="Search provider API key (Brave/Tavily/Serper)")
    local_engine: str = Field("lm-studio", description="Local model runtime engine")
    local_server_url: str = Field("http://127.0.0.1:1234/v1", description="OpenAI-compatible local server URL")
    local_model_path: str = Field("", description="Absolute path to the local .gguf model file")
    local_model_alias: str = Field("local-gguf", description="Alias exposed by the local model server")
    local_context_size: int = Field(4096, description="Default local model context window")
    local_gpu_layers: int = Field(0, description="Advanced runtime hint for local engines that expose GPU layer control")
    public_base_url: str = Field("", description="Optional public/tunnel base URL used by mobile clients")


class RuntimeSettingsResponse(BaseModel):
    llm_provider: str
    api_key: str
    model: str
    provider_base_url: str
    search_provider: str
    search_api_key: str
    local_engine: str
    local_server_url: str
    local_model_path: str
    local_model_alias: str
    local_context_size: int
    local_gpu_layers: int
    public_base_url: str
    env_path: str


class HealthResponse(BaseModel):
    ok: bool = True
    service: str = "scholarmind-backend"
    host: str
    port: int


class ConnectionAddressResponse(BaseModel):
    scope: str
    label: str
    url: str
    ws_url: str
    source: str
    recommended: bool = False


class ConnectionInfoResponse(BaseModel):
    host: str
    port: int
    api_base_path: str = "/api"
    ws_base_path: str = "/ws"
    health_path: str = "/api/health"
    public_base_url: str = ""
    lan_urls: list[ConnectionAddressResponse] = []
    public_urls: list[ConnectionAddressResponse] = []
    recommended_mobile_url: str = ""
    recommended_mobile_ws_url: str = ""
    notes: list[str] = []


class ModuleProgress(BaseModel):
    module_id: str
    status: str
    percent: float = 0
    step: str = ""
    message: str = ""
    started_at: Optional[str] = None
    finished_at: Optional[str] = None


class TaskResponse(BaseModel):
    id: str
    title: str
    topic: str
    description: str = ""
    status: str
    current_module: Optional[str] = None
    modules: list[ModuleProgress] = []
    created_at: str
    updated_at: str
    completed_at: Optional[str] = None
    output_url: Optional[str] = None


class ChatMessageResponse(BaseModel):
    id: str
    session_id: str
    role: str
    kind: str = "text"
    content: str = ""
    created_at: str
    metadata: dict = Field(default_factory=dict)


class ChatSessionResponse(BaseModel):
    id: str
    title: str
    summary: str = ""
    task_id: Optional[str] = None
    task_status: Optional[str] = None
    created_at: str
    updated_at: str
    last_message_preview: str = ""


class ChatSessionDetailResponse(BaseModel):
    session: ChatSessionResponse
    messages: list[ChatMessageResponse] = []
    task: Optional[TaskResponse] = None


class ChatMessageSendResponse(BaseModel):
    session: ChatSessionResponse
    user_message: ChatMessageResponse
    assistant_message: ChatMessageResponse
    task: Optional[TaskResponse] = None
    task_created: bool = False


class LogEntryResponse(BaseModel):
    id: str
    task_id: str
    module_id: Optional[str] = None
    level: str = "info"
    message: str = ""
    timestamp: str
    metadata: Optional[dict] = None


class ReviewDimension(BaseModel):
    name: str
    score: float
    max_score: float
    comment: str = ""


class ReviewResultResponse(BaseModel):
    task_id: str
    overall_score: float
    decision: str
    dimensions: list[ReviewDimension] = []
    summary: str = ""
    created_at: str = ""


class TaskOutputResponse(BaseModel):
    paper_url: Optional[str] = None
    code_url: Optional[str] = None
    data_url: Optional[str] = None
    figures: list[str] = []


class WSMessage(BaseModel):
    type: str
    task_id: str
    module: str = "M1"
    step: str = ""
    percent: float = 0
    message: str = ""
    timestamp: str = ""
    data: Optional[dict] = None
