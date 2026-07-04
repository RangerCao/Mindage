"""
Tree-based retrieval for PageIndex integration.

Implements the ``tree`` and ``hybrid-tree`` query modes that search the
PageIndex tree structure using LLM-guided navigation rather than vector
similarity.
"""

from __future__ import annotations

import json
import re
from typing import Any, Callable

from lightrag.utils import logger


async def tree_search(
    query: str,
    tree: dict[str, Any],
    llm_func: Callable,
    *,
    top_k: int = 3,
    max_depth: int = 10,
) -> str:
    """Search a PageIndex tree for nodes relevant to *query*.

    Uses LLM-guided navigation: starting from the root, decide at each level
    which branch to explore, until reaching leaf nodes that contain the most
    relevant information.

    Args:
        query: The user's question.
        tree: The tree structure from ``TreeIndexStorage.get_tree()``.
        llm_func: Async LLM function (``(prompt, **kwargs) -> str``).
        top_k: Maximum number of leaf contexts to return.
        max_depth: Maximum tree depth to explore.

    Returns:
        Concatenated content from the most relevant node(s).
    """
    structure = tree.get("structure", [])
    if not structure:
        return ""

    # Navigate the tree level by level using the LLM
    selected_nodes = _gather_node_texts(structure)
    if not selected_nodes:
        return ""

    # Score all candidate nodes by relevance
    scored = await _score_nodes(query, selected_nodes, llm_func, top_k=top_k)
    if not scored:
        return _collect_text(selected_nodes[:top_k])

    return _collect_text([n for n, _ in scored])


def _gather_node_texts(
    nodes: list[dict],
    *,
    depth: int = 0,
    max_depth: int = 10,
) -> list[dict]:
    """Flatten tree nodes into a list, collecting title + summary + text."""
    result: list[dict] = []
    for node in nodes:
        if depth > max_depth:
            continue
        entry = {
            "title": node.get("title", ""),
            "summary": node.get("summary", "") or node.get("prefix_summary", ""),
            "text": node.get("text", ""),
            "depth": depth,
            "node_id": node.get("node_id", ""),
        }
        if entry["summary"] or entry["text"]:
            result.append(entry)
        children = node.get("nodes", [])
        if children:
            result.extend(
                _gather_node_texts(children, depth=depth + 1, max_depth=max_depth)
            )
    return result


async def _score_nodes(
    query: str,
    nodes: list[dict],
    llm_func: Callable,
    *,
    top_k: int = 3,
) -> list[tuple[dict, float]]:
    """Use LLM to score each node's relevance to the query."""
    if not nodes:
        return []

    # For efficiency, score in batches
    batch_size = 5
    scored: list[tuple[dict, float]] = []

    for i in range(0, len(nodes), batch_size):
        batch = nodes[i : i + batch_size]
        prompt = _build_scoring_prompt(query, batch)
        try:
            response = await llm_func(prompt)
            scores = _parse_scores(response, len(batch))
            for node, score in zip(batch, scores):
                if score > 0:
                    scored.append((node, score))
        except Exception as e:
            logger.warning("Tree scoring batch failed: %s", e)

    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:top_k]


def _build_scoring_prompt(query: str, nodes: list[dict]) -> str:
    lines = []
    for i, node in enumerate(nodes):
        content = node["summary"] or node["text"] or node["title"]
        lines.append(f"[{i}] Title: {node['title']}\n    Content: {content[:300]}")
    return f"""Given the question: "{query}"

Rate how relevant each section below is to answering the question.
Return ONLY a JSON array of scores from 0 (not relevant) to 10 (highly relevant).

Nodes:
{chr(10).join(lines)}

Respond with: {{"scores": [0, 0, 0, ...]}}"""


def _parse_scores(response: str, expected: int) -> list[float]:
    """Parse LLM score response into a list of floats."""
    try:
        # Try JSON extraction
        match = re.search(r"\{[^}]+\}", response)
        if match:
            data = json.loads(match.group())
            scores = data.get("scores", [])
            return [float(s) for s in scores[:expected]]
    except Exception:
        pass
    return [0.0] * expected


def _collect_text(nodes: list[dict]) -> str:
    """Concatenate node texts into a single context string."""
    parts = []
    for node in nodes:
        title = node.get("title", "")
        summary = node.get("summary", "") or node.get("prefix_summary", "")
        text = node.get("text", "")
        content = summary or text
        if content:
            parts.append(f"## {title}\n{content}")
    return "\n\n".join(parts)
