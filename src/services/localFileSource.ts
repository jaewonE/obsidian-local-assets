export function parseLocalFileSource(value: string): string | null {
	const trimmed = value.trim();
	if (trimmed.startsWith("/")) {
		return unescapeMarkdownPath(trimmed);
	}

	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol !== "app:") {
			return null;
		}
		return parsed.pathname.startsWith("/") ? decodeURIComponent(parsed.pathname) : null;
	} catch {
		return null;
	}
}

function unescapeMarkdownPath(value: string): string {
	return value.replace(/\\(.)/g, "$1");
}
