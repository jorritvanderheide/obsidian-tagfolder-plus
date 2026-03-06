<script lang="ts">
    import V2TreeFolderComponent from "./V2TreeFolderComponent.svelte";
    //TODO Add Comments for details
    import {
        type TagFolderSettings,
        type ViewItem,
    } from "types";
    import {
        renderSpecialTag,
        escapeStringToHTML,
        selectCompareMethodTags,
        joinPartialPath,
        removeIntermediatePath,
        trimTrailingSlash,
        uniqueCaseIntensive,
        type V2FolderItem,
        V2FI_IDX_CHILDREN,
        trimSlash,
        ancestorToLongestTag,
        ancestorToTags,
        isSpecialTag,
        unique,
        _isSameViewItem,
        scheduleOnceIfDuplicated,
        isSameAny,
    } from "./util";
    import {
        currentFile,
        pluginInstance,
        selectedTags,
        tagFolderSetting,
        v2expandedTags,
    } from "./store";
    import { collectTreeChildren, performSortExactFirst } from "./v2codebehind";
    import TreeItemItemComponent from "V2TreeItemComponent.svelte";
    import OnDemandRender from "OnDemandRender.svelte";
    import { getContext } from "svelte";
    import { setIcon } from "obsidian";

    interface Props {
        // -- Props --
        // Name of this tag, including intermediate levels if we are inside.
        thisName?: string;
        // **Be careful**: Please keep the order of this. This should be already sorted.
        items?: ViewItem[];
        // Name of this tag, we can use it to sort or something.
        tagName?: string;
        // Convert tagName to display,
        tagNameDisp?: string[];
        // The trail that we have passed.
        trail?: string[];
        // If it is the root.
        isRoot: boolean;
        // A.k.a `is not a list`.
        isMainTree: boolean;
        // The depth of this node; is not incremented inside the nested tag.
        depth?: number;
        // Icons (Just for layout)
        folderIcon?: string;
        folderOpenIcon?: string;
        fileIcon?: string;
        // -- Callbacks --
        showMenu: (
            evt: MouseEvent,
            trail: string[],
            targetTag?: string,
            targetItems?: ViewItem[],
        ) => void;
        openFile: (path: string, specialKey: boolean) => void;
        hoverPreview: (e: MouseEvent, path: string) => void;
    }

    let {
        thisName = "",
        items = [] as ViewItem[],
        tagName = $bindable(""),
        tagNameDisp = $bindable([] as string[]),
        trail = [] as string[],
        isRoot,
        isMainTree,
        depth = 1,
        folderIcon = "",
        folderOpenIcon = "",
        fileIcon = "",
        showMenu,
        openFile,
        hoverPreview,
    }: Props = $props();

    // Watch them to realise the configurations to display immediately
    let _setting = $derived($tagFolderSetting as TagFolderSettings);
    const expandLimit = $derived(
        !_setting.expandLimit ? 0 : _setting.expandLimit,
    );

    // To Highlight active things.
    const _currentActiveFilePath = $derived($currentFile);

    // Event handlers

    function shouldResponsibleFor(evt: MouseEvent) {
        if (
            evt.target instanceof Element &&
            evt.target.matchParent(
                ".is-clickable.mod-collapsible.nav-folder-title",
            )
        ) {
            return true;
        }
        return false;
    }

    function toggleFolder(evt: MouseEvent) {
        evt.stopPropagation();
        if (shouldResponsibleFor(evt)) {
            evt.preventDefault();
            // Do not toggle this tree directly.
            if (_setting.useMultiPaneList) {
                selectedTags.set(trail);
            }
            v2expandedTags.update((evt) => {
                if (evt.has(trailKey)) {
                    evt.delete(trailKey);
                } else {
                    evt.add(trailKey);
                }
                return evt;
            });
        }
    }

    // All tags that this node have.
    // let tags = $state([] as string[]);

    // Dedicated tag -- Nested tags -- handling
    // let isInDedicatedTag = $state(false);
    // let previousTrail = $state("");

    // To suppress empty folders
    // let isSuppressibleLevel = $state(false);
    let suppressLevels = $state([] as string[]);

    // Sub-folders
    let children = $state([] as V2FolderItem[]);
    // Sub-folders for display (Used for phased UI update)
    // let childrenDisp = $state([] as V2FolderItem[][]);

    // Items on this level; which had not been contained in sub-trees.
    // **Be careful**: Please keep the order of this. This should be also already sorted.
    // let leftOverItems = $state([] as ViewItem[]);
    // and for display
    // let leftOverItemsDisp = $state([] as ViewItem[][]);

    // Current tag name for display.
    // let tagsDisp = $state([] as string[][]);

    // --> Dirty area
    // Collect sub-folders.
    let isUpdating = $state(false);

    let _lastParam: any;
    function updateX(
        param: Parameters<typeof collectTreeChildren>[0] & {
            isFolderVisible: boolean;
        },
    ) {
        if (isSameAny(param, _lastParam)) {
            return;
        }
        _lastParam = { ...param };
        if (!param.isFolderVisible && !isRoot) {
            // console.log("invisible!");
            return;
        }

        scheduleOnceIfDuplicated("update-children-" + param.key, async () => {
            isUpdating = true;
            const ret = await collectTreeChildren(param);
            children = ret.children;
            suppressLevels = ret.suppressLevels;
            isUpdating = false;
        });
    }
    const viewContextID = `${getContext("viewID") ?? ""}`;

    let isFolderVisible = $state(false);

    // -- Phased UI update --

    // For preventing UI freezing, split items into batches and apply them at intervals.
    const batchSize = 80;
    function splitArrayToBatch<T>(items: T[]): T[][] {
        // let batchSize = Math.min(20, ~~(items.length / 40));
        const ret = [] as T[][];
        if (items && items.length > 0) {
            const applyItems = [...items];
            do {
                const batch = applyItems.splice(0, batchSize);
                if (batch.length == 0) {
                    break;
                }
                ret.push(batch);
                if (batch.length < batchSize) {
                    break;
                }
            } while (applyItems.length > 0);
        }
        return ret;
    }

    function dragStartName(args: DragEvent) {
        if (!draggable) return;
        const expandedTagsAll = [
            ...ancestorToLongestTag(
                ancestorToTags(
                    joinPartialPath(
                        removeIntermediatePath([...trail, ...suppressLevels]),
                    ),
                ),
            ),
        ].map((e) => trimTrailingSlash(e));
        const expandedTags = expandedTagsAll
            .map((e) =>
                e
                    .split("/")
                    .filter((ee) => !isSpecialTag(ee))
                    .join("/"),
            )
            .filter((e) => e != "")
            .map((e) => "#" + e)
            .join(" ")
            .trim();
        (args as any).dataTransfer.setData("text/plain", expandedTags);
        (args as any).dataTransfer.setData("Text", expandedTags);
        (args as any).title = expandedTags;
        (args as any).draggable = true;

        dm.onDragStart(args, args);
    }


    // --> Self information
    const thisNameLC = $derived(thisName.toLowerCase());
    const tagNameLC = $derived(tagName.toLowerCase());
    // <-- Self information


    // --> How this tag were shown
    const trailKey = $derived(trail.join("*"));
    const trailLower = $derived(trail.map((e) => e.toLowerCase()));

    // <-- How this tag were shown

    // --> is this tag collapsed?
    const collapsed = $derived(!isRoot && !$v2expandedTags.has(trailKey));
    // <-- is this tag collapsed?

    // --> Where were this tag shown?
    /// This means the tag is not on the root, and not om the bottom.
    const inMiddleOfTagHierarchy = $derived(
        trail.length >= 1 && trail[trail.length - 1].endsWith("/"),
    );
    const previousTrail = $derived(
        inMiddleOfTagHierarchy ? trail[trail.length - 1] : "",
    );
    const lastTrailTagLC = $derived(
        trimTrailingSlash(previousTrail).toLowerCase(),
    );

    // <-- Where were this tag shown?

    // -->

    // Cached items
    const _items = $derived(items);

    // All tags in this level (Case insensitively unique)
    const tagsAllCI = $derived(
        uniqueCaseIntensive(_items.flatMap((e) => e.tags)),
    );
    // And them in lower case
    const tagsAllLower = $derived(tagsAllCI.map((e) => e.toLowerCase()));

    // Is this tag in dedicated tag?
    const isInDedicatedTag = $derived(
        inMiddleOfTagHierarchy && !tagsAllLower.contains(lastTrailTagLC),
    );

    // Is this tag consisted of dedicated tag and normal tag?
    // It means there are both of `a/b` and `a`.
    const isMixedDedicatedTag = $derived(inMiddleOfTagHierarchy);

    const displayTagCandidates = $derived.by(() => {
        let tagsAll = [] as string[];
            tagsAll = uniqueCaseIntensive(_items.flatMap((e) => e.tags));
            if (!isRoot || _setting.expandUntaggedToRoot) {
                tagsAll = tagsAll.filter((e) => e != "_untagged");
            }
            // Namespace guard: inside a non-root folder, only show tags from the
            // same root namespace (e.g., inside source/, never show area/*).
            if (!isRoot && trail.length > 0 && _setting.namespacedTagGuard) {
                const rootNS = trail[0].split("/")[0].toLowerCase();
                if (rootNS) {
                    tagsAll = tagsAll.filter((tag) => {
                        const lc = tag.toLowerCase();
                        return lc === rootNS || lc.startsWith(rootNS + "/");
                    });
                }
            }
        return tagsAll;
    });
    const tagsExceptAlreadyShown = $derived(
        displayTagCandidates.filter((tag) =>
            trail.every(
                (trail) =>
                    trimTrailingSlash(tag.toLowerCase()) !==
                    trimTrailingSlash(trail.toLowerCase()),
            ),
        ),
    );
    const passedTagWithoutThis = $derived.by(
        ()=>{
            const trimSlashedThisNameLC = "/"+trimSlash(thisName).toLowerCase();
        return tagsExceptAlreadyShown
            .filter(
                (tag) =>{
                    const lc = tag.toLowerCase();
                    return lc != thisNameLC && lc != tagNameLC;
                }
            )
            .filter(
                (tag) =>
                    !tag
                        .toLowerCase()
                        .endsWith(trimSlashedThisNameLC),
            );
        }
    );
    const escapedPreviousTrail = $derived(
        !isMixedDedicatedTag
            ? previousTrail
            : previousTrail.split("/").join("*"),
    );
    const sparseIntermediateTags = $derived.by(() => {
        const t1 = !isInDedicatedTag?passedTagWithoutThis:passedTagWithoutThis.filter(
            (e) => (e + "/").startsWith(previousTrail),
        );
        if(!isInDedicatedTag) return t1;
        return t1.map((e) =>
          (e + "/").startsWith(previousTrail)? escapedPreviousTrail + e.substring(previousTrail.length): e,
        );
    });

    const tagsPhaseX1 = $derived(sparseIntermediateTags);

    const { filteredTags, isSuppressibleLevel } = $derived.by(() => {
        let isSuppressibleLevel = false;
        let existTags = tagsPhaseX1;
        let existTagsFiltered1 = [] as string[];
        if (!_setting.doNotSimplifyTags) {
            // If the note has only one item. it can be suppressible.
            if (_items.length == 1) {
                existTagsFiltered1 = existTags;
                isSuppressibleLevel = true;
            } else {
                // All tags under this note are the same. it can be suppressible
                const allChildTags = uniqueCaseIntensive(
                    _items.map((e) => [...e.tags].sort().join("**")),
                );
                if (allChildTags.length == 1) {
                    isSuppressibleLevel = true;
                    existTagsFiltered1 = existTags;
                }
            }
        }
        if (!isSuppressibleLevel) {
            // Collect tags and pieces of nested tags, for preparing a list of
            // tags (or subsequent part of nested-tag) on the next level.

            // At least, this tag name should be trimmed.
            const removeItems = [thisNameLC];
            if (_setting.reduceNestedParent) {
                // If reduceNestedParent is enabled, passed trails also should be trimmed.
                removeItems.push(...trailLower);
            }
            const tagsOnNextLevel = uniqueCaseIntensive(
                existTags.map((e) => {
                    const idx = e.indexOf("/");
                    if (idx < 1) return e;
                    let piece = e.substring(0, idx + 1);
                    let idx2 = idx;
                    while (
                        removeItems.some((e) =>
                            e.startsWith(piece.toLowerCase()),
                        )
                    ) {
                        idx2 = e.indexOf("/", idx2 + 1);
                        if (idx2 === -1) {
                            piece = e;
                            break;
                        }
                        piece = e.substring(0, idx2 + 1);
                    }
                    return piece;
                }),
            );
            const trailShortest = removeIntermediatePath(trail);
            existTagsFiltered1 = tagsOnNextLevel.filter((tag) =>
                // Remove tags which in trail again.
                trailShortest.every(
                    (trail) =>
                        trimTrailingSlash(tag.toLowerCase()) !==
                        trimTrailingSlash(trail.toLowerCase()),
                ),
            );
        }
        if (isMixedDedicatedTag || isInDedicatedTag) {
            existTagsFiltered1 = existTagsFiltered1.map((e) =>
                e.replace(escapedPreviousTrail, previousTrail),
            );
        }
        if (isMixedDedicatedTag || isInDedicatedTag) {
            existTagsFiltered1 = existTagsFiltered1.map((e) =>
                e.replace(escapedPreviousTrail, previousTrail),
            );
        }

        // Merge the tags of dedicated tag and normal tag
        const existTagsFiltered1LC = existTagsFiltered1.map((e) =>
            e.toLowerCase(),
        );
        const existTagsFiltered2 = existTagsFiltered1.map((e) =>
            existTagsFiltered1LC.contains(e.toLowerCase() + "/") ? e + "/" : e,
        );
        const existTagsFiltered3 = uniqueCaseIntensive(existTagsFiltered2);

        return { filteredTags: existTagsFiltered3, isSuppressibleLevel };
    });

    const { tags, leftOverItemsSrc } = $derived.by(() => {
        let tags = [] as string[];
        const leftOverItemsSrc = [] as ViewItem[];
        if (!_items) return { tags, leftOverItemsSrc };
        if (
            !(
                isMainTree &&
                (!expandLimit || (expandLimit && depth < expandLimit))
            )
        ) {
            return { tags, leftOverItemsSrc };
        }

        if (previousTrail.endsWith("/")) {
            const existTagsFiltered4 = [] as string[];
            for (const tag of filteredTags) {
                if (
                    !filteredTags
                        .map((e) => e.toLowerCase())
                        .contains((previousTrail + tag).toLowerCase())
                ) {
                    existTagsFiltered4.push(tag);
                }
            }
            tags = uniqueCaseIntensive(
                removeIntermediatePath(existTagsFiltered4),
            );
        } else {
            tags = uniqueCaseIntensive(removeIntermediatePath(filteredTags));
        }
        return { tags, leftOverItemsSrc };
    });

    const leftOverItemsUnsorted = $derived.by(() => {
        if (_setting.useMultiPaneList && isMainTree) return [] as ViewItem[];
        if (isRoot && isMainTree && !isSuppressibleLevel) {
            // The root, except not is suppressible.
            if (_setting.expandUntaggedToRoot) {
                return _items.filter(
                    (e) =>
                        e.tags.contains("_untagged"),
                );
            } else {
                return [] as ViewItem[];
            }
        }
        if (isRoot && !isMainTree) {
            // Separated List;
            return _items;
        }
        if (_setting.hideItems == "NONE") {
            return _items;
        } else if (
            (_setting.hideItems == "DEDICATED_INTERMIDIATES" && isInDedicatedTag) ||
            _setting.hideItems == "ALL_EXCEPT_BOTTOM"
        ) {
            return _items.filter(
                (e) =>
                    !children
                        .map((e) => e[V2FI_IDX_CHILDREN])
                        .flat()
                        .find((ee) => e.path == ee.path),
            );
        } else {
            return _items;
        }
    });

    const leftOverItems = $derived(
        _setting.sortExactFirst
            ? performSortExactFirst(_items, children, leftOverItemsUnsorted)
            : leftOverItemsUnsorted,
    );


    // <-- Dirty area

    // -- Displaying

    let isActive = $derived(
        _items && _items.some((e) => e.path == _currentActiveFilePath),
    );

    const tagsDisp = $derived(
        isSuppressibleLevel
            ? [
                  [
                      ...tagNameDisp,
                      ...suppressLevels.flatMap((e) =>
                          e.split("/").flatMap((part) => ["/", renderSpecialTag(part)]),
                      ),
                  ],
              ]
            : [tagNameDisp],
    );

    const tagsDispHtml = $derived(
        isFolderVisible
            ? tagsDisp
                  .map(
                      (e) =>
                          `<span class="tagfolder-tag tag-tag tf-tag">${e
                              .map(
                                  (ee) =>
                                      `<span class="tf-tag-each${ee === "/" ? " tf-tag-separator" : ""}">${escapeStringToHTML(
                                          ee,
                                      )}</span>`,
                              )
                              .join("")}</span>`,
                  )
                  .join("")
            : "",
    );
    const leftOverItemsDisp = $derived(splitArrayToBatch(leftOverItems));
    const childrenDisp = $derived(splitArrayToBatch(children));


    // -- Folder mark icon ---
    function folderMarkAction(el: HTMLElement, mark: string) {
        setIcon(el, mark);
        return {
            update(newMark: string) {
                el.innerHTML = "";
                setIcon(el, newMark);
            },
        };
    }

    // -- Dragging ---
    const draggable = $derived(!_setting.disableDragging);
    const app = $derived($pluginInstance.app);
    //@ts-ignore internal API
    const dm = $derived(app?.dragManager);


    $effect(() => {
        const key = trailKey + (isRoot ? "-r" : "-x") + viewContextID;
        const sortFunc = selectCompareMethodTags(_setting);
        const param = {
            key,
            expandLimit,
            depth,
            tags,
            trailLower,
            _setting,
            isMainTree,
            isSuppressibleLevel,
            previousTrail,
            _items,
            isRoot,
            isFolderVisible,
            sortFunc,
        };
        updateX(param);
    });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class={`tree-item nav-folder${collapsed ? " is-collapsed" : ""}${
        isRoot ? " mod-root" : ""
    }${isUpdating ? " updating" : ""}`}
    onclick={toggleFolder}
    oncontextmenu={(evt) => {
        evt.stopPropagation();
        if (shouldResponsibleFor(evt)) {
            showMenu(
                evt,
                [...trail, ...suppressLevels],
                tagName,
                _items,
            );
        }
    }}
