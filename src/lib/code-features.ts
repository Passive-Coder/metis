import crypto from "node:crypto";

const TOKEN_PATTERN =
	/[A-Za-z_][A-Za-z0-9_]*|==|!=|<=|>=|[-+*/%<>]=?|[()[\]{}.,:]/g;

function countMatches(sourceCode: string, pattern: RegExp) {
	return sourceCode.match(pattern)?.length ?? 0;
}

function maxIndentDepth(sourceCode: string) {
	let maxDepth = 0;
	for (const line of sourceCode.split("\n")) {
		if (!line.trim()) {
			continue;
		}
		const leading = line.match(/^\s*/)?.[0] ?? "";
		const depth = Math.floor(leading.replace(/\t/g, "    ").length / 4);
		maxDepth = Math.max(maxDepth, depth);
	}
	return maxDepth;
}

function tokenEntropy(tokens: string[]) {
	if (tokens.length === 0) {
		return 0;
	}
	const counts = new Map<string, number>();
	for (const token of tokens) {
		counts.set(token, (counts.get(token) ?? 0) + 1);
	}

	let entropy = 0;
	for (const count of counts.values()) {
		const p = count / tokens.length;
		entropy -= p * Math.log2(p);
	}
	return Number(entropy.toFixed(4));
}

function normalizedShape(sourceCode: string) {
	return sourceCode
		.replace(/#[^\n]*/g, "")
		.replace(/\b\d+(?:\.\d+)?\b/g, "N")
		.replace(/(['"]).*?\1/g, "S")
		.replace(/[A-Za-z_][A-Za-z0-9_]*/g, "I")
		.replace(/\s+/g, " ")
		.trim();
}

function callNames(sourceCode: string) {
	const calls = new Map<string, number>();
	for (const match of sourceCode.matchAll(
		/\b([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\s*\(/g,
	)) {
		const name = match[1] ?? "";
		calls.set(name, (calls.get(name) ?? 0) + 1);
	}
	return calls;
}

function identifierCounts(sourceCode: string) {
	const identifiers = new Map<string, number>();
	for (const match of sourceCode.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
		const name = match[0].toLowerCase();
		identifiers.set(name, (identifiers.get(name) ?? 0) + 1);
	}
	return identifiers;
}

function sortedCounterParts(counter: Map<string, number>) {
	return [...counter.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([name, count]) => `${name}:${count}`)
		.join(",");
}

function dataStructureSignals(sourceCode: string) {
	return {
		deque: /\bdeque\s*\(|\.popleft\s*\(/.test(sourceCode),
		dict: /\bdict\s*\(|\{[^}\n]*:/.test(sourceCode),
		heap: /\bheapq\b|heappush|heappop/.test(sourceCode),
		listMutation: /\.(append|extend|pop|remove|sort)\s*\(/.test(sourceCode),
		set: /\bset\s*\(|\.add\s*\(|\{[^}\n,]*(?:,[^}\n]*)?\}/.test(sourceCode),
		subscript: /\[[^\]]+\]/.test(sourceCode),
	};
}

function operationProfile(sourceCode: string) {
	return {
		arithmetic: countMatches(sourceCode, /[-+*/%]=?|\/\//g),
		comparison: countMatches(sourceCode, /==|!=|<=|>=|<|>|\bin\b/g),
		indexAccess: countMatches(sourceCode, /\[[^\]]+\]/g),
		logical: countMatches(sourceCode, /\b(and|or|not)\b/g),
		mutation: countMatches(
			sourceCode,
			/\.(append|pop|push|add|remove|discard|extend|sort)\s*\(/g,
		),
	};
}

function algorithmHints(sourceCode: string) {
	const lower = sourceCode.toLowerCase();
	return {
		binarySearch:
			/\bwhile\s+.+<=.+:/.test(sourceCode) &&
			/\bmid\s*=/.test(sourceCode) &&
			/(left|lo).*(right|hi)/.test(lower),
		bfs: /\bdeque\b|\bpopleft\s*\(/.test(sourceCode),
		dfs:
			/\bstack\b|\brecursion\b/.test(lower) ||
			/\bdef\s+\w+.*:\s*\n\s+.*\w+\(/s.test(sourceCode),
		dynamicProgramming: /\bdp\b|\bmemo\b|cache|lru_cache/.test(sourceCode),
		greedy: /\b(best|choice|greedy|profit|current)\b/.test(lower),
		hashing: /\b(dict|set)\b|\{\}/.test(sourceCode),
		heap: /\bheapq\b|heappush|heappop/.test(sourceCode),
		prefixSum: /\bprefix\b|\bpref\b|\brunning_sum\b/.test(lower),
		slidingWindow: /\bleft\b.*\bright\b|\bwindow\b/.test(lower),
		sorting: /\bsorted\s*\(|\.sort\s*\(/.test(sourceCode),
		stack: /\bstack\b|\.append\s*\(|\.pop\s*\(/.test(sourceCode),
		twoPointers: /\bleft\b.*\bright\b|\bi\b.*\bj\b/.test(lower),
	};
}

function semanticSignature(sourceCode: string, hints: Record<string, boolean>) {
	const calls = callNames(sourceCode);
	const identifiers = identifierCounts(sourceCode);
	const operations = operationProfile(sourceCode);
	const structures = dataStructureSignals(sourceCode);
	return [
		sortedCounterParts(calls),
		sortedCounterParts(identifiers),
		Object.entries(hints)
			.filter(([, value]) => value)
			.map(([name]) => name)
			.sort()
			.join(","),
		Object.entries(operations)
			.map(([name, value]) => `${name}:${value}`)
			.join(","),
		Object.entries(structures)
			.filter(([, value]) => value)
			.map(([name]) => name)
			.sort()
			.join(","),
	].join("\n");
}

export function sourceHash(sourceCode: string) {
	return crypto.createHash("sha256").update(sourceCode).digest("hex");
}

export function extractCodeMetrics(sourceCode: string) {
	const tokens = sourceCode.match(TOKEN_PATTERN) ?? [];
	const nonEmptyLines = sourceCode
		.split("\n")
		.filter((line) => line.trim().length > 0);
	const shape = normalizedShape(sourceCode);
	const hints = algorithmHints(sourceCode);
	const activeHintCount = Object.values(hints).filter(Boolean).length;
	const structureSignalCount = Object.values(
		dataStructureSignals(sourceCode),
	).filter(Boolean).length;
	const signature = semanticSignature(sourceCode, hints);

	return {
		algorithmDisagreement:
			activeHintCount > 1
				? Number(((activeHintCount - 1) / activeHintCount).toFixed(4))
				: 0,
		algorithmHints: hints,
		algorithmSignalCount: activeHintCount,
		assignmentCount: countMatches(sourceCode, /(?<![=!<>])=(?!=)/g),
		branchCount: countMatches(sourceCode, /\b(if|elif|else)\b/g),
		callCount: countMatches(sourceCode, /\b[A-Za-z_][A-Za-z0-9_]*\s*\(/g),
		codeHash: sourceHash(sourceCode),
		comparisonCount: countMatches(sourceCode, /==|!=|<=|>=|<|>/g),
		comprehensionCount: countMatches(sourceCode, /\b(for|if)\b[^\n\]]*\]/g),
		functionCount: countMatches(sourceCode, /\bdef\s+[A-Za-z_][A-Za-z0-9_]*/g),
		importCount: countMatches(sourceCode, /\b(import|from)\b/g),
		lineCount: nonEmptyLines.length,
		loopCount: countMatches(sourceCode, /\b(for|while)\b/g),
		maxIndentDepth: maxIndentDepth(sourceCode),
		mutationCount: countMatches(
			sourceCode,
			/\.(append|pop|push|add|remove|discard|extend|sort)\s*\(/g,
		),
		normalizedShapeHash: sourceHash(shape),
		returnCount: countMatches(sourceCode, /\breturn\b/g),
		semanticCollisionRisk:
			activeHintCount === 0 && structureSignalCount <= 1 ? 1 : 0,
		semanticSignatureHash: sourceHash(signature),
		structureSignalCount,
		tokenCount: tokens.length,
		tokenEntropy: tokenEntropy(tokens),
		uniqueTokenRatio: Number(
			(new Set(tokens).size / Math.max(1, tokens.length)).toFixed(4),
		),
	};
}
