# Restaurant Menu Media Write Contract

## Scope

Restaurant menus already have a live save path for menus, menu items, dietary tags, allergens, and cuisine tags. This contract adds multi-media links for menu items.

Status on 2026-05-20: implemented in the workspace parser, menu panel state, live menu loader, and live menu save flow. The broader menu module still inherits the existing direct save contract.

## Editable Fields

- menu item media links.
- media order within one menu item.
- legacy primary media compatibility through first selected media.

## Blocked Fields

- editing the media asset itself from the menu item panel.
- media rights metadata.
- place-scoped media unless that media belongs to the same object scope and the media module exposes it.

## Tables

- `object_menu`
- `object_menu_item`
- `object_menu_item_media`
- `media`

## RLS / Permission Requirements

- editor can select object media for the same object.
- editor can insert/delete `object_menu_item_media` rows scoped to editable menu items.
- editor can update `object_menu_item.media_id` for compatibility.
- update policies must have matching select policies.

## Save Strategy

Use the current direct menu delete/reinsert pattern:
- read existing menu item ids.
- delete media links for existing item ids.
- delete and recreate menu items.
- insert `object_menu_item_media` rows for each selected media id.
- set `object_menu_item.media_id` to the first selected media id for compatibility.

This is acceptable because the menu module already performs delete/reinsert for sibling child tables. A future RPC can replace the direct flow if RLS or partial rollback behavior requires it.

## Delete Behavior

Removing a media checkbox removes its link on the next save. Removing a menu item removes all its media links before the item row is deleted.

## Ordering Behavior

The selected media id array defines link order. Persist it with `position` when the table has the column.

## Frontend Dirty / Save Behavior

The menu item editor uses a compact checklist under `Medias lies`. Dirty state and savebar remain inherited from the menus module.

## Tests

- parser test for legacy `media_id` plus `object_menu_item_media`.
- save test for add/remove/reorder media links.
- compatibility test that first selected media persists to `object_menu_item.media_id`.
- drawer test for checklist dirty state.
