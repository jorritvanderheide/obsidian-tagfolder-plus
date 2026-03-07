import { writable } from "svelte/store";
import { DEFAULT_SETTINGS, type TagFolderSettings, type ViewItem } from "types";
import type TagFolderPlugin from "./main";

// V1
export const currentFile = writable<string>("");

export const searchString = writable<string>("");

export const tagFolderSetting = writable<TagFolderSettings>(DEFAULT_SETTINGS);

// V2
export const allViewItems = writable<ViewItem[]>();
export const appliedFiles = writable<string[]>();
export const v2expandedTags = writable(new Set<string>());

export const performHide = writable(0);

export const pluginInstance = writable<TagFolderPlugin | undefined>(undefined);
