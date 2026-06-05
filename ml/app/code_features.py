from __future__ import annotations

import ast
import hashlib
import math
from collections import Counter
from dataclasses import dataclass
from typing import Any


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


@dataclass
class CodeFeatures:
    parser: str
    metrics: dict[str, float]
    algorithm_hints: dict[str, float]
    ast_shape_hash: str
    semantic_signature_hash: str
    tree_sitter_shape_hash: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "algorithm_hints": self.algorithm_hints,
            "ast_shape_hash": self.ast_shape_hash,
            "metrics": self.metrics,
            "parser": self.parser,
            "semantic_signature_hash": self.semantic_signature_hash,
            "tree_sitter_shape_hash": self.tree_sitter_shape_hash,
        }


class PythonFeatureVisitor(ast.NodeVisitor):
    def __init__(self) -> None:
        self.node_types: Counter[str] = Counter()
        self.call_names: Counter[str] = Counter()
        self.assigned_names: Counter[str] = Counter()
        self.loaded_names: Counter[str] = Counter()
        self.mutations: Counter[str] = Counter()
        self.comparisons: Counter[str] = Counter()
        self.import_names: Counter[str] = Counter()
        self.literal_types: Counter[str] = Counter()
        self.operator_types: Counter[str] = Counter()
        self.max_depth = 0
        self.current_depth = 0
        self.function_names: list[str] = []
        self.membership_tests = 0
        self.recursive_calls = 0
        self.subscript_count = 0

    def generic_visit(self, node: ast.AST) -> None:
        self.node_types[type(node).__name__] += 1
        self.current_depth += 1
        self.max_depth = max(self.max_depth, self.current_depth)
        super().generic_visit(node)
        self.current_depth -= 1

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self.function_names.append(node.name)
        self.generic_visit(node)
        self.function_names.pop()

    def visit_Call(self, node: ast.Call) -> None:
        name = self._call_name(node.func)
        if name:
            self.call_names[name] += 1
            if self.function_names and name == self.function_names[-1]:
                self.recursive_calls += 1
        self.generic_visit(node)

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            self.import_names[alias.name.split(".")[0]] += 1
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        if node.module:
            self.import_names[node.module.split(".")[0]] += 1
        for alias in node.names:
            self.import_names[alias.name] += 1
        self.generic_visit(node)

    def visit_Name(self, node: ast.Name) -> None:
        if isinstance(node.ctx, ast.Store):
            self.assigned_names[node.id] += 1
        elif isinstance(node.ctx, ast.Load):
            self.loaded_names[node.id] += 1
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute) -> None:
        if node.attr in {
            "add",
            "append",
            "discard",
            "extend",
            "heappop",
            "heappush",
            "popleft",
            "pop",
            "remove",
            "sort",
        }:
            self.mutations[node.attr] += 1
        self.generic_visit(node)

    def visit_BinOp(self, node: ast.BinOp) -> None:
        self.operator_types[type(node.op).__name__] += 1
        self.generic_visit(node)

    def visit_BoolOp(self, node: ast.BoolOp) -> None:
        self.operator_types[type(node.op).__name__] += 1
        self.generic_visit(node)

    def visit_UnaryOp(self, node: ast.UnaryOp) -> None:
        self.operator_types[type(node.op).__name__] += 1
        self.generic_visit(node)

    def visit_Compare(self, node: ast.Compare) -> None:
        for op in node.ops:
            self.comparisons[type(op).__name__] += 1
            if isinstance(op, (ast.In, ast.NotIn)):
                self.membership_tests += 1
        self.generic_visit(node)

    def visit_Constant(self, node: ast.Constant) -> None:
        self.literal_types[type(node.value).__name__] += 1
        self.generic_visit(node)

    def visit_Subscript(self, node: ast.Subscript) -> None:
        self.subscript_count += 1
        self.generic_visit(node)

    @staticmethod
    def _call_name(node: ast.AST) -> str | None:
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Attribute):
            base = PythonFeatureVisitor._call_name(node.value)
            return f"{base}.{node.attr}" if base else node.attr
        return None


class ShapeNormalizer(ast.NodeTransformer):
    def visit_Name(self, node: ast.Name) -> ast.AST:
        return ast.copy_location(ast.Name(id="ID", ctx=node.ctx), node)

    def visit_arg(self, node: ast.arg) -> ast.AST:
        return ast.copy_location(ast.arg(arg="ARG", annotation=None), node)

    def visit_Constant(self, node: ast.Constant) -> ast.AST:
        value = node.value
        if isinstance(value, str):
            normalized: object = "STR"
        elif isinstance(value, bool):
            normalized = value
        elif isinstance(value, (int, float, complex)):
            normalized = 0
        else:
            normalized = None
        return ast.copy_location(ast.Constant(value=normalized), node)


