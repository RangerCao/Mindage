"""
API routes for interactive topic tree exploration (LLM-driven).

Provides endpoints for the "思维导图探索" feature where users enter a topic
and interactively expand nodes by double-clicking.  Supports:

- Context-aware child generation (ancestors + siblings passed to LLM)
- Per-node and full-article content generation
- Persistent storage of trees (per-user isolation)
- Markdown mind-map import
"""

import json
import os
import re
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from lightrag import LightRAG, QueryParam
from lightrag.api.utils_api import get_combined_auth_dependency
from lightrag.utils import logger


# ── Request / response models ──────────────────────────────────────────────

class ExploreInitRequest(BaseModel):
    topic: str = Field(..., min_length=1, max_length=200, description="Root topic")
    num_children: int = Field(default=4, ge=1, le=10, description="Number of children to generate")


class AncestorNode(BaseModel):
    title: str = Field(..., description="Ancestor node title")
    summary: str = Field(default="", description="Ancestor node summary")


class SiblingNode(BaseModel):
    title: str = Field(..., description="Sibling node title")
    summary: str = Field(default="", description="Sibling node summary")


class ExploreExpandRequest(BaseModel):
    title: str = Field(..., description="Parent node title")
    summary: str = Field(default="", description="Parent node summary/context")
    num_children: int = Field(default=4, ge=1, le=10, description="Number of children to generate")
    ancestors: list[AncestorNode] = Field(
        default_factory=list,
        description="Ancestor chain from root to parent (exclusive), for context",
    )
    siblings: list[SiblingNode] = Field(
        default_factory=list,
        description="Existing sibling nodes (same parent), for avoiding overlap",
    )


class GenerateContentRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200, description="Node title to generate content for")
    keywords: str = Field(default="", max_length=500, description="Optional keywords as prompt hints")
    workspaces: list[str] = Field(default_factory=list, description="List of workspace names to retrieve context from")


class SaveTreeRequest(BaseModel):
    tree_id: str = Field(default="", description="Existing tree id to update; empty to create new")
    doc_name: str = Field(..., description="Display name for the tree")
    structure: list[dict] = Field(..., description="Tree structure (root nodes)")
    article: str = Field(default="", description="Generated / edited article content")


class ImportMarkdownRequest(BaseModel):
    markdown: str = Field(..., min_length=1, description="Markdown text with heading-based structure")
    doc_name: str = Field(default="", description="Display name; derived from first heading if empty")


# ── Storage helper ─────────────────────────────────────────────────────────

def _get_storage_dir(working_dir: str, username: str = "_shared") -> Path:
    """Return the per-user explore-tree storage directory, creating it if needed."""
    safe_name = re.sub(r'[^\w\-.]', '_', username)
    storage_dir = Path(working_dir) / "explore_trees" / safe_name
    storage_dir.mkdir(parents=True, exist_ok=True)
    return storage_dir


def _save_tree_to_disk(storage_dir: Path, tree_id: str, data: dict) -> str:
    """Persist a tree dict to a JSON file.  Returns the tree_id."""
    if not tree_id:
        tree_id = uuid.uuid4().hex[:12]
    data["tree_id"] = tree_id
    data.setdefault("created_at", time.time())
    data["updated_at"] = time.time()
    file_path = storage_dir / f"{tree_id}.json"
    file_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return tree_id


def _load_tree_from_disk(storage_dir: Path, tree_id: str) -> dict:
    """Load a tree JSON by id.  Raises HTTPException 404 if not found."""
    file_path = storage_dir / f"{tree_id}.json"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Tree '{tree_id}' not found")
    return json.loads(file_path.read_text(encoding="utf-8"))


