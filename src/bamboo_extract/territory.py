"""Territorial extraction — track claimed DOM nodes to avoid double-processing."""

from __future__ import annotations


class Territory:
    """Track claimed DOM nodes using node IDs.

    Mirrors the JS createTerritory() behavior from extractors.mjs:37-164.
    Uses integer node IDs (from DOM index) instead of object references.
    """

    def __init__(self) -> None:
        self.claimed: set[int] = set()

    def claim_leaf(self, node_id: int) -> None:
        """Mark a single node as claimed."""
        self.claimed.add(node_id)

    def claim_subtree(self, node_id: int, descendants: list[int]) -> None:
        """Mark a node and all its descendants as claimed."""
        self.claimed.add(node_id)
        self.claimed.update(descendants)

    def is_claimed(self, node_id: int) -> bool:
        return node_id in self.claimed

    def has_claimed_ancestor(self, node_id: int, parent_map: dict[int, int]) -> bool:
        """Walk up the parent chain to check if any ancestor is claimed."""
        pid = parent_map.get(node_id)
        while pid is not None:
            if pid in self.claimed:
                return True
            pid = parent_map.get(pid)
        return False

    def extract_remaining(
        self,
        all_text_nodes: list[int],
        text_content: dict[int, str],
    ) -> list[dict]:
        """Collect unclaimed text nodes into a single main-text region.

        Mirrors JS extractRemaining() — merges all unclaimed text into
        one region with space-separated content.
        """
        current_text = ""
        current_node_ids: list[int] = []

        for nid in all_text_nodes:
            if nid in self.claimed:
                continue
            text = text_content.get(nid, "").strip()
            if not text:
                continue
            if current_text:
                current_text += " " + text
            else:
                current_text = text
            current_node_ids.append(nid)

        if not current_text:
            return []

        return [
            {
                "type": "main-text",
                "content": current_text,
                "node_ids": current_node_ids,
            }
        ]
