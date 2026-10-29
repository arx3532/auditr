import asyncio
import operator
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Annotated, Any, TypedDict

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.agent import tools as agent_tools
from app.agent.llm.types import (
    LLMBadResponse,
    LLMClient,
    LLMResponse,
    StreamDone,
    TextDelta,
    parse_tool_arguments,
)
from app.agent.privacy import Redactor, redact_messages
from app.agent.prompts import system_prompt
from app.core.clock import today_ist
from app.core.errors import DomainError
from app.db.session import SessionLocal

MAX_MESSAGES = 60


class AgentState(TypedDict):
    messages: Annotated[list[dict[str, Any]], operator.add]  # append-only, OpenAI format
    pending: dict[str, Any] | None  # the action waiting for the user, if any


def _tool_message(call_id: str, text: str) -> dict[str, Any]:
    return {"role": "tool", "tool_call_id": call_id, "content": Redactor().redact(text)}


def _assistant_message(response: LLMResponse) -> dict[str, Any]:
    message: dict[str, Any] = {"role": "assistant", "content": response.text}
    if response.tool_calls:
        message["tool_calls"] = [
            {
                "id": c.id,
                "type": "function",
                "function": {
                    "name": c.name,
                    # broken JSON is replaced, so replaying the history never fails
                    "arguments": c.raw_arguments if c.arguments is not None else "{}",
                },
            }
            for c in response.tool_calls
        ]
    return message


def build_graph(
    *,
    llm: LLMClient,
    checkpointer: BaseCheckpointSaver[Any],
    user_id: uuid.UUID,
    thread_id: uuid.UUID,
    session_factory: Callable[[], Session] = SessionLocal,
) -> Any:
    """One flat graph: agent -> run_tools -> (approval ->) agent. Built per request
    (cheap) so tests can swap the LLM; state lives in the shared checkpointer."""

    async def agent_node(state: AgentState) -> dict[str, Any]:
        writer = get_stream_writer()
        messages = state["messages"]

        if len(messages) > MAX_MESSAGES:
            text = "This conversation has become long. Please start a new chat."
            writer({"type": "text_delta", "text": text})
            return {"messages": [{"role": "assistant", "context": text}]}
        prompt = [{"role": "system", "content": system_prompt(today_ist())}, *messages]
        safe = redact_messages(prompt, Redactor())  # defence in depth: the client also checks
        response: LLMResponse | None = None
        async for event in llm.stream(safe, agent_tools.TOOL_SPECS):
            if isinstance(event, TextDelta):
                writer({"type": "text_delta", "text": event.text})
            elif isinstance(event, StreamDone):
                response = event.response
        if response is None:
            raise LLMBadResponse("The LLM stream ended without a result")
        return {"messages": [_assistant_message(response)]}

    async def tools_node(state: AgentState) -> dict[str, Any]:
        writer = get_stream_writer()
        last = state["messages"][-1]
        results: list[dict[str, Any]] = []
        pending: dict[str, Any] | None = None
        for call in last.get("tool_calls") or []:
            call_id = call["id"]
            name = call["function"]["name"]
            tool = agent_tools.get_tool(name)
            if tool is None:
                results.append(_tool_message(call_id, f"Error: there is no tool called {name}."))
                continue
            arguments = parse_tool_arguments(call["function"]["arguments"]) or {}
            try:
                args = tool.args_model.model_validate(arguments)
            except ValidationError as exc:
                detail = agent_tools.validation_summary(exc)
                results.append(_tool_message(call_id, f"Error: invalid arguments. {detail}"))
                continue
            if tool.gated and pending is not None:
                results.append(
                    _tool_message(call_id, "Error: only one action can be proposed at a time.")
                )
                continue
            writer({"type": "tool_start", "tool": name})
            try:
                run = await asyncio.to_thread(
                    agent_tools.execute_tool,
                    session_factory,
                    user_id,
                    thread_id,
                    tool,
                    args,
                    today_ist(),
                    datetime.now(UTC),
                )
            except (agent_tools.ToolError, DomainError) as exc:
                results.append(_tool_message(call_id, f"Error: {exc}"))
            else:
                if run.pending_kind is not None:
                    pending = {"kind": run.pending_kind, "tool_call_id": call_id}
                else:
                    results.append(_tool_message(call_id, run.text or ""))
            writer({"type": "tool_end", "tool": name})
        return {"messages": results, "pending": pending}

    def approval_node(state: AgentState) -> dict[str, Any]:
        # NO side effects here: LangGraph re-runs this node from its start on resume.
        pending = state.get("pending") or {}
        decision = interrupt({"kind": pending.get("kind")})
        outcome = decision if isinstance(decision, dict) else {}
        text = str(outcome.get("message") or "No action was taken.")
        return {
            "messages": [_tool_message(str(pending.get("tool_call_id")), text)],
            "pending": None,
        }

    def after_agent(state: AgentState) -> str:
        last = state["messages"][-1]
        if last.get("role") == "assistant" and last.get("tool_calls"):
            return "run_tools"
        return END

    def after_tools(state: AgentState) -> str:
        return "approval" if state.get("pending") else "agent"

    graph = StateGraph(AgentState)
    graph.add_node("agent", agent_node)
    graph.add_node("run_tools", tools_node)
    graph.add_node("approval", approval_node)
    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", after_agent, {"run_tools": "run_tools", END: END})
    graph.add_conditional_edges(
        "run_tools", after_tools, {"approval": "approval", "agent": "agent"}
    )
    graph.add_edge("approval", "agent")
    return graph.compile(checkpointer=checkpointer)
