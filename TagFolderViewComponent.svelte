<script lang="ts">
	import {
		allViewItems,
		appliedFiles,
		performHide,
		searchString,
		tagFolderSetting,
		v2expandedTags,
	} from "./store";
	import {
		type ViewItem,
		type TagFolderSettings,
	} from "./types";
	import V2TreeFolderComponent from "./V2TreeFolderComponent.svelte";
	import { onDestroy, onMount } from "svelte";
	import { Menu, setIcon } from "obsidian";
	import { trimTrailingSlash } from "./util";
	import { setContext } from "svelte";
	interface Props {
		hoverPreview: (e: MouseEvent, path: string) => void;
		openFile: (path: string, specialKey: boolean) => void;
		vaultName?: string;
		title?: string;
		tags?: string[];
		saveSettings: (setting: TagFolderSettings) => Promise<void>;
		showMenu: (
			evt: MouseEvent,
			trail: string[],
			targetTag?: string,
			targetItems?: ViewItem[],
		) => void;
		showOrder: (evt: MouseEvent) => void;
	}

	let {
		hoverPreview,
		openFile,
		vaultName = "",
		title = $bindable<string>(""),
		tags = $bindable<string[]>([]),
		saveSettings,
		showMenu,
		showOrder,
	}: Props = $props();

	const isMainTree = $derived(tags.length == 0);

	let updatedFiles = $state([] as string[]);
	appliedFiles.subscribe(async (filenames) => {
		updatedFiles = filenames ?? [];
	});

	const viewItemsSrc = $derived.by(() => {
		return $allViewItems;
	});

	let _setting = $state($tagFolderSetting as TagFolderSettings);
	tagFolderSetting.subscribe((setting) => {
		_setting = setting;
	});

	let showSearch = $state(false);
	$effect(() => {
		if ($searchString !== "") {
			showSearch = true;
		}
	});
	function toggleSearch() {
		showSearch = !showSearch;
		if (!showSearch) {
			$searchString = "";
		}
	}
	function clearSearch() {
		$searchString = "";
		showSearch = false;
	}

	let iconDivEl = $state<HTMLDivElement>();
	let folderIcon = $state("");
	let folderOpenIcon = $state("");
	let fileIcon = $state("");
	let upAndDownArrowsIcon = $state("");
	let searchIcon = $state("");
	let closeAllIcon = $state("");
	let namespaceGuardIcon = $state("");
	let filterDepthIcon = $state("");
	let hideIntermediatesIcon = $state("");

	let observer: IntersectionObserver | undefined;

	type handler = {
		callback: (visibility: boolean) => void;
		lastState: boolean | undefined;
	};

	let observingElements = new Map<Element, handler>();
	let scrollParent: HTMLDivElement | undefined;
	let observingElQueue = [] as Element[];

	function observe(el: Element, callback: (visibility: boolean) => void) {
		if (!observer) {
			observingElQueue.push(el);
		} else {
			if (observingElQueue.length > 0) {
				observeAllQueued();
			}
		}
		if (observingElements.has(el)) {
			unobserve(el);
			observingElements.delete(el);
		}
		observingElements.set(el, { callback, lastState: undefined });
		observer?.observe(el);
	}
	function unobserve(el: Element) {
		observer?.unobserve(el);
	}

	function observeAllQueued() {
		observingElQueue.forEach((el) => {
			observer?.observe(el);
		});
		observingElQueue = [];
	}

	setContext("observer", {
		observe,
		unobserve,
	});
	onMount(() => {
		const observingOption = {
			root: scrollParent,
			rootMargin: "40px 0px",
			threshold: 0,
		};
		observer = new IntersectionObserver((ex) => {
			for (const v of ex) {
				if (observingElements.has(v.target)) {
					const tg = observingElements.get(v.target);
					if (tg && tg.lastState !== v.isIntersecting) {
						tg.lastState = v.isIntersecting;
						setTimeout(() => tg.callback(v.isIntersecting), 10);
					}
				}
			}
		}, observingOption);
		observeAllQueued();
		if (iconDivEl) {
			setIcon(iconDivEl, "lucide-folder");
			folderIcon = `${iconDivEl.innerHTML}`;
			setIcon(iconDivEl, "lucide-folder-open");
			folderOpenIcon = `${iconDivEl.innerHTML}`;
			setIcon(iconDivEl, "lucide-file");
			fileIcon = `${iconDivEl.innerHTML}`;
			if (isMainTree) {
				setIcon(iconDivEl, "lucide-sort-asc");
				upAndDownArrowsIcon = iconDivEl.innerHTML;
				setIcon(iconDivEl, "search");
				searchIcon = iconDivEl.innerHTML;
				setIcon(iconDivEl, "lucide-filter");
				namespaceGuardIcon = iconDivEl.innerHTML;
				setIcon(iconDivEl, "lucide-layers");
				filterDepthIcon = iconDivEl.innerHTML;
				setIcon(iconDivEl, "lucide-folder-minus");
				hideIntermediatesIcon = iconDivEl.innerHTML;
			}
			setIcon(iconDivEl, "lucide-chevrons-down-up");
			closeAllIcon = iconDivEl.innerHTML;
		}
		const int = setInterval(() => {
			performHide.set(Date.now());
		}, 5000);

		return () => {
			clearInterval(int);
		};
	});
	onDestroy(() => {
		observer?.disconnect();
	});
	const viewItems = $derived.by(() => {
		if (!viewItemsSrc) {
			return [];
		}
		if (isMainTree) {
			return viewItemsSrc;
		}

		let items = viewItemsSrc;
		const lowerTags = tags.map((e) => e.toLowerCase());
		for (const tag of lowerTags) {
			items = items.filter((e) =>
				e.tags.some((e) => (e.toLowerCase() + "/").startsWith(tag)),
			);
		}

		const firstLevel = trimTrailingSlash(tags.first() ?? "").toLowerCase();

		// Processing archive tags
		const archiveTags = _setting.archiveTags
			.toLowerCase()
			.replace(/[\n ]/g, "")
			.split(",");

		if (!archiveTags.contains(firstLevel)) {
			items = items.filter(
				(item) =>
					!item.tags.some((e) =>
						archiveTags.contains(e.toLowerCase()),
					),
			);
		}
		return items;
	});

	const componentHash = `${Math.random()}`;
	setContext("viewID", componentHash);

	function closeAllOpenedFolders() {
		v2expandedTags.update((prev) => {
			prev.clear();
			return prev;
		});
	}

	async function toggleNamespaceGuard() {
		await saveSettings({ ..._setting, namespacedTagGuard: !_setting.namespacedTagGuard });
	}

	async function toggleSimplifyTags() {
		await saveSettings({ ..._setting, doNotSimplifyTags: !_setting.doNotSimplifyTags });
	}

	function showFilterDepth(evt: MouseEvent) {
		const menu = new Menu();
		const setDepth = async (depth: number) => {
			await saveSettings({ ..._setting, filterFolderDepth: depth });
		};
		for (const depth of [1, 2, 3]) {
			menu.addItem((item) => {
				item.setTitle(`Level ${depth}`).onClick(() => void setDepth(depth));
				if (_setting.filterFolderDepth === depth) item.setIcon("checkmark");
				return item;
			});
		}
		menu.addItem((item) => {
			item.setTitle("All levels").onClick(() => void setDepth(0));
			if (_setting.filterFolderDepth === 0) item.setIcon("checkmark");
			return item;
		});
		menu.showAtMouseEvent(evt);
	}
