from dataclasses import dataclass

import numpy as np
from sklearn.cluster import AgglomerativeClustering, HDBSCAN


@dataclass
class ClusterResult:
    labels: list[int]
    probabilities: list[float]
    method: str


def cluster_problem_embeddings(
    embeddings: list[list[float]],
    min_cluster_size: int = 5,
) -> ClusterResult:
    if not embeddings:
        return ClusterResult(labels=[], method="none", probabilities=[])

    matrix = np.asarray(embeddings, dtype=np.float32)

    if len(matrix) >= min_cluster_size * 2:
        model = HDBSCAN(min_cluster_size=min_cluster_size, metric="euclidean")
        labels = model.fit_predict(matrix).tolist()
        probabilities = getattr(model, "probabilities_", np.ones(len(labels))).tolist()
        return ClusterResult(labels=labels, method="hdbscan", probabilities=probabilities)

    cluster_count = min(max(1, len(matrix) // 2), len(matrix))
    if cluster_count == 1:
        return ClusterResult(
            labels=[0 for _ in range(len(matrix))],
            method="single_cluster_fallback",
            probabilities=[1.0 for _ in range(len(matrix))],
        )

    model = AgglomerativeClustering(n_clusters=cluster_count)
    labels = model.fit_predict(matrix).tolist()
    return ClusterResult(
        labels=labels,
        method="agglomerative_small_sample",
        probabilities=[0.75 for _ in labels],
    )
