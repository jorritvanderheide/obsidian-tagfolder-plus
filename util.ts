import {
	tagDispDict,
	type TagFolderSettings,
	type ViewItem,
	type FileCache
} from "types";

export function unique<T>(items: T[]) {
	return [...new Set<T>([...items])];
}

export function getRootNamespace(tag: string): string {
	return tag.split("/")[0].toLowerCase().replace(/\/$/, "");
}

export function trimSlash(src: string, keepStart = false, keepEnd = false) {
	const st = keepStart ? 0 : (src[0] == "/" ? 1 : 0);
	const end = keepEnd ? undefined : (src.endsWith("/") ? -1 : undefined);
	if (st == 0 && end == undefined) return src;
	return src.slice(st, end);
}
export function trimPrefix(source: string, prefix: string) {
	if (source.startsWith(prefix)) {
		return source.substring(prefix.length);
	}
	return source;
}

export function ancestorToTags(ancestors: string[]): string[] {
	return [...ancestors].reduce(
		(p, i) =>
			i[0] != "/"
				? [...p, i]
				: [
					...p,
					p.pop() +
					"/" +
					i.substring(1),
				],
		[] as string[]
	)
}

export function ancestorToLongestTag(ancestors: string[]): string[] {
	return ancestors.reduceRight((a: string[], e) => !a ? [e] : (a[0]?.startsWith(e) ? a : [e, ...a]), []);
}

export function isSpecialTag(tagSrc: string) {
	const tag = trimSlash(tagSrc);
	return tag == "_untagged" || tag in tagDispDict;
}

export function renderSpecialTag(tagSrc: string) {
	const tag = trimSlash(tagSrc);
	return tag in tagDispDict ? tagDispDict[tag] : tagSrc;
}


const queues = [] as (() => void)[];

export function waitForRequestAnimationFrame() {
	return new Promise<void>(res => requestAnimationFrame(() => res()));
}
function delay(num?: number) {
	return new Promise<void>(res => setTimeout(() => res(), num || 5));
}
function nextTick() {
	return new Promise<void>(res => setTimeout(() => res(), 0));
}

// This is based on nothing.
const waits = [nextTick, delay, nextTick, delay, delay, nextTick];//[waitForRequestAnimationFrame, nextTick, nextTick, nextTick, waitForRequestAnimationFrame, delay, delay, nextTick];
let waitIdx = 0;
let pumping = false;
let startContinuousProcessing = Date.now();

async function pump() {
	if (pumping) return;
	try {
		pumping = true;
		do {
			const proc = queues.shift();
			if (proc) {
				proc();
				const now = Date.now();
				if (now - startContinuousProcessing > 120) {
					const w = waits[waitIdx];
					waitIdx = (waitIdx + 1) % waits.length;
					await w();
					startContinuousProcessing = Date.now();
				}
			} else {
				break;
			}
		} while (true);
	} finally {
		pumping = false;
	}


}

// The message pump having ancient name.
export const doEvents = () => {

	return new Promise<void>(res => {
		const proc = () => {
			res();
		};
		queues.push(proc);
		void pump();
	})
}


export function compare(x: string, y: string) {
	return `${x || ""}`.localeCompare(y, undefined, { numeric: true })
}

/**
 * returns paths without intermediate paths.
 * i.e.) "test", "test/a" and "test/b/c" should be "test/a" and "test/b/c";
 *       However, "test", "test/a", "test/b/c", "test", should be "test/a", "test/b/c", "test"
 * @param paths array of path
 */
export function removeIntermediatePath(paths: string[]) {
	const passed = [] as string[];
	for (const v of paths) {
		const last = passed.pop();
		if (last !== undefined) {
			if (!(trimTrailingSlash(v.toLowerCase()) + "/").startsWith(trimTrailingSlash(last.toLowerCase()) + "/")) {
				// back to the stack
				passed.push(last);
			}
		}
		passed.push(v);
	}
	return passed.reverse();
}

export function escapeStringToHTML(str: string) {
	if (!str) return "";
	return str.replace(/[<>&"'`]/g, (match) => {
		const escape: Record<string, string> = {
			"<": "&lt;",
			">": "&gt;",
			"&": "&amp;",
			'"': "&quot;",
			"'": "&#39;",
			"`": "&#x60;",
		};
		return escape[match];
	});
}

