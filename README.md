## Nested Tag Folder

> **This is a fork of [TagFolder](https://github.com/vrtmrz/obsidian-tagfolder) by vorotamoroz.**

Use nested tags as a replacement for Obsidian's file explorer. Each tag namespace (`area/`, `source/`, `status/`, …) is an independent folder hierarchy. A note tagged `#area/coding` and `#source/book` appears under _both_ `area/coding` and `source/book` simultaneously — the same file in two places at once, just like a symlink.

### Changes from upstream

- **`ignoreTags` now matches prefixes** — setting `source` in the ignore list hides `source/book`, `source/ai`, and all other `source/*` tags, not just the bare `source` tag.
- **`mergeRedundantCombination` is namespace-aware** — notes tagged with both `area/coding` and `source/book` now correctly appear under both namespaces. Previously, the deduplication logic would hide the note from whichever namespace was processed second.
- **No cross-namespace children** — inside `source/book`, only deeper `source/*` sub-tags appear as sub-folders. Tags from other namespaces (e.g. `area/*`) no longer bleed in as nested children.

### How to use

Install this plugin, press `Ctrl+p`, and choose "Show Tag Folder".

### Behavior

This plugin turns your nested tags into a browsable folder tree — a drop-in replacement for the file explorer.

### How it works

Each top-level tag namespace becomes an independent folder tree. A note tagged with multiple namespaces appears in **all of them simultaneously** — the same file in multiple places at once.

```
Meeting notes : #area/work    #status/active
Research doc  : #area/coding  #source/book   #status/active
Book summary  : #source/book  #status/done
```

The tree looks like:

```
area/
  coding/
    Research doc
  work/
    Meeting notes
source/
  book/
    Research doc
    Book summary
status/
  active/
    Meeting notes
    Research doc
  done/
    Book summary
```

#### Search tags

Filter the tree by typing in the search box. Filters are matched against tags.

| Syntax | Meaning |
|--------|---------|
| `source` | tag contains "source" (substring) |
| `#source` | tag starts with "source" (namespace-aware) |
| `-source` | exclude tags containing "source" |
| `-#area` | exclude entire `area/*` namespace |
| `A B` | AND — tag must match both A and B |
| `A \| B` | OR — show notes matching A or notes matching B |

For namespace filtering, prefer `#namespace` over a plain word — it matches the whole namespace without accidentally catching unrelated tags.

Examples:

```
#source
```
Show only notes in the `source/*` namespace.

```
#source/book -#status/done
```
Show notes under `source/book` that are not yet done.

```
#area | #source
```
Show notes from either the `area` or `source` namespace.

### Settings

#### Behavior

##### Always Open

Place TagFolder on the left pane and activate it at every Obsidian launch.

##### Use pinning

We can pin the tag if we enable this option.  
When this feature is enabled, the pin information is saved in the file set in the next configuration.
Pinned tags are sorted according to `key` in the frontmatter of `taginfo.md`.

##### Pin information file

We can change the name of the file in which pin information is saved.
This can be configured also from the context-menu.

| Item     | Meaning of the value                                                                              |
| -------- | ------------------------------------------------------------------------------------------------- |
| key      | If exists, the tag is pinned.                                                                     |
| mark     | The label which is shown instead of `📌`.                                                         |
| alt      | The tag will be shown as this. But they will not be merged into the same one. No `#` is required. |
| redirect | The tag will be redirected to the configured one and will be merged. No `#` is required.          |

#### Files

##### Display Method

You can configure how the entry shows.

##### Order method

You can order items by:

- Displaying name
- Filename
- Modified time
- Fullpath of the file

##### Use title

When you enable this option, the value in the frontmatter or first level one heading will be shown instead of `NAME`.

##### Frontmatter path

Dotted path to retrieve title from frontmatter.

#### Tags

##### Order method

You can order tags by:

- Filename
- Count of items

##### Store tags in frontmatter for new notes

This setting changes how tags are stored in new notes created by TagFolder. When disabled, tags are stored as #hashtags at the top of new notes. When enabled, tags are stored in the frontmatter and displayed in the note's Properties.

#### Actions

##### Search tags inside TagFolder when clicking tags

We can search tags inside TagFolder when clicking tags instead of opening the default search pane.
With control and shift keys, we can remove the tag from the search condition or add an exclusion of it to that.

##### List files in a separated pane

When enabled, files will be shown in a separated pane.

#### Arrangements

##### Hide Items

Configure hiding items.

- Hide nothing
- Only intermediates of nested tags
- All intermediates

If you have these items:

```
2021-11-01 : #daily/2021/11 #status/summarized
2021-11-02 : #daily/2021/11 #status/summarized
2021-11-03 : #daily/2021/11 #status/jot
2021-12-01 : #daily/2021/12 #status/jot
```

This setting affects as like below.

- Hide nothing

```
daily
    → 2021
        → 11
            status
                → jot
                    2021-11-03
                → summarized
                    2021-11-01
                    2021-11-02
                2021-11-01
                2021-11-02
                2021-11-03
            2021-11-01
            2021-11-02
            2021-11-03
        2021-11-01
        2021-11-02
        2021-11-03
        2021-12-01
        → 12
            :
    2021-11-01
    2021-11-02
    2021-11-03
    2021-12-01
```

- Only intermediates of nested tags
  Hide only intermediates of nested tags, so show items only on the last or break of the nested tags.

```
daily
    → 2021
        → 11
            status
                → jot
                    2021-11-03
                → summarized
                    2021-11-01
                    2021-11-02
            2021-11-01
            2021-11-02
            2021-11-03
        → 12
            :
```

- All intermediates
  Hide all intermediates, so show items only deepest.

```
daily
    → 2021
        → 11
            status
                → jot
                    2021-11-03
                → summarized
                    2021-11-01
                    2021-11-02
        → 12
            :
```

##### Merge redundant combinations

When this feature is enabled, a/b and b/a are merged into a/b if there are no intermediates.

##### Do not simplify empty folders

Keep empty folders, even if they can be simplified.

##### Reduce duplicated parents in nested tags

If we have the doc (e.g., `example note`) with nested tags which have the same parents, like `#topic/calculus`, `#topic/electromagnetics`:

- Disabled

```
topic
     - > calculus
         topic
               - > electromagnetics
                   example note
         example note
```

- Enabled

```
topic
     - > calculus
          - > electromagnetics
              example note
         example note
```

#### Filters

##### Target Folders

If we set this, the plugin will only target files in it.

##### Ignore Folders

Ignore documents in specific folders.

##### Ignore note Tag

If the note has the tag that is set in here, the note would be treated as there was not.

##### Ignore Tag

Tags that were set here would be treated as there were not.

##### Archive tags