</script>

<div hidden bind:this={iconDivEl}></div>
<div class="nav-header">
	<div class="nav-buttons-container tagfolder-buttons-container">
		{#if isMainTree}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="clickable-icon nav-action-button"
				aria-label="Change sort order"
				onclick={showOrder}
			>
				{@html upAndDownArrowsIcon}
			</div>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class={`clickable-icon nav-action-button ${showSearch ? " is-active" : ""}`}
				aria-label="Search"
				onclick={toggleSearch}
			>
				{@html searchIcon}
			</div>
		{/if}
		{#if isMainTree}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class={`clickable-icon nav-action-button${_setting.namespacedTagGuard ? " is-active" : ""}`}
				aria-label="Namespace-scoped sub-folders"
				onclick={toggleNamespaceGuard}
			>
				{@html namespaceGuardIcon}
			</div>
		{/if}
		{#if isMainTree && !_setting.namespacedTagGuard}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="clickable-icon nav-action-button"
				aria-label="Filter folder depth"
				onclick={showFilterDepth}
			>
				{@html filterDepthIcon}
			</div>
		{/if}
		{#if isMainTree}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class={`clickable-icon nav-action-button${!_setting.doNotSimplifyTags ? " is-active" : ""}`}
				aria-label="Compact empty parent folders"
				onclick={toggleSimplifyTags}
			>
				{@html hideIntermediatesIcon}
			</div>
		{/if}
		{#if isMainTree}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="clickable-icon nav-action-button"
				aria-label="Collapse all"
				onclick={closeAllOpenedFolders}
			>
				{@html closeAllIcon}
			</div>
		{/if}
	</div>
</div>
{#if showSearch && isMainTree}
	<div class="search-row">
		<div class="search-input-container global-search-input-container">
			<input
				type="search"
				spellcheck="false"
				placeholder="Type to start search..."
				bind:value={$searchString}
			/>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="search-input-clear-button"
				aria-label="Clear search"
				style="display:{$searchString.trim() == '' ? 'none' : ''};"
				onclick={clearSearch}
			></div>
		</div>
	</div>
{/if}
<div class="nav-files-container node-insert-event" bind:this={scrollParent}>
	<V2TreeFolderComponent
		items={viewItems}
		{folderIcon}
		{folderOpenIcon}
		{fileIcon}
		thisName={""}
		isRoot={true}
		{showMenu}
		{openFile}
		{isMainTree}
		{hoverPreview}
		depth={1}
	/>
</div>

<style>
	.nav-files-container {
		height: 100%;
	}
</style>