def _tree_sitter_parser() -> Any | None:
    try:
        from tree_sitter import Language, Parser
        import tree_sitter_python
    except Exception:
        return None

    try:
        raw_language = tree_sitter_python.language()
        try:
            language = Language(raw_language)
        except TypeError:
            language = raw_language

        try:
            return Parser(language)
        except TypeError:
            parser = Parser()
            if hasattr(parser, "set_language"):
                parser.set_language(language)
            else:
                parser.language = language
            return parser
    except Exception:
        return None


def _tree_sitter_metrics(source_code: str) -> tuple[dict[str, float], str | None]:
    parser = _tree_sitter_parser()
    if parser is None:
        return {}, None

    try:
        tree = parser.parse(source_code.encode("utf-8"))
        root = tree.root_node
    except Exception:
        return {}, None

    node_types: Counter[str] = Counter()
    preorder_named: list[str] = []
    max_depth = 0
    error_count = 0

    def walk(node: Any, depth: int) -> None:
        nonlocal error_count, max_depth
        node_type = str(node.type)
        node_types[node_type] += 1
        max_depth = max(max_depth, depth)
        if getattr(node, "is_named", False):
            preorder_named.append(node_type)
        if node_type == "ERROR" or getattr(node, "is_error", False):
            error_count += 1
        for index in range(int(getattr(node, "child_count", 0))):
            walk(node.child(index), depth + 1)

    walk(root, 1)
    shape_parts = preorder_named[:512]
    shape_hash = _sha256("|".join(shape_parts))
    metrics = {
        "tree_sitter_error_count": float(error_count),
        "tree_sitter_has_error": float(bool(getattr(root, "has_error", False))),
        "tree_sitter_max_depth": float(max_depth),
        "tree_sitter_named_node_count": float(len(preorder_named)),
        "tree_sitter_node_count": float(sum(node_types.values())),
        "tree_sitter_unique_node_types": float(len(node_types)),
    }
    return metrics, shape_hash


def _entropy(counter: Counter[str]) -> float:
    total = sum(counter.values())
    if total == 0:
        return 0.0
    value = 0.0
    for count in counter.values():
        p = count / total
        value -= p * math.log2(p)
    return round(value, 4)


def _algorithm_hints(visitor: PythonFeatureVisitor) -> dict[str, float]:
    calls = visitor.call_names
    names = Counter({name.lower(): count for name, count in visitor.loaded_names.items()})
    assigned = Counter({name.lower(): count for name, count in visitor.assigned_names.items()})
    nodes = visitor.node_types
    mutations = visitor.mutations

    return {
        "bfs": float(calls["deque"] + calls["popleft"] + calls["queue.popleft"] > 0),
        "binary_search": float(
            nodes["While"] > 0
            and ("mid" in assigned or "middle" in assigned)
            and (("left" in names or "lo" in names) and ("right" in names or "hi" in names))
        ),
        "dfs": float(visitor.recursive_calls > 0 or "stack" in names or "stack" in assigned),
        "dynamic_programming": float("dp" in names or "dp" in assigned or "memo" in names or calls["lru_cache"] > 0),
        "hashing": float(nodes["Dict"] > 0 or nodes["Set"] > 0 or calls["set"] > 0 or calls["dict"] > 0),
        "heap": float(calls["heapq.heappush"] + calls["heapq.heappop"] + mutations["heappush"] + mutations["heappop"] > 0),
        "recursion": float(visitor.recursive_calls > 0),
        "sliding_window": float(("left" in names or "start" in names) and ("right" in names or "end" in names) and (nodes["For"] + nodes["While"] > 0)),
        "sorting": float(calls["sorted"] > 0 or mutations["sort"] > 0),
        "stack": float("stack" in names or "stack" in assigned or mutations["append"] + mutations["pop"] > 1),
        "two_pointers": float(("left" in names or "i" in names) and ("right" in names or "j" in names) and nodes["While"] > 0),
    }