>
    {#if !isRoot && isMainTree}
        <OnDemandRender
            cssClass={`tree-item-self${
                !isRoot ? " is-clickable mod-collapsible" : ""
            } nav-folder-title tag-folder-title${isActive ? " is-active" : ""}`}
            bind:isVisible={isFolderVisible}
        >
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
                class="tree-item-icon nav-folder-icon"
                onclick={toggleFolder}
            >
                {#if isFolderVisible}
                    {#if _setting.tagIcons?.[tagName]}
                        <div use:folderMarkAction={_setting.tagIcons![tagName]} class="tagfolder-folder-mark"></div>
                    {:else if collapsed}
                        {@html folderIcon}
                    {:else}
                        {@html folderOpenIcon}
                    {/if}
                {:else}
                    <svg class="svg-icon" />
                {/if}
            </div>
            <div
                class="tree-item-inner nav-folder-title-content lsl-f"
            >
                {#if isFolderVisible}
                    <div
                        class="tagfolder-titletagname"
                        {draggable}
                        ondragstart={dragStartName}
                    >
                        {@html tagsDispHtml}
                    </div>
                {:else}
                    <div class="tagfolder-titletagname">...</div>
                {/if}
            </div>
        </OnDemandRender>
    {/if}
    <!-- Tags and leftover items -->
    {#if !collapsed}
        {#snippet treeContent(childrenDisp: V2FolderItem[][], leftOverItemsDisp:ViewItem[][])}
            {#each childrenDisp as items}
                {#each items as [f, tagName, tagNameDisp, subitems]}
                <V2TreeFolderComponent
                    items={subitems}
                    thisName={f}
                    trail={[...trail, ...suppressLevels, f]}
                    {folderIcon}
                    {folderOpenIcon}
                    {fileIcon}
                    {openFile}
                    isRoot={false}
                    {showMenu}
                    {isMainTree}
                    {hoverPreview}
                    {tagName}
                    {tagNameDisp}
                    depth={isInDedicatedTag ? depth : depth + 1}
                />
            {/each}
            {/each}
            {#each leftOverItemsDisp as items}
                {#each items as item}
                    <TreeItemItemComponent
                        {item}
                        {openFile}
                        trail={isRoot
                            ? [...trail]
                            : [...trail, ...suppressLevels]}
                        {showMenu}
                        {hoverPreview}
                        {fileIcon}
                    />
                {/each}
            {/each}
        {/snippet}
        {#if !isRoot}
            <div class="tree-item-children nav-folder-children">
                {@render treeContent(childrenDisp, leftOverItemsDisp)}
            </div>
        {:else}
            {@render treeContent(childrenDisp, leftOverItemsDisp)}
        {/if}
    {/if}
</div>
