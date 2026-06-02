from dataclasses import dataclass

from neo4j import GraphDatabase

from .config import settings
from .db import get_connection


STATIC_TOPIC_EDGES = [
    ("arrays", "hash-maps", "Hash maps depend on array indexing and lookup patterns."),
    ("arrays", "sorting", "Sorting is easiest after array traversal is fluent."),
    ("hash-maps", "two-pointers", "Two-pointer work often combines with lookup state."),
    ("sorting", "intervals", "Interval merging starts with ordered ranges."),
    ("two-pointers", "sliding-window", "Sliding windows extend two-pointer reasoning."),
    ("arrays", "graph-traversal", "Grid and graph traversal require structured containers."),
    ("graph-traversal", "dynamic-programming", "DP on graphs/grids benefits from traversal order."),
]


@dataclass
class TopicNode:
    slug: str
    name: str
    description: str = ""


STATIC_TOPICS = [
    TopicNode("arrays", "Arrays"),
    TopicNode("hash-maps", "Hash maps"),
    TopicNode("strings", "Strings"),
    TopicNode("sorting", "Sorting"),
    TopicNode("two-pointers", "Two pointers"),
    TopicNode("intervals", "Intervals"),
    TopicNode("sliding-window", "Sliding window"),
    TopicNode("graph-traversal", "Graph traversal"),
    TopicNode("dynamic-programming", "Dynamic programming"),
]


def seed_static_topic_graph() -> int:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            for topic in STATIC_TOPICS:
                cursor.execute(
                    """
                    INSERT INTO topics (slug, name, description, generated_by)
                    VALUES (%s, %s, %s, 'static_seed')
                    ON CONFLICT (slug) DO UPDATE
                    SET name = EXCLUDED.name,
                        description = EXCLUDED.description
                    """,
                    (topic.slug, topic.name, topic.description),
                )

            for from_slug, to_slug, rationale in STATIC_TOPIC_EDGES:
                cursor.execute(
                    """
                    INSERT INTO topic_edges (from_topic_id, to_topic_id, rationale, is_static)
                    SELECT source.id, target.id, %s, true
                    FROM topics source, topics target
                    WHERE source.slug = %s AND target.slug = %s
                    ON CONFLICT (from_topic_id, to_topic_id, edge_type) DO UPDATE
                    SET rationale = EXCLUDED.rationale,
                        is_static = true
                    """,
                    (rationale, from_slug, to_slug),
                )

    return len(STATIC_TOPIC_EDGES)


def sync_topic_graph_to_neo4j() -> int:
    if not settings.neo4j_uri:
        return 0

    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT slug, name, description
                FROM topics
                ORDER BY slug
                """
            )
            topic_rows = cursor.fetchall()
            cursor.execute(
                """
                SELECT source.slug AS from_slug,
                       source.name AS from_name,
                       target.slug AS to_slug,
                       target.name AS to_name,
                       edge.weight,
                       edge.rationale
                FROM topic_edges edge
                JOIN topics source ON source.id = edge.from_topic_id
                JOIN topics target ON target.id = edge.to_topic_id
                """
            )
            edge_rows = cursor.fetchall()
            cursor.execute(
                """
                SELECT COALESCE(problem.external_id, problem.id::text) AS problem_id,
                       problem.slug,
                       problem.title,
                       problem.difficulty::text AS difficulty,
                       topic.slug AS topic_slug,
                       topic.name AS topic_name,
                       problem_topic.weight
                FROM problem_topics problem_topic
                JOIN problems problem ON problem.id = problem_topic.problem_id
                JOIN topics topic ON topic.id = problem_topic.topic_id
                ORDER BY problem.slug, topic.slug
                """
            )
            problem_topic_rows = cursor.fetchall()

    driver = GraphDatabase.driver(
        settings.neo4j_uri,
        auth=(settings.neo4j_user, settings.neo4j_password),
    )
    with driver.session() as session:
        for row in topic_rows:
            session.run(
                """
                MERGE (topic:Topic {slug: $slug})
                SET topic.name = $name,
                    topic.description = $description
                """,
                dict(row),
            )

        for row in edge_rows:
            session.run(
                """
                MERGE (source:Topic {slug: $from_slug})
                SET source.name = $from_name
                MERGE (target:Topic {slug: $to_slug})
                SET target.name = $to_name
                MERGE (source)-[edge:PREREQUISITE_FOR]->(target)
                SET edge.weight = $weight,
                    edge.rationale = $rationale
                """,
                dict(row),
            )

        for row in problem_topic_rows:
            session.run(
                """
                MERGE (problem:Problem {id: $problem_id})
                SET problem.slug = $slug,
                    problem.title = $title,
                    problem.difficulty = $difficulty
                MERGE (topic:Topic {slug: $topic_slug})
                SET topic.name = $topic_name
                MERGE (problem)-[edge:TAGGED_WITH]->(topic)
                SET edge.weight = $weight
                """,
                dict(row),
            )
    driver.close()
    return len(edge_rows) + len(problem_topic_rows)
