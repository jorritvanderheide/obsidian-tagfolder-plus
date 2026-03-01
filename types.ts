import type { TFile } from "obsidian";
import { type DISPLAY_METHOD, type HIDE_ITEMS_TYPE } from "./main";

export interface ViewItem {
	/**
	 * Historical reason, `tags` consists the list of either tag or link.
	 */
	tags: string[];
	extraTags: string[];
	path: string;
	displayName: string;
	ancestors: string[];
	mtime: number;
	ctime: number;
	filename: string;
}
export interface TagInfoDict {
	[key: string]: TagInfo;
}
export interface TagInfo {
	key?: string;
	mark?: string;
	alt?: string;
	redirect?: string;
}


export const enumShowListIn = {
	"": "Sidebar",
	"CURRENT_PANE": "Current pane",
	"SPLIT_PANE": "New pane",
}

export interface TagFolderSettings {
	displayMethod: DISPLAY_METHOD;
	alwaysOpen: boolean;
	ignoreDocTags: string;
	ignoreTags: string;
	ignoreFolders: string;
	targetFolders: string;
	hideOnRootTags: string;
	sortType: "DISPNAME_ASC" |
	"DISPNAME_DESC" |
	"NAME_ASC" |
	"NAME_DESC" |
	"MTIME_ASC" |
	"MTIME_DESC" |
	"CTIME_ASC" |
	"CTIME_DESC" |
	"FULLPATH_ASC" |
	"FULLPATH_DESC";
	sortExactFirst: boolean;
	sortTypeTag: "NAME_ASC" | "NAME_DESC" | "ITEMS_ASC" | "ITEMS_DESC";
	expandLimit: number;

	hideItems: HIDE_ITEMS_TYPE;
	scanDelay: number;
	useTitle: boolean;
	reduceNestedParent: boolean;
	frontmatterKey: string;
	useTagInfo: boolean;
	tagInfo: string;
	mergeRedundantCombination: boolean;
	namespacedTagGuard: boolean;
	useFrontmatterTagsForNewNotes: boolean,
	doNotSimplifyTags: boolean;
	overrideTagClicking: boolean;
	useMultiPaneList: boolean;
	archiveTags: string;
	expandUntaggedToRoot: boolean;
	disableDragging: boolean;
	pinnedFolders: string[];
	showListIn: keyof typeof enumShowListIn;
}

export const DEFAULT_SETTINGS: TagFolderSettings = {
	displayMethod: "NAME",
	alwaysOpen: false,
	ignoreDocTags: "",
	ignoreTags: "",
	hideOnRootTags: "",
	sortType: "DISPNAME_ASC",
	sortExactFirst: false,
	sortTypeTag: "NAME_ASC",
	expandLimit: 0,
	hideItems: "NONE",
	ignoreFolders: "",
	targetFolders: "",
	scanDelay: 250,
	useTitle: true,
	reduceNestedParent: true,
	frontmatterKey: "title",
	useTagInfo: false,
	tagInfo: ".pininfo.md",
	mergeRedundantCombination: false,
	namespacedTagGuard: true,
	useFrontmatterTagsForNewNotes: false,
	doNotSimplifyTags: false,
	overrideTagClicking: false,
	useMultiPaneList: false,
	archiveTags: "",
	expandUntaggedToRoot: false,
	disableDragging: false,
	pinnedFolders: [],
	showListIn: "",
};

export const tagDispDict: { [key: string]: string } = {
	_VIRTUAL_TAG_CANVAS: "📋 Canvas",
};

export const VIEW_TYPE_TAGFOLDER = "tagfolder-view";
export const VIEW_TYPE_TAGFOLDER_LIST = "tagfolder-view-list";
export type TREE_TYPE = "tags";

export const OrderKeyTag: Record<string, string> = {
	NAME: "Tag name",
	ITEMS: "Count of items",
};
export const OrderDirection: Record<string, string> = {
	ASC: "Ascending",
	DESC: "Descending",
};
export const OrderKeyItem: Record<string, string> = {
	DISPNAME: "Displaying name",
	NAME: "File name",
	MTIME: "Modified time",
	CTIME: "Created time",
	FULLPATH: "Fullpath of the file",
};


export type TagFolderListState = {
	tags: string[];
	title: string;
}


export type FileCache = {
	file: TFile;
	links: string[];
	tags: string[];
}
