"""Tests for Territory — claimed node tracking."""

from bamboo_extract.territory import Territory


class TestClaimLeaf:
    def test_leaf_is_claimed(self) -> None:
        t = Territory()
        t.claim_leaf(5)
        assert t.is_claimed(5)

    def test_leaf_does_not_claim_others(self) -> None:
        t = Territory()
        t.claim_leaf(5)
        assert not t.is_claimed(3)


class TestClaimSubtree:
    def test_claims_node_and_descendants(self) -> None:
        t = Territory()
        t.claim_subtree(1, [2, 3, 4])
        assert t.is_claimed(1)
        assert t.is_claimed(2)
        assert t.is_claimed(3)
        assert t.is_claimed(4)

    def test_empty_descendants(self) -> None:
        t = Territory()
        t.claim_subtree(10, [])
        assert t.is_claimed(10)


class TestHasClaimedAncestor:
    def test_ancestor_claimed(self) -> None:
        t = Territory()
        t.claim_leaf(1)
        parent_map = {2: 1, 3: 2}
        assert t.has_claimed_ancestor(2, parent_map)
        assert t.has_claimed_ancestor(3, parent_map)

    def test_no_ancestor_claimed(self) -> None:
        t = Territory()
        parent_map = {2: 1, 3: 2}
        assert not t.has_claimed_ancestor(3, parent_map)

    def test_no_parent(self) -> None:
        t = Territory()
        t.claim_leaf(99)
        assert not t.has_claimed_ancestor(1, {})


class TestExtractRemaining:
    def test_collects_unclaimed_text(self) -> None:
        t = Territory()
        text_content = {1: "Hello", 2: "World", 3: "Skip"}
        t.claim_leaf(2)
        regions = t.extract_remaining([1, 2, 3], text_content)
        assert len(regions) == 1
        assert regions[0]["type"] == "main-text"
        assert regions[0]["content"] == "Hello Skip"
        assert 2 not in regions[0]["node_ids"]

    def test_all_claimed_returns_empty(self) -> None:
        t = Territory()
        t.claim_leaf(1)
        t.claim_leaf(2)
        regions = t.extract_remaining([1, 2], {1: "a", 2: "b"})
        assert regions == []

    def test_empty_input(self) -> None:
        t = Territory()
        regions = t.extract_remaining([], {})
        assert regions == []