def _list_trees(storage_dir: Path) -> list[dict]:
    """List all persisted trees (metadata only, no full structure)."""
    results = []
    for fp in sorted(storage_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(fp.read_text(encoding="utf-8"))
            results.append({
                "tree_id": data.get("tree_id", fp.stem),
                "doc_name": data.get("doc_name", ""),
                "created_at": data.get("created_at", 0),
                "updated_at": data.get("updated_at", 0),
                "article": data.get("article", ""),
                "node_count": _count_nodes(data.get("structure", [])),
            })
        except Exception:
            continue
    return results


def _count_nodes(nodes: list) -> int:
    total = 0
    for n in nodes:
        total += 1
        children = n.get("nodes", [])
        if children:
            total += _count_nodes(children)
    return total


def _parse_markdown_tree(md_text: str, default_name: str = "") -> dict:
    """Parse a Markdown heading-based outline into a tree structure.

    Supports:
    - ``# H1``, ``## H2``, ``### H3``, etc.
    - Chinese numbering: ``一、``, ``（一）``, ``1.``, ``1.1`` etc.
    - Plain indented lines treated as deeper levels.

    Returns a dict with ``doc_name`` and ``structure`` (list of root TreeNode).
    """
    lines = md_text.split("\n")
    # Stack of (depth, node_dict) – the current ancestor chain
    stack: list[tuple[int, dict]] = []
    roots: list[dict] = []
    node_counter = 0

    for raw_line in lines:
        line = raw_line.rstrip()
        if not line.strip():
            continue

        # Detect heading depth
        depth = 0
        title = ""

        # Markdown headings: # H1, ## H2, ...
        m = re.match(r'^(#{1,6})\s+(.+)', line)
        if m:
            depth = len(m.group(1))
            title = m.group(2).strip()
        else:
            # Chinese numbering: 一、 （一） 1. 1.1
            cn_h1 = re.match(r'^([一二三四五六七八九十]+)[、．]\s*(.+)', line)
            cn_h2 = re.match(r'^（[一二三四五六七八九十]+）\s*(.+)', line)
            num_h = re.match(r'^(\d+(?:\.\d+)*)[.．]?\s+(.+)', line)

            if cn_h1:
                depth = 1
                title = line.strip()
            elif cn_h2:
                depth = 2
                title = line.strip()
            elif num_h:
                parts = num_h.group(1).split('.')
                depth = len(parts)
                title = num_h.group(2).strip() if num_h.group(2) else line.strip()
            else:
                # Skip non-heading lines
                continue

        if not title:
            continue

        node_counter += 1
        new_node = {
            "title": title,
            "node_id": f"{node_counter:04d}",
            "summary": "",
            "text": "",
            "nodes": [],
        }

        # Find correct parent: pop stack until we find a node with smaller depth
        while stack and stack[-1][0] >= depth:
            stack.pop()

        if stack:
            parent_node = stack[-1][1]
            parent_node["nodes"].append(new_node)
        else:
            roots.append(new_node)

        stack.append((depth, new_node))

    doc_name = default_name
    if not doc_name and roots:
        doc_name = roots[0].get("title", "Imported Tree")

    return {"doc_name": doc_name, "structure": roots}


# ── Router factory ─────────────────────────────────────────────────────────

def create_explore_routes(
    rag: LightRAG,
    workspace_manager: object | None = None,
    api_key: str | None = None,
) -> APIRouter:
    """Create the interactive topic exploration router.

    Args:
        rag: The LightRAG instance (or proxy).
        workspace_manager: Optional WorkspaceManager for listing/switching workspaces.
        api_key: Optional API key for auth.

    Returns:
        An ``APIRouter`` instance with explore endpoints.
    """
    router = APIRouter(prefix="/tree/explore", tags=["tree"])
    auth = get_combined_auth_dependency(api_key)

    def _get_llm_func():
        """Get the base LLM function from the RAG instance."""
        current = rag
        if hasattr(rag, "_current"):
            current = rag._current()
        llm = getattr(current, "llm_model_func", None)
        if llm is None:
            raise HTTPException(status_code=500, detail="LLM function not available")
        return llm

    def _get_working_dir() -> str:
        current = rag
        if hasattr(rag, "_current"):
            current = rag._current()
        return getattr(current, "working_dir", "./rag_storage")

    def _get_username(request: Request) -> str:
        """Extract username from request state (set by auth dependency)."""
        return getattr(request.state, "username", "_shared") or "_shared"

    def _get_storage(request: Request) -> Path:
        return _get_storage_dir(_get_working_dir(), _get_username(request))

    # ── POST /init ──────────────────────────────────────────────────────

    @router.post("/init", summary="Generate initial tree from a topic")
    async def explore_init(body: ExploreInitRequest, request: Request, _=Depends(auth)):
        """Given a topic, generate an initial tree structure (root + children)."""
        llm_func = _get_llm_func()
        topic = body.topic.strip()
        num = body.num_children

        SYSTEM_PROMPT = (
            "你是一个知识结构化专家。请根据给定的主题，生成适合思维导图的子主题列表。"
        )

        USER_PROMPT = f"""请根据主题「{topic}」，生成 {num} 个合理的子主题作为思维导图的第一层节点。

输出要求：
1. 每行输出一个子节点，格式为："子节点标题 | 简短描述"
2. 标题尽量简短（不超过 20 字），描述不超过 50 字
3. 各子主题之间应当互不重叠，各自覆盖主题的不同方面
4. 只输出子节点列表，不要输出解释、说明或总结
5. 不要输出 markdown 符号或多余空行

示例：
数据结构 | 数据的逻辑组织形式
算法分析 | 评估算法效率的方法
"""

        try:
            response = await llm_func(USER_PROMPT, system_prompt=SYSTEM_PROMPT)
            if not response or not isinstance(response, str):
                raise HTTPException(status_code=500, detail="LLM returned empty response")

            children = _parse_llm_response(response)
            if not children:
                raise HTTPException(status_code=500, detail="Failed to parse LLM response")

            root = {
                "title": topic,
                "node_id": "root",
                "summary": "",
                "text": "",
                "nodes": children,
            }

            return {
                "doc_name": topic,
                "structure": [root],
            }

        except HTTPException:
            raise
        except Exception as exc:
            logger.error("explore_init failed: %s", exc)
            raise HTTPException(status_code=500, detail=str(exc))

    # ── POST /expand ────────────────────────────────────────────────────

    @router.post("/expand", summary="Generate child nodes for a given parent node")
    async def explore_expand(body: ExploreExpandRequest, request: Request, _=Depends(auth)):
        """Generate child nodes with full contextual awareness.

        Receives the ancestor chain (root → … → parent) and existing siblings
        so the LLM can avoid overlap and produce contextually appropriate children.
        """
        llm_func = _get_llm_func()
        title = body.title.strip()
        summary = body.summary.strip()
        num = body.num_children

        # ── Build rich context from ancestors ───────────────────────────
        ancestor_lines = []
        for anc in body.ancestors:
            anc_text = f"- {anc.title}"
            if anc.summary:
                anc_text += f"：{anc.summary[:80]}"
            ancestor_lines.append(anc_text)
        ancestor_context = "\n".join(ancestor_lines) if ancestor_lines else "（无上级节点）"

        # ── Build sibling context ───────────────────────────────────────
        sibling_lines = []
        for sib in body.siblings:
            sib_text = f"- {sib.title}"
            if sib.summary:
                sib_text += f"：{sib.summary[:80]}"
            sibling_lines.append(sib_text)
        sibling_context = "\n".join(sibling_lines) if sibling_lines else "（暂无兄弟节点）"

        SYSTEM_PROMPT = (
            "你是一个知识结构化专家。请根据给定的父节点主题及其上下文，生成合理的子主题列表，"
            "用于构建思维导图。每个子主题应该与父主题紧密相关，覆盖其重要方面，"
            "同时避免与已有兄弟节点内容重叠。"
        )

        parent_info = f"父节点标题：{title}\n"
        if summary:
            parent_info += f"父节点摘要：{summary[:300]}\n"

        USER_PROMPT = f"""请根据以下信息，为父节点生成 {num} 个合理的子节点。

【上级节点路径】（从根节点到父节点的层级关系）
{ancestor_context}

【当前父节点】
{parent_info}
【已有兄弟节点】（新生成的子节点不应与这些内容重叠）
{sibling_context}

输出要求：
1. 每行输出一个子节点，格式为："子节点标题 | 简短描述"
2. 标题尽量简短（不超过 20 字），描述不超过 50 字
3. 子节点应覆盖父主题的不同方面，且与已有兄弟节点不重复
4. 只输出子节点列表，不要输出解释、说明或总结
5. 不要输出 markdown 符号或多余空行

示例：
数据结构 | 数据的逻辑组织形式
算法分析 | 评估算法效率的方法
"""

        try:
            response = await llm_func(USER_PROMPT, system_prompt=SYSTEM_PROMPT)
            if not response or not isinstance(response, str):
                return {"nodes": []}

            children = _parse_llm_response(response)
            return {"nodes": children}

        except Exception as exc:
            logger.error("explore_expand failed: %s", exc)
            raise HTTPException(status_code=500, detail=str(exc))

    # ── GET /workspaces ─────────────────────────────────────────────────

    @router.get("/workspaces", summary="List available workspaces")
    async def explore_workspaces(request: Request, _=Depends(auth)):
        """List all available workspaces/knowledge bases."""
        if workspace_manager is None:
            return {"workspaces": [], "current": ""}
        try:
            workspaces = workspace_manager.list_workspaces()
            current = workspace_manager.current_workspace or ""
            result = []
            for w in workspaces:
                name = w.name if hasattr(w, "name") else (w.get("name", "") if isinstance(w, dict) else str(w))
                result.append({
                    "name": name,
                    "is_active": name == current,
                })
            return {"workspaces": result, "current": current}
        except Exception as exc:
            logger.error("explore_workspaces failed: %s", exc)
            return {"workspaces": [], "current": ""}

    # ── POST /generate-full-article ─────────────────────────────────────

    @router.post("/generate-full-article", summary="Generate full article from the entire tree structure")
    async def explore_generate_full_article(body: dict, request: Request, _=Depends(auth)):
        """Generate a full article covering all nodes in the tree."""
        llm_func = _get_llm_func()
        structure = body.get("structure", [])
        target_workspaces = body.get("workspaces", [])
        heading_style = body.get("heading_style", "markdown")

        # ── Flatten tree into sections ──────────────────────────────────
        sections: list[dict] = []

        def flatten(nodes: list[dict], depth: int = 1):
            for node in nodes:
                title = node.get("title", "")
                keywords = node.get("keywords", "")
                children = node.get("nodes", [])
                sections.append({
                    "title": title,
                    "keywords": keywords,
                    "depth": depth,
                })
                if children:
                    flatten(children, depth + 1)

        flatten(structure)
        if not sections:
            return {"content": ""}

        # ── Retrieve context from knowledge bases ───────────────────────
        context_parts = []

        if target_workspaces and workspace_manager:
            for ws_name in target_workspaces:
                if not ws_name:
                    continue
                try:
                    current_ws = getattr(workspace_manager, "current_workspace", "")
                    if current_ws != ws_name:
                        await workspace_manager.switch_to(ws_name)

                    current = rag
                    if hasattr(rag, "_current"):
                        current = rag._current()

                    root_title = sections[0]["title"]
                    context_result = await current.aquery(
                        root_title,
                        param=QueryParam(
                            mode="local",
                            only_need_context=True,
                            top_k=15,
                        ),
                    )
                    if context_result and isinstance(context_result, str) and len(context_result) > 10:
                        context_parts.append(f"【知识库：{ws_name}】\n{context_result}")
                except Exception as exc:
                    logger.warning("Failed to query workspace '%s': %s", ws_name, exc)
                finally:
                    if current_ws != ws_name:
                        try:
                            await workspace_manager.switch_to(current_ws)
                        except Exception:
                            pass

        # ── Build article outline with chosen heading style ─────────────
        CN_NUM = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"]

        def cn_number(n: int) -> str:
            if n <= 10:
                return CN_NUM[n]
            return str(n)

        outline_lines = []
        section_counters: list[int] = []

        for i, sec in enumerate(sections):
            kw = f"（关键词：{sec['keywords']}）" if sec["keywords"] else ""

            if i == 0:
                outline_lines.append(f"# {sec['title']}{kw}")
                continue

            level = max(0, sec["depth"] - 2)

            while len(section_counters) <= level:
                section_counters.append(0)
            section_counters[level] += 1
            for j in range(level + 1, len(section_counters)):
                section_counters[j] = 0

            if heading_style == "markdown":
                heading_map = {0: "#", 1: "##", 2: "###", 3: "####", 4: "#####"}
                prefix = heading_map.get(level, "#####")
                outline_lines.append(f"{prefix} {sec['title']}{kw}")
            elif heading_style == "chinese":
                if level == 0:
                    prefix = f"{cn_number(section_counters[0])}、"
                elif level == 1:
                    prefix = f"（{cn_number(section_counters[1])}）"
                else:
                    parts = ".".join(str(section_counters[j]) for j in range(level + 1))
                    prefix = f"{parts}. "
                outline_lines.append(f"{prefix}{sec['title']}{kw}")
            elif heading_style == "numeric":
                parts = ".".join(str(section_counters[j]) for j in range(level + 1))
                prefix = f"{parts}. "
                outline_lines.append(f"{prefix}{sec['title']}{kw}")
            else:
                parts = ".".join(str(section_counters[j]) for j in range(level + 1))
                outline_lines.append(f"{parts} {sec['title']}{kw}")

        outline = "\n".join(outline_lines)

        style_examples = {
            "markdown": (
                "# 人工智能\n\n人工智能是计算机科学的重要分支...\n\n"
                "## 机器学习\n\n机器学习是AI的核心方法之一...\n\n"
                "### 监督学习\n\n监督学习使用标注数据进行训练..."
            ),
            "chinese": (
                "# 人工智能\n\n人工智能是计算机科学的重要分支...\n\n"
                "一、机器学习\n\n机器学习是AI的核心方法之一...\n\n"
                "（一）监督学习\n\n监督学习使用标注数据进行训练..."
            ),
            "numeric": (
                "# 人工智能\n\n人工智能是计算机科学的重要分支...\n\n"
                "1. 机器学习\n\n机器学习是AI的核心方法之一...\n\n"
                "1.1. 监督学习\n\n监督学习使用标注数据进行训练..."
            ),
            "decimal": (
                "# 人工智能\n\n人工智能是计算机科学的重要分支...\n\n"
                "1 机器学习\n\n机器学习是AI的核心方法之一...\n\n"
                "1.1 监督学习\n\n监督学习使用标注数据进行训练..."
            ),
        }
        example = style_examples.get(heading_style, style_examples["markdown"])

        SYSTEM_PROMPT = "你是一位专业的多章节文章写作专家。请根据给定的大纲和参考上下文，严格按照层级标题结构生成一篇结构完整、内容详实的文章。"

        prompt = f"""请根据以下文章大纲，生成一篇完整的文章。

注意：
- 大纲第一行以「# 标题」开头，这是整篇文章的总标题，不要在其后直接写正文
- 从第二行开始是各章节标题，请严格按每行开头的编号格式输出标题和正文

文章大纲：
{outline}
"""
        if context_parts:
            ctx = "\n".join(context_parts)
            if len(ctx) > 4000:
                ctx = ctx[:4000] + "..."
            prompt += f"\n参考上下文（来自知识库）：\n{ctx}\n"

        prompt += f"""
写作要求：
1. 必须严格保留大纲中每一行开头的编号格式，不得修改
2. 第一行「# 标题」是整篇文章的总标题，后面不要直接跟正文，先空一行再输出引言
3. 从第二行开始，为每一个章节标题生成对应的正文内容
4. 各节内容应当连贯，形成一篇流畅完整的文章
5. 每节的段落长度在 200-500 字之间
6. 如果某节有关键词提示，请确保覆盖关键词内容
7. 正文使用普通段落文字，每段之间空一行
8. 直接输出完整文章，不要输出额外说明

正确输出示例（{heading_style} 格式）：
{example}
"""

        try:
            response = await llm_func(prompt, system_prompt=SYSTEM_PROMPT)
            if not response or not isinstance(response, str):
                return {"content": ""}
            return {"content": response.strip()}
        except Exception as exc:
            logger.error("explore_generate_full_article failed: %s", exc)
            raise HTTPException(status_code=500, detail=str(exc))

    # ── POST /generate-content ──────────────────────────────────────────

    @router.post("/generate-content", summary="Generate paragraph content from a node topic")
    async def explore_generate_content(body: GenerateContentRequest, request: Request, _=Depends(auth)):
        """Generate paragraph content for a node based on its title, optional keywords,
        and context from the selected workspace/knowledge base."""
        llm_func = _get_llm_func()
        title = body.title.strip()
        keywords = body.keywords.strip()
        target_workspaces = [w.strip() for w in body.workspaces if w.strip()]

        # ── Retrieve context from knowledge base(s) ─────────────────────
        context_parts = []

        if target_workspaces and workspace_manager:
            for ws_name in target_workspaces:
                if not ws_name:
                    continue
                try:
                    current_ws = getattr(workspace_manager, "current_workspace", "")
                    if current_ws != ws_name:
                        await workspace_manager.switch_to(ws_name)

                    current = rag
                    if hasattr(rag, "_current"):
                        current = rag._current()

                    query_text = title
                    if keywords:
                        query_text += f" {keywords}"

                    context_result = await current.aquery(
                        query_text,
                        param=QueryParam(
                            mode="local",
                            only_need_context=True,
                            top_k=10,
                        ),
                    )
                    if context_result and isinstance(context_result, str) and len(context_result) > 10:
                        context_parts.append(f"【知识库：{ws_name}】\n{context_result}")
                except Exception as exc:
                    logger.warning("Failed to query workspace '%s': %s", ws_name, exc)
                finally:
                    if current_ws != ws_name:
                        try:
                            await workspace_manager.switch_to(current_ws)
                        except Exception:
                            pass

        # ── Build LLM prompt ────────────────────────────────────────────
        SYSTEM_PROMPT = "你是一个专业的文章写作助手。请根据给定的主题和参考上下文，生成一段内容详实、逻辑清晰的段落。"

        prompt = f"""请根据以下主题生成一段内容详实的文字段落。

主题：{title}
"""
        if keywords:
            prompt += f"关键词提示：{keywords}\n"
        if context_parts:
            ctx = "\n".join(context_parts)
            if len(ctx) > 3000:
                ctx = ctx[:3000] + "..."
            prompt += f"\n参考上下文（来自知识库）：\n{ctx}\n"
        prompt += """
写作要求：
1. 段落应当围绕主题展开，内容充实
2. 语言流畅自然，结构清晰
3. 段落长度在 300-800 字之间
4. 如果有关键词提示，请确保覆盖关键词内容
5. 如果有参考上下文，请结合上下文内容进行扩展
6. 直接输出段落正文，不要输出标题、解释或总结
"""

        try:
            response = await llm_func(prompt, system_prompt=SYSTEM_PROMPT)
            if not response or not isinstance(response, str):
                return {"content": ""}

            return {"content": response.strip()}

        except Exception as exc:
            logger.error("explore_generate_content failed: %s", exc)
            raise HTTPException(status_code=500, detail=str(exc))

    # ── POST /save ──────────────────────────────────────────────────────

    @router.post("/save", summary="Save or update an explore tree")
    async def explore_save(body: SaveTreeRequest, request: Request, _=Depends(auth)):
        """Persist a tree (with optional article) to disk, scoped to the current user."""
        storage = _get_storage(request)
        try:
            data = {
                "doc_name": body.doc_name,
                "structure": body.structure,
                "article": body.article,
            }
            tree_id = _save_tree_to_disk(storage, body.tree_id, data)
            return {"tree_id": tree_id, "status": "ok"}
        except Exception as exc:
            logger.error("explore_save failed: %s", exc)
            raise HTTPException(status_code=500, detail=str(exc))

    # ── GET /list ───────────────────────────────────────────────────────

    @router.get("/list", summary="List persisted explore trees for current user")
    async def explore_list(request: Request, _=Depends(auth)):
        """Return metadata for all trees saved by the current user."""
        storage = _get_storage(request)
        try:
            trees = _list_trees(storage)
            return {"trees": trees}
        except Exception as exc:
            logger.error("explore_list failed: %s", exc)
            return {"trees": []}

    # ── GET /load/{tree_id} ─────────────────────────────────────────────

    @router.get("/load/{tree_id}", summary="Load a persisted explore tree")
    async def explore_load(tree_id: str, request: Request, _=Depends(auth)):
        """Load a full tree (structure + article) by tree_id."""
        storage = _get_storage(request)
        try:
            data = _load_tree_from_disk(storage, tree_id)
            return data
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("explore_load failed: %s", exc)
            raise HTTPException(status_code=500, detail=str(exc))

    # ── DELETE /delete/{tree_id} ────────────────────────────────────────

    @router.delete("/delete/{tree_id}", summary="Delete a persisted explore tree")
    async def explore_delete(tree_id: str, request: Request, _=Depends(auth)):
        """Delete a tree by tree_id."""
        storage = _get_storage(request)
        file_path = storage / f"{tree_id}.json"
        if not file_path.exists():
            raise HTTPException(status_code=404, detail=f"Tree '{tree_id}' not found")
        try:
            file_path.unlink()
            return {"status": "ok", "tree_id": tree_id}
        except Exception as exc:
            logger.error("explore_delete failed: %s", exc)
            raise HTTPException(status_code=500, detail=str(exc))

    # ── POST /import ────────────────────────────────────────────────────

    @router.post("/import", summary="Import a mind-map from Markdown text")
    async def explore_import(body: ImportMarkdownRequest, request: Request, _=Depends(auth)):
        """Parse a Markdown heading-based outline into a tree structure.

        Accepts headings in Markdown (``# H1``, ``## H2``), Chinese numbering
        (``一、``, ``（一）``), or numeric (``1.``, ``1.1``) format.
        """
        try:
            result = _parse_markdown_tree(body.markdown, body.doc_name)
            if not result["structure"]:
                raise HTTPException(status_code=400, detail="No headings found in markdown text")
            return result
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("explore_import failed: %s", exc)
            raise HTTPException(status_code=500, detail=str(exc))

    return router


# ── LLM response parser ────────────────────────────────────────────────────

def _parse_llm_response(response: str) -> list[dict]:
    """Parse LLM response text into a list of child node dicts.

    Expected format per line: "标题 | 描述" or "标题: 描述"
    """
    lines = [ln.strip() for ln in response.strip().split("\n") if ln.strip()]
    nodes: list[dict] = []
    node_counter = [1]

    for line in lines:
        # Remove leading numbering like "1." or "1、" or "- " or "* "
        line = re.sub(r"^[\d]+[.．、\)\s]\s*", "", line).strip()
        line = re.sub(r"^[-*•]\s*", "", line).strip()

        # Split by "|" or "：" or ": "
        parts = re.split(r"\s*[|：:]\s*", line, maxsplit=1)
        title = parts[0].strip()
        desc = parts[1].strip() if len(parts) > 1 else ""

        if not title:
            continue

        nodes.append({
            "title": title,
            "node_id": f"{node_counter[0]:04d}",
            "summary": desc[:500] if desc else "",
            "text": desc,
            "nodes": [],
        })
        node_counter[0] += 1

    return nodes
