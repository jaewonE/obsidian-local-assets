export type ExternalLinkKind = "embed" | "link";

export interface ExternalLinkMatch {
	kind: ExternalLinkKind;
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

const EMBED_REGEX = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
const LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

export function extractExternalLinks(content: string): ExternalLinkMatch[] {
	const matches: ExternalLinkMatch[] = [];
	const embedRanges: Array<{ start: number; end: number }> = [];

	for (const match of content.matchAll(EMBED_REGEX)) {
		const start = match.index ?? -1;
		const originalText = match[0];
		const end = start + originalText.length;
		const url = match[2];
		if (start < 0 || !url) {
			continue;
		}

		const altRaw = (match[1] ?? "").trim();
		const separatorIndex = altRaw.indexOf("|");
		const label = separatorIndex >= 0 ? altRaw.slice(0, separatorIndex).trim() : altRaw;
		const sizeOrAlias = separatorIndex >= 0 ? altRaw.slice(separatorIndex + 1).trim() : "";

		embedRanges.push({ start, end });
		matches.push({
			kind: "embed",
			url,
			originalText,
			startIndex: start,
			endIndex: end,
			label,
			sizeOrAlias,
		});
	}

	for (const match of content.matchAll(LINK_REGEX)) {
		const start = match.index ?? -1;
		const originalText = match[0];
		const end = start + originalText.length;
		const url = match[2];
		if (start < 0 || !url) {
			continue;
		}

		const overlapped = embedRanges.some((range) => start >= range.start && end <= range.end);
		if (overlapped) {
			continue;
		}

		matches.push({
			kind: "link",
			url,
			originalText,
			startIndex: start,
			endIndex: end,
				label: (match[1] ?? "").trim(),
			sizeOrAlias: "",
		});
	}

	return matches.sort((a, b) => a.startIndex - b.startIndex);
}

export function buildReplacementMarkdown(
	match: ExternalLinkMatch,
	fileName: string,
	preserveSizeOrAlias: boolean
): string {
	if (match.kind === "embed") {
		let linkTarget = fileName;
		if (preserveSizeOrAlias && match.sizeOrAlias) {
			linkTarget += `|${match.sizeOrAlias}`;
		}
		return `![[${linkTarget}]]`;
	}

	const alias = match.label.trim();
	if (preserveSizeOrAlias && alias && alias !== fileName) {
		return `[[${fileName}|${alias}]]`;
	}
	return `[[${fileName}]]`;
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