export type V2FolderItem = [tag: string, tagName: string, tagNameDisp: string[], children: ViewItem[]];
export const V2FI_IDX_TAG = 0;
export const V2FI_IDX_TAGNAME = 1;
export const V2FI_IDX_TAGDISP = 2;
export const V2FI_IDX_CHILDREN = 3;


/**
 * Select compare methods for tags from configurations and tag information.
 * @param settings 
 * @returns 
 */
export function selectCompareMethodTags(settings: TagFolderSettings) {
	const invert = settings.sortTypeTag.contains("_DESC") ? -1 : 1;
	const pinnedFolders = settings.pinnedFolders ?? [];
	const subTreeChar: Record<typeof invert, string> = {
		[-1]: `\u{10ffff}`,
		[1]: `_`
	};
	// Pinned folders always sort to top, regardless of sort direction.
	const pinnedFirst = (aName: string, bName: string): number | null => {
		const aPinned = pinnedFolders.contains(aName);
		const bPinned = pinnedFolders.contains(bName);
		if (aPinned === bPinned) return null;
		return aPinned ? -1 : 1;
	};
	const sortByName = (a: V2FolderItem, b: V2FolderItem) => {
		const isASubTree = a[V2FI_IDX_TAGDISP][0] == "";
		const isBSubTree = b[V2FI_IDX_TAGDISP][0] == "";
		const aName = a[V2FI_IDX_TAGNAME];
		const bName = b[V2FI_IDX_TAGNAME];
		const pinned = pinnedFirst(aName, bName);
		if (pinned !== null) return pinned;
		const aPrefix = isASubTree ? subTreeChar[invert] : "";
		const bPrefix = isBSubTree ? subTreeChar[invert] : "";
		return compare(aPrefix + aName, bPrefix + bName) * invert;
	}
	switch (settings.sortTypeTag) {
		case "ITEMS_ASC":
		case "ITEMS_DESC":
			return (a: V2FolderItem, b: V2FolderItem) => {
				const aName = a[V2FI_IDX_TAGNAME];
				const bName = b[V2FI_IDX_TAGNAME];
				const pinned = pinnedFirst(aName, bName);
				if (pinned !== null) return pinned;
				const aCount = a[V2FI_IDX_CHILDREN].length;
				const bCount = b[V2FI_IDX_CHILDREN].length;
				if (aCount == bCount) return sortByName(a, b);
				return (aCount - bCount) * invert;
			}
		case "NAME_ASC":
		case "NAME_DESC":
			return sortByName
		default:
			console.warn("Compare method (tags) corrupted");
			return (a: V2FolderItem, b: V2FolderItem) => {
				const isASubTree = a[V2FI_IDX_TAGDISP][0] == "";
				const isBSubTree = b[V2FI_IDX_TAGDISP][0] == "";
				const aName = a[V2FI_IDX_TAGNAME];
				const bName = b[V2FI_IDX_TAGNAME];
				const aPrefix = isASubTree ? subTreeChar[invert] : "";
				const bPrefix = isBSubTree ? subTreeChar[invert] : "";
				return compare(aPrefix + aName, bPrefix + bName) * invert;
			}
	}
}

/**
 * Extracts unique set in case insensitive.
 * @param pieces 
 * @returns 
 */
export function uniqueCaseIntensive(pieces: string[]): string[] {
	const delMap = new Set<string>();
	const ret = [];
	for (const piece of pieces) {
		if (!delMap.has(piece.toLowerCase())) {
			ret.push(piece);
			delMap.add(piece.toLowerCase());
		}
	}
	return ret;
}

export function _sorterTagLength(a: string, b: string, invert: boolean) {
	const lenA = a.split("/").length;
	const lenB = b.split("/").length;
	const diff = lenA - lenB;
	if (diff != 0) return diff * (invert ? -1 : 1);
	return (a.length - b.length) * (invert ? -1 : 1);
}