def extract_python_code_features(source_code: str) -> CodeFeatures:
    parser = "python_ast"
    tree_sitter_metrics, tree_sitter_shape_hash = _tree_sitter_metrics(source_code)
    if tree_sitter_metrics:
        parser = "python_ast+tree_sitter"

    try:
        tree = ast.parse(source_code)
    except SyntaxError:
        return CodeFeatures(
            parser=parser,
            metrics={
                "parse_error": 1.0,
                "source_length": float(len(source_code)),
                **tree_sitter_metrics,
            },
            algorithm_hints={},
            ast_shape_hash=_sha256("parse_error"),
            semantic_signature_hash=_sha256(f"{source_code}\n{tree_sitter_shape_hash or ''}"),
            tree_sitter_shape_hash=tree_sitter_shape_hash,
        )

    visitor = PythonFeatureVisitor()
    visitor.visit(tree)

    normalized_tree = ShapeNormalizer().visit(ast.fix_missing_locations(tree))
    shape_dump = ast.dump(normalized_tree, include_attributes=False)
    hints = _algorithm_hints(visitor)
    active_algorithm_signals = sum(1 for value in hints.values() if value > 0)
    data_structure_signal_count = sum(
        1
        for value in (
            visitor.node_types["Dict"],
            visitor.node_types["Set"],
            visitor.node_types["List"],
            visitor.call_names["deque"],
            visitor.call_names["set"],
            visitor.call_names["dict"],
            visitor.call_names["heapq.heappush"] + visitor.call_names["heapq.heappop"],
        )
        if value > 0
    )
    control_node_count = (
        visitor.node_types["For"]
        + visitor.node_types["While"]
        + visitor.node_types["If"]
        + visitor.node_types["Try"]
        + visitor.node_types["Match"]
    )
    semantic_parts = [
        ",".join(f"{name}:{count}" for name, count in sorted(visitor.assigned_names.items())),
        ",".join(f"{name}:{count}" for name, count in sorted(visitor.call_names.items())),
        ",".join(f"{name}:{count}" for name, count in sorted(visitor.mutations.items())),
        ",".join(f"{name}:{count}" for name, count in sorted(visitor.comparisons.items())),
        ",".join(f"{name}:{count}" for name, count in sorted(visitor.import_names.items())),
        ",".join(f"{name}:{count}" for name, count in sorted(visitor.operator_types.items())),
        ",".join(f"{name}:{count}" for name, count in sorted(visitor.literal_types.items())),
        ",".join(f"{name}:{value}" for name, value in sorted(hints.items()) if value > 0),
        tree_sitter_shape_hash or "",
    ]

    metrics = {
        "assignment_name_entropy": _entropy(visitor.assigned_names),
        "algorithm_signal_count": float(active_algorithm_signals),
        "branch_count": float(visitor.node_types["If"]),
        "call_count": float(sum(visitor.call_names.values())),
        "call_entropy": _entropy(visitor.call_names),
        "comprehension_count": float(
            visitor.node_types["ListComp"]
            + visitor.node_types["DictComp"]
            + visitor.node_types["SetComp"]
            + visitor.node_types["GeneratorExp"]
        ),
        "control_node_count": float(control_node_count),
        "data_mutation_count": float(sum(visitor.mutations.values())),
        "data_structure_signal_count": float(data_structure_signal_count),
        "function_count": float(visitor.node_types["FunctionDef"] + visitor.node_types["AsyncFunctionDef"]),
        "loop_count": float(visitor.node_types["For"] + visitor.node_types["While"]),
        "max_ast_depth": float(visitor.max_depth),
        "membership_test_count": float(visitor.membership_tests),
        "node_count": float(sum(visitor.node_types.values())),
        "operator_entropy": _entropy(visitor.operator_types),
        "parse_error": 0.0,
        "recursive_call_count": float(visitor.recursive_calls),
        "return_count": float(visitor.node_types["Return"]),
        "semantic_collision_risk": float(active_algorithm_signals == 0 and data_structure_signal_count <= 1),
        "source_length": float(len(source_code)),
        "subscript_count": float(visitor.subscript_count),
        "unique_call_count": float(len(visitor.call_names)),
        "unique_identifier_count": float(len(visitor.assigned_names | visitor.loaded_names)),
        **tree_sitter_metrics,
    }

    return CodeFeatures(
        parser=parser,
        metrics=metrics,
        algorithm_hints=hints,
        ast_shape_hash=_sha256(shape_dump),
        semantic_signature_hash=_sha256("\n".join(semantic_parts)),
        tree_sitter_shape_hash=tree_sitter_shape_hash,
    )
