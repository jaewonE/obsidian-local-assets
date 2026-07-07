export type ExternalLinkKind = "embed" | "link" | "html-media" | "raw";
export type ExternalLinkSource = "remote" | "data-uri";

export interface ExternalLinkMatch {
	kind: ExternalLinkKind;
	source: ExternalLinkSource;
	url: string;
	originalText: string;
	startIndex: number;
	endIndex: number;
	label: string;
	sizeOrAlias: string;
}

export interface LinkReplacement {
	startIndex: number;
	endIndex: number;
	replacementText: string;
}

interface TextRange {
	start: number;
	end: number;
}

const HTML_MEDIA_REGEX =
	/<(?:img|video|audio|source)\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi;
const RAW_REMOTE_URL_REGEX = /https?:\/\/[^\s<>"'`]+/g;

export function extractExternalLinks(content: string): ExternalLinkMatch[] {
	const ignoredRanges = collectIgnoredRanges(content);
	const occupiedRanges: TextRange[] = [];
	const matches: ExternalLinkMatch[] = [];

	for (const match of scanMarkdownLinks(content, ignoredRanges)) {
		matches.push(match);
		occupiedRanges.push({ start: match.startIndex, end: match.endIndex });
	}

	for (const match of scanHtmlMediaLinks(content, ignoredRanges, occupiedRanges)) {
		matches.push(match);
		occupiedRanges.push({ start: match.startIndex, end: match.endIndex });
	}

	for (const match of scanRawRemoteLinks(content, ignoredRanges, occupiedRanges)) {
		matches.push(match);
	}

	return matches.sort((a, b) => a.startIndex - b.startIndex);
}

export function buildReplacementMarkdown(
	match: ExternalLinkMatch,
	generatedMarkdownLink: string,
	preserveSizeOrAlias: boolean
): string {
	if (match.kind === "embed" || match.kind === "html-media") {
		return ensureEmbedLink(
			generatedMarkdownLink,
			preserveSizeOrAlias ? match.sizeOrAlias : ""
		);
	}

	return generatedMarkdownLink;
}

export function buildDryRunMarkdownLink(
	match: ExternalLinkMatch,
	fileName: string,
	preserveSizeOrAlias: boolean
): string {
	const alias = linkAliasForMatch(match, fileName, preserveSizeOrAlias);
	const target = alias ? `${fileName}|${alias}` : fileName;
	const generated = `[[${target}]]`;
	return buildReplacementMarkdown(match, generated, preserveSizeOrAlias);
}

export function linkAliasForMatch(
	match: ExternalLinkMatch,
	fileName: string,
	preserveSizeOrAlias: boolean
): string {
	if (!preserveSizeOrAlias || match.kind !== "link") {
		return "";
	}

	const alias = match.label.trim();
	return alias && alias !== fileName ? alias : "";
}

export function applyReplacements(content: string, replacements: LinkReplacement[]): string {
	if (replacements.length === 0) {
		return content;
	}

	const descending = [...replacements].sort((a, b) => b.startIndex - a.startIndex);
	let updated = content;
	for (const replacement of descending) {
		updated =
			updated.slice(0, replacement.startIndex) +
			replacement.replacementText +
			updated.slice(replacement.endIndex);
	}
	return updated;
}

function scanMarkdownLinks(content: string, ignoredRanges: TextRange[]): ExternalLinkMatch[] {
	const matches: ExternalLinkMatch[] = [];
	let index = 0;

	while (index < content.length) {
		const bracketIndex = content.indexOf("[", index);
		if (bracketIndex === -1) {
			break;
		}

		const embedPrefix = bracketIndex > 0 && content[bracketIndex - 1] === "!";
		const startIndex = embedPrefix ? bracketIndex - 1 : bracketIndex;
		if (isInRanges(startIndex, ignoredRanges)) {
			index = bracketIndex + 1;
			continue;
		}

		const labelEnd = content.indexOf("]", bracketIndex + 1);
		if (labelEnd === -1 || content[labelEnd + 1] !== "(") {
			index = bracketIndex + 1;
			continue;
		}

		const destinationStart = labelEnd + 2;
		const destinationEnd = findMarkdownDestinationEnd(content, destinationStart);
		if (destinationEnd === -1) {
			index = bracketIndex + 1;
			continue;
		}

		const destination = parseMarkdownDestination(
			content.slice(destinationStart, destinationEnd)
		);
		const endIndex = destinationEnd + 1;
		if (!destination || !isSupportedSource(destination)) {
			index = endIndex;
			continue;
		}

		const labelRaw = content.slice(bracketIndex + 1, labelEnd).trim();
		const separatorIndex = embedPrefix ? labelRaw.indexOf("|") : -1;
		const label = separatorIndex >= 0 ? labelRaw.slice(0, separatorIndex).trim() : labelRaw;
		const sizeOrAlias = separatorIndex >= 0 ? labelRaw.slice(separatorIndex + 1).trim() : "";

		matches.push({
			kind: embedPrefix ? "embed" : "link",
			source: sourceForUrl(destination),
			url: destination,
			originalText: content.slice(startIndex, endIndex),
			startIndex,
			endIndex,
			label,
			sizeOrAlias,
		});
		index = endIndex;
	}

	return matches;
}

function scanHtmlMediaLinks(
	content: string,
	ignoredRanges: TextRange[],
	occupiedRanges: TextRange[]
): ExternalLinkMatch[] {
	const matches: ExternalLinkMatch[] = [];

	for (const regexMatch of content.matchAll(HTML_MEDIA_REGEX)) {
		const startIndex = regexMatch.index ?? -1;
		if (
			startIndex < 0 ||
			isInRanges(startIndex, ignoredRanges) ||
			isRangeOverlapping(startIndex, startIndex + regexMatch[0].length, occupiedRanges)
		) {
			continue;
		}

		const url = regexMatch[1] ?? regexMatch[2] ?? regexMatch[3] ?? "";
		if (!isSupportedSource(url)) {
			continue;
		}

		matches.push({
			kind: "html-media",
			source: sourceForUrl(url),
			url,
			originalText: regexMatch[0],
			startIndex,
			endIndex: startIndex + regexMatch[0].length,
			label: "",
			sizeOrAlias: "",
		});
	}

	return matches;
}

function scanRawRemoteLinks(
	content: string,
	ignoredRanges: TextRange[],
	occupiedRanges: TextRange[]
): ExternalLinkMatch[] {
	const matches: ExternalLinkMatch[] = [];

	for (const regexMatch of content.matchAll(RAW_REMOTE_URL_REGEX)) {
		const startIndex = regexMatch.index ?? -1;
		if (startIndex < 0) {
			continue;
		}

		let url = trimTrailingUrlPunctuation(regexMatch[0]);
		if (!url || !url.startsWith("http")) {
			continue;
		}

		const endIndex = startIndex + url.length;
		if (
			isInRanges(startIndex, ignoredRanges) ||
			isRangeOverlapping(startIndex, endIndex, occupiedRanges)
		) {
			continue;
		}

		matches.push({
			kind: "raw",
			source: "remote",
			url,
			originalText: url,
			startIndex,
			endIndex,
			label: "",
			sizeOrAlias: "",
		});
	}

	return matches;
}

function collectIgnoredRanges(content: string): TextRange[] {
	const ranges: TextRange[] = [];
	let index = 0;

	while (index < content.length) {
		const fenceStart = content.indexOf("```", index);
		if (fenceStart === -1) {
			break;
		}

		const fenceEnd = content.indexOf("```", fenceStart + 3);
		const end = fenceEnd === -1 ? content.length : fenceEnd + 3;
		ranges.push({ start: fenceStart, end });
		index = end;
	}

	for (let cursor = 0; cursor < content.length; cursor++) {
		if (content[cursor] !== "`" || isInRanges(cursor, ranges)) {
			continue;
		}
		const close = content.indexOf("`", cursor + 1);
		if (close === -1) {
			break;
		}
		ranges.push({ start: cursor, end: close + 1 });
		cursor = close;
	}

	return ranges.sort((a, b) => a.start - b.start);
}

function findMarkdownDestinationEnd(content: string, startIndex: number): number {
	let depth = 0;
	let quote: string | null = null;

	for (let index = startIndex; index < content.length; index++) {
		const char = content[index];
		if (quote) {
			if (char === quote && content[index - 1] !== "\\") {
				quote = null;
			}
			continue;
		}

		if (char === "\"" || char === "'") {
			quote = char;
			continue;
		}
		if (char === "(") {
			depth++;
			continue;
		}
		if (char === ")") {
			if (depth === 0) {
				return index;
			}
			depth--;
		}
	}

	return -1;
}

function parseMarkdownDestination(rawDestination: string): string | null {
	const trimmed = rawDestination.trim();
	if (!trimmed) {
		return null;
	}

	if (trimmed.startsWith("<")) {
		const close = trimmed.indexOf(">");
		if (close > 1) {
			return trimmed.slice(1, close).trim();
		}
	}

	const match = trimmed.match(/^(data:[^\s]+|https?:\/\/\S+)/i);
	return match?.[1] ?? null;
}

function ensureEmbedLink(generatedMarkdownLink: string, sizeOrAlias: string): string {
	const embedLink = generatedMarkdownLink.startsWith("!")
		? generatedMarkdownLink
		: `!${generatedMarkdownLink}`;

	if (!sizeOrAlias) {
		return embedLink;
	}

	const wikilinkMatch = embedLink.match(/^(!?)\[\[([^\]]+)]]$/);
	if (!wikilinkMatch) {
		return embedLink;
	}

	const prefix = wikilinkMatch[1] ?? "!";
	const target = wikilinkMatch[2] ?? "";
	const baseTarget = target.split("|")[0] ?? target;
	return `${prefix}[[${baseTarget}|${sizeOrAlias}]]`;
}

function isSupportedSource(url: string): boolean {
	return /^https?:\/\//i.test(url) || /^data:/i.test(url);
}

function sourceForUrl(url: string): ExternalLinkSource {
	return /^data:/i.test(url) ? "data-uri" : "remote";
}

function trimTrailingUrlPunctuation(url: string): string {
	return url.replace(/[),.;:!?]+$/g, "");
}

function isInRanges(index: number, ranges: TextRange[]): boolean {
	return ranges.some((range) => index >= range.start && index < range.end);
}

function isRangeOverlapping(start: number, end: number, ranges: TextRange[]): boolean {
	return ranges.some((range) => start < range.end && end > range.start);
}