export function getExtraTags(tags: string[], trail: string[]) {
	let tagsLeft = uniqueCaseIntensive(tags);
	const removeTrailItems = trail.sort((a, b) => _sorterTagLength(a, b, true));

	for (const t of removeTrailItems) {
		const trimLength = t.length;
		tagsLeft = tagsLeft.map((e) =>
			(e + "/").toLowerCase().startsWith(t.toLowerCase())
				? e.substring(trimLength)
				: e
		);
	}
	return tagsLeft.filter((e) => e.trim() != "");
}


export function trimTrailingSlash(src: string) {
	return trimSlash(src, true, false);
}

export function joinPartialPath(path: string[]) {
	return path.reduce((p, c) => (c.endsWith("/") && p.length > 0) ? [c + p[0], ...p.slice(1)] : [c, ...p], [] as string[]);
}

export function pathMatch(haystackLC: string, needleLC: string) {
	if (haystackLC == needleLC) return true;
	if (needleLC[needleLC.length - 1] == "/") {
		if ((haystackLC + "/").indexOf(needleLC) === 0) return true;
	}
	return false;
}

export function parseTagName(thisName: string): [string, string[]] {
	let tagNameDisp = [""];
	const names = thisName.split("/").filter((e) => e.trim() != "");
	let inSubTree = false;
	let tagName = "";
	if (names.length > 1) {
		tagName = `${names[names.length - 1]}`;
		inSubTree = true;
	} else {
		tagName = thisName;
	}
	if (tagName.endsWith("/")) {
		tagName = tagName.substring(0, tagName.length - 1);
	}
	tagNameDisp = [`${renderSpecialTag(tagName)}`];
	if (inSubTree)
		tagNameDisp = [``, `${renderSpecialTag(tagName)}`];

	return [tagName, tagNameDisp]
}


export function fileCacheToCompare(cache: FileCache | undefined | false) {
	if (!cache) return "";
	return ({ l: cache.links, t: cache.tags })
}

export function isSameObj<T extends string | number | string[]>(a: T, b: typeof a) {
	if (a === b) return true;
	if (typeof a == "string" || typeof a == "number") {
		return a == b;
	}
	if (a.length != (b as string[]).length) return false;
	const len = a.length;
	for (let i = 0; i < len; i++) {
		if (!isSameObj(a[i], (b as string[])[i])) return false;
	}
	return true;
}

const waitingProcess = new Map<string, () => Promise<unknown>>();
const runningProcess = new Set<string>();



export async function scheduleOnceIfDuplicated<T>(key: string, proc: () => Promise<T>): Promise<void> {
	if (runningProcess.has(key)) {
		waitingProcess.set(key, proc);
		return;
	}
	try {
		runningProcess.add(key);
		await delay(3);
		if (waitingProcess.has(key)) {
			const nextProc = waitingProcess.get(key)!;
			waitingProcess.delete(key);
			runningProcess.delete(key);
			return scheduleOnceIfDuplicated(key, nextProc);
		} else {
			//console.log(`run!! ${key}`);
			await proc();
		}
	}
	finally {
		runningProcess.delete(key);
	}

}

export function isSameAny(a: unknown, b: unknown) {
	if (typeof a != typeof b) return false;
	switch (typeof a) {
		case "string":
		case "number":
		case "bigint":
		case "boolean":
		case "symbol":
		case "function":
		case "undefined":
			return a == b;
		case "object":
			if (a === b) return true;
			if (a instanceof Map || a instanceof Set) {
				if (a.size != (b as typeof a).size) return false;
				const v = [...a]
				const w = [...(b as typeof a)];
				for (let i = 0; i < v.length; i++) {
					if (v[i] != w[i]) return false;
				}
				return true;
			}
			if (Array.isArray(a)) {
				for (let i = 0; i < a.length; i++) {
					if (!isSameAny(a[i], (b as typeof a)[i])) return false;
				}
				return true;
			}
			{
				const x = Object.values(a!);
				const y = Object.values(b!);
				if (x.length != y.length) return false;
				for (let i = 0; i < x.length; i++) {
					if (!isSameAny(x[i], y[i])) return false;
				}
				return true;
			}
		default:
			return false;
	}

}
