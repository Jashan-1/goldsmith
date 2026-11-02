import numpy as np
import pytest

from goldsmith.core.uncertainty import (
    combine,
    label_disagreement,
    nearest_distance,
    percentile_ranks,
    status_for,
    text_disagreement,
)

W = {"reference": 0.8, "disagreement": 0.7, "rule_concerns": 0.6, "novelty": 0.4, "confidence": 0.3}


def test_combine_is_noisy_or():
    quiet = {"reference": 0.0, "disagreement": 0.0, "rule_concerns": 0.0, "novelty": 0.0}
    assert combine(quiet, W) == 0.0
    # One strong signal alone crosses the default 0.5 threshold, whatever the others say.
    assert combine({**quiet, "reference": 1.0}, W) == pytest.approx(0.8)
    assert combine({**quiet, "rule_concerns": 1.0}, W) == pytest.approx(0.6)
    # Novelty alone never does.
    assert combine({**quiet, "novelty": 1.0}, W) == pytest.approx(0.4)
    # Signals compound: 1 - (1 - 0.4)(1 - 0.35)
    assert combine({**quiet, "novelty": 1.0, "disagreement": 0.5}, W) == pytest.approx(0.61)
    # Unmeasured signals (None) are skipped, unknown names weigh 0.
    assert combine({"reference": None, "novelty": 0.5, "other": 1.0}, W) == pytest.approx(0.2)
    assert combine({}, W) == 0.0


def test_label_disagreement():
    assert label_disagreement(["a", "a", "a"]) == 0
    assert label_disagreement(["a", "b", "a"]) == pytest.approx(1 / 3)
    assert label_disagreement(["a", "b", "c"]) == pytest.approx(2 / 3)
    assert label_disagreement(["a"]) == 0


def test_text_disagreement_scaled_and_clipped():
    same = np.array([[1, 0], [1, 0], [2, 0]])
    assert text_disagreement(same) == pytest.approx(0)
    opposite = np.array([[1, 0], [0, 1]])
    assert text_disagreement(opposite) == 1.0
    assert text_disagreement(np.array([[1, 0]])) == 0.0


def test_nearest_distance():
    refs = np.array([[1, 0], [0, 1]])
    d = nearest_distance(np.array([[1, 0], [1, 1]]), refs)
    assert d[0] == pytest.approx(0)
    assert d[1] == pytest.approx(1 - np.sqrt(0.5))
    assert nearest_distance(np.array([[1, 0]]), np.zeros((0, 2))).tolist() == [1.0]


def test_percentile_ranks_with_ties():
    assert percentile_ranks(np.array([0.3, 0.1, 0.2])) == [1.0, 0.0, 0.5]
    assert percentile_ranks(np.array([0.5, 0.5, 0.9])) == [0.0, 0.0, 1.0]
    assert percentile_ranks(np.array([0.7])) == [0.0]


def test_status_threshold_is_inclusive():
    assert status_for(0.5, 0.5) == "needs_review"
    assert status_for(0.49, 0.5) == "auto_accepted"
