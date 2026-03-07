import type { TagFolderSettings, ViewItem } from "./types";
import {
	V2FI_IDX_CHILDREN,
	type V2FolderItem,
	trimPrefix,
	parseTagName,
	pathMatch,
	getExtraTags,
	V2FI_IDX_TAG,
	V2FI_IDX_TAGNAME,
	V2FI_IDX_TAGDISP,
	waitForRequestAnimationFrame,
	getRootNamespace,
	matchesArchiveTag,
} from "./util";

function delay() {
	return new Promise<void>((res) => setTimeout(() => res(), 5));
}
function nextTick() {
	return new Promise<void>((res) => setTimeout(() => res(), 0));
}
const delays = [nextTick, delay, nextTick, waitForRequestAnimationFrame];
let delayIdx = 0;
export async function collectChildren(
	previousTrail: string,
	tags: string[],
	_items: ViewItem[]
) {
	const previousTrailLC = previousTrail.toLowerCase();

	const children: V2FolderItem[] = [];
	const tagPerItem = new Map<string, ViewItem[]>();
	const lowercaseMap = new Map<string, string>();
	for (const item of _items) {
		const itemTags = item.tags;
		itemTags.forEach((itemTag) => {
			const tagLc = lowercaseMap.get(itemTag) ?? lowercaseMap.set(itemTag, itemTag.toLowerCase()).get(itemTag)!;
			if (!tagPerItem.has(tagLc)) tagPerItem.set(tagLc, []);
			tagPerItem.get(tagLc)!.push(item);
		});
	}
	for (const tag of tags) {
		const tagLC = tag.toLowerCase();
		const tagNestedLC = trimPrefix(tagLC, previousTrailLC);
		const items: ViewItem[] = [];
		for (const [itemTag, tempItems] of tagPerItem) {
			if (pathMatch(itemTag, tagLC)) {
				items.push(...tempItems);
			} else if (pathMatch(itemTag, tagNestedLC)) {
				items.push(...tempItems);
			}
		}
		children.push([tag, ...parseTagName(tag), [...new Set(items)]]);
		// Prevent UI freezing.
		delayIdx++;
		delayIdx %= 4;
		await delays[delayIdx]();
	}
	return children;
}

export async function collectTreeChildren({
	key,
	expandLimit,
	depth,
	tags,
	keepFolderTags,
	trailLower,
	_setting,
	isMainTree,
	isSuppressibleLevel,
	previousTrail,
	_items,
	isRoot,
	sortFunc,
}: {
	key: string;
	expandLimit: number;
	depth: number;
	tags: string[];
	keepFolderTags?: string[];
	trailLower: string[];
	_setting: TagFolderSettings;
	isMainTree: boolean;
	isSuppressibleLevel: boolean;
	previousTrail: string;
	_items: ViewItem[];
	isRoot: boolean;
	sortFunc: (a: V2FolderItem, b: V2FolderItem) => number;
}): Promise<{ suppressLevels: string[]; children: V2FolderItem[] }> {
	let suppressLevels: string[] = []; // This will be shown as chip.
	let children: V2FolderItem[] = [];
	if (expandLimit && depth >= expandLimit) {
		// If expand limit had been configured and we have reached it,
		// suppress sub-folders and show that information as extraTags.
		children = [];
		suppressLevels = getExtraTags(tags, trailLower);
	} else if (!isMainTree) {
		// If not in main tree, suppress sub-folders.
		children = [];
	} else if (isSuppressibleLevel) {
		// If we determined it was a suppressible,
		// suppress sub-folders and show that information as extraTags.
		children = [];
		suppressLevels = getExtraTags(tags, trailLower);
		// When guard is OFF, also build sub-folders for cross-namespace tags
		// so they appear on the collapsed leaf node (e.g., source/ on "domain/coding/git").
		if (keepFolderTags && keepFolderTags.length > 0) {
			const extraChildren = await collectChildren(previousTrail, keepFolderTags, _items);
			const out: V2FolderItem[] = [];
			const shownPaths = new Set<string>();
			for (const [tag, tagName, tagDisp, items] of extraChildren) {
				const list = items.filter((v) => !shownPaths.has(v.path) && (shownPaths.add(v.path), true));
				if (list.length > 0) out.push([tag, tagName, tagDisp, list]);
			}
			children = out.sort(sortFunc);
		}
	} else {
		let wChildren = [] as V2FolderItem[];
		wChildren = await collectChildren(previousTrail, tags, _items);

		// Deduplicate items across tag orderings, per namespace.
		const out = [] as typeof wChildren;
		const isShownByNamespace = new Map<string, Set<string>>();
		for (const [tag, tagName, tagsDisp, items] of wChildren) {
			const namespace = getRootNamespace(tag);
			if (!isShownByNamespace.has(namespace)) {
				isShownByNamespace.set(namespace, new Set<string>());
			}
			const isShown = isShownByNamespace.get(namespace)!;
			const list = [] as ViewItem[];
			for (const v of items) {
				if (!isShown.has(v.path)) {
					list.push(v);
					isShown.add(v.path);
				}
			}
			if (list.length != 0) out.push([tag, tagName, tagsDisp, list]);
		}
		wChildren = out;

		// -- MainTree and Root specific structure modification.
		if (isMainTree && isRoot) {
			// Remove all items which have been already archived except is on the root.

			const archiveTags = _setting.archiveTags.toLowerCase().replace(/[\n ]/g, "").split(",");
			const itemMatchesAnyArchive = (item: ViewItem) =>
				item.tags.some(tag => archiveTags.some(a => a !== "" && matchesArchiveTag(tag.toLowerCase(), a)));
			wChildren = wChildren
				.map((e) =>
					archiveTags.some((aTag) =>
						aTag !== "" && (
							`${aTag}//`.startsWith(e[V2FI_IDX_TAG].toLowerCase() + "/") ||
							aTag.split("/").pop() === e[V2FI_IDX_TAG].toLowerCase() ||
							e[V2FI_IDX_CHILDREN].some(item => item.tags.some(t => matchesArchiveTag(t.toLowerCase(), aTag)))
						)
					)
						? e
						: ([
								e[V2FI_IDX_TAG],
								e[V2FI_IDX_TAGNAME],
								e[V2FI_IDX_TAGDISP],
								e[V2FI_IDX_CHILDREN].filter(item => !itemMatchesAnyArchive(item)),
							] as V2FolderItem)
				)
				.filter((child) => child[V2FI_IDX_CHILDREN].length != 0);
		}
		wChildren = wChildren.sort(sortFunc);
		children = wChildren;
	}
	return { suppressLevels, children };
}
