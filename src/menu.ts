import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import GObject from "gi://GObject?version=2.0"

import { resolve_action_prefix } from "./simple_action_four.js"
import type { TypedAction, ActionKind, StaticActionDescriptor } from "./simple_action_four.js"

// TODO: Support PropActions

type GClass = abstract new (...args: any[]) => GObject.Object

type ActionsOf<G extends GClass, Kinds extends ActionKind = ActionKind> = {
	[Key in keyof InstanceType<G> as Key extends "with_implements"
		? never
		: InstanceType<G>[Key] extends TypedAction<infer Kind, any>
			? Kind extends Kinds
				? Key
				: never
			: never
	]: InstanceType<G>[Key] extends TypedAction<any, any>
		? InstanceType<G>[Key]
		: never
}
type ParamStateTypeOf<D extends TypedAction<any, any>> = (
	D extends TypedAction<any, infer T> ? T : never
)
type KindOf<D extends TypedAction<any, any>> = (
	D extends TypedAction<infer Kind, any> ? Kind : never
)

type MenuItemConfig = {
	label: string | null,
	icon?: string | Gio.Icon,
	hidden_when?: "action-disabled" | "action-missing" | "macos-menubar",
}
type MenuItemConfigTarget<T> = MenuItemConfig & {
	target: T,
}
type MenuItemInput<T, K extends ActionKind> = (K extends "void"
	? string | MenuItemConfig
	: MenuItemConfigTarget<T>
)
type GroupedItemInput<T> = MenuItemConfigTarget<T>[]

function initialize_menu_item(
	detailed_action: string,
	config: MenuItemConfig | MenuItemConfigTarget<unknown>,
	format: string | undefined,
): Gio.MenuItem {
	const item = new Gio.MenuItem()
	item.set_label(config.label)
	item.set_detailed_action(detailed_action)
	if ("target" in config && format) {
		item.set_attribute_value("target", new GLib.Variant(format, config.target))
	}
	if (typeof config.icon === "string") {
		item.set_icon(Gio.Icon.new_for_string(config.icon))
	} else if (config.icon) {
		item.set_icon(config.icon)
	}
	if (config.hidden_when) {
		item.set_attribute_value("hidden-when", GLib.Variant.new_string(config.hidden_when))
	}
	return item
}

function item<
	G extends GClass,
	K extends keyof ActionsOf<G>,
>(
	klass: G,
	key: K,
	config: MenuItemInput<ParamStateTypeOf<ActionsOf<G>[K]>, KindOf<ActionsOf<G>[K]>>,
): Gio.MenuItem {
	const static_desc: StaticActionDescriptor<any, any, any> = (klass as any).$action[key]
	const detailed_action = `${resolve_action_prefix(klass)}.${String(key)}`
	return initialize_menu_item(
		detailed_action,
		typeof config === "string" ? { label: config } : config,
		static_desc.descriptor.format,
	)
}

function item_group<
	G extends GClass,
	K extends keyof ActionsOf<G, "state">,
>(
	klass: G,
	key: K,
	...configs: GroupedItemInput<ParamStateTypeOf<ActionsOf<G, "state">[K]>>
): Gio.MenuItem[] {
	const static_desc: StaticActionDescriptor<any, any, any> = (klass as any).$action[key]
	const detailed_action = `${resolve_action_prefix(klass)}.${String(key)}`
	return configs.map((config) => initialize_menu_item(detailed_action, config, static_desc.descriptor.format))
}

type ItemsForInput<G extends GClass> = {
	[Key in keyof ActionsOf<G>]?: (ActionsOf<G>[Key]["kind"] extends "state"
		? (
			| MenuItemInput<ParamStateTypeOf<ActionsOf<G>[Key]>, "state">
			| GroupedItemInput<ParamStateTypeOf<ActionsOf<G>[Key]>>
		) : MenuItemInput<ParamStateTypeOf<ActionsOf<G>[Key]>, KindOf<ActionsOf<G>[Key]>>
	)
}

function items_for<G extends GClass>(
	klass: G,
	input: ItemsForInput<G>,
): Gio.MenuItem[] {
	const results: Gio.MenuItem[] = []
	for (const key in input) {
		const value = input[key]
		if (value === undefined) continue
		if (Array.isArray(value)) {
			results.push(...item_group(klass, key as any, ...value))
		} else {
			results.push(item(klass, key, value as any))
		}
	}
	return results
}

type MenuItemOrItems = (Gio.MenuItem | Gio.MenuItem[])[]

function flatten_items(items: MenuItemOrItems): Gio.MenuItem[] {
	const flat: Gio.MenuItem[] = []
	items.forEach((item) => (Array.isArray(item)
		? flat.push(...item)
		: flat.push(item)))
	return flat
}

function section(label: string | null, ...items: MenuItemOrItems): Gio.MenuItem {
	const inner = new Gio.Menu()
	flatten_items(items).forEach((item) => inner.append_item(item))
	return Gio.MenuItem.new_section(label, inner)
}

function submenu(label: string | null, ...items: MenuItemOrItems): Gio.MenuItem {
	const inner = new Gio.Menu()
	flatten_items(items).forEach((item) => inner.append_item(item))
	return Gio.MenuItem.new_submenu(label, inner)
}

function build(...items: MenuItemOrItems): Gio.Menu {
	const menu = new Gio.Menu()
	flatten_items(items).forEach((item) => menu.append_item(item))
	return menu
}

export const Menu = {
	/**
	 * Assembles a top-level `Gio.Menu` from `Gio.MenuItem`s, sections, and submenus.
	 *
	 * Accepts any mix of individual `Gio.MenuItem`s and/or arrays of them
	 * (for example, the result of `item_group` or `items_for`).
	 *
	 * The resulting `Gio.Menu` can be attached anywhere a `Gio.MenuModel` is expected,
	 * such as a `Gtk.Popover`'s `menu_model` property.
	 *
	 * @param items A mix of menu items and arrays of menu items to include in the resulting menu.
	 *
	 * @example
	 * ```ts
	 * const menu = Menu.build(
	 *     Menu.item(MainWindow, "quit", "Quit"),
	 *     Menu.submenu(
	 *         "Edit",
	 *         Menu.item(MainWindow, "save_changes", "Save"),
	 *     ),
	 *     Menu.section(
	 *         "Theme",
	 *         Menu.item_group(MainWindow, "set-theme",
	 *             { label: "Light", target: "light" },
	 *             { label: "Dark", target: "dark" },
	 *         ),
	 *     ),
	 * )
	 * ```
	 */
	build,
	/**
	 * Groups items into a labeled (or unlabled) `Gio.MenuItem` section.
	 *
	 * Accepts any mix of individual `Gio.MenuItem`s and/or arrays of them
	 * (for example, the result of `item_group` or `items_for`).
	 *
	 * @param label The submenu's label, or `null` for an unlabled submenu.
	 * @param items A mix of menu items and arrays of menu items to include in the resulting section.
	 *
	 * @example
	 * ```ts
	 * Menu.section("Edit",
	 *     Menu.item(MainWindow, "save-changes", "Save"),
	 *     Menu.item(MainWindow, "discard-changes", "Discard"),
	 * )
	 * ```
	 */
	section,
	/**
	 * Groups items into a labeled (or unlabled) nested `Gio.MenuItem` submenu.
	 *
	 * Accepts any mix of individual `Gio.MenuItem`s and/or arrays of them
	 * (for example, the result of `item_group` or `items_for`).
	 *
	 * @param label The submenu's label, or `null` for an unlabled submenu.
	 * @param items A mix of menu items and arrays of menu items to include in the resulting submenu.
	 *
	 * @example
	 * ```ts
	 * Menu.submenu("Theme",
	 *     Menu.item_group(MainWindow, "set-theme",
	 *         { label: "Light", target: "light" },
	 *         { label: "Dark", target: "dark" },
	 *     ),
	 * )
	 * ```
	 */
	submenu,
	/**
	 * Creates a single `Gio.MenuItem` targeting one action declared on a `GClass`-decorated class.
	 *
	 * For `void` actions, `config` may be a plain string, used directly as the item's label.
	 * For `param` and `state` actions, `config` must include a `target` value, typed to match
	 * that action's parameter/state type.
	 *
	 * @param klass The class the action belongs to.
	 * @param key The name of the action field on `klass`.
	 * @param config The item's label/icon/etc, and a `target` value for `param`/`state` actions.
	 *
	 * @example
	 * ```ts
	 * Menu.item(MainWindow, "undo", "Undo")
	 * Menu.item(MainWindow, "save_changes", { label: "Save", icon: "document-save-symbolic" })
	 * Menu.item(MainWindow, "set_theme", { label: "Dark", target: "dark" })
	 * ```
	 */
	item,
	/**
	 * Creates several `Gio.MenuItem`s that all target the same `state` action with different `target` values.
	 * This achieves the standard pattern for radio-style menu selections, where activating any item sets the
	 * shared action's state.
	 *
	 * Only keys pointing to `state`-kind actions on `klass` are accepted.
	 *
	 * @param klass The class the action belongs to.
	 * @param key The key of the `state` action on `klass`.
	 *
	 * @example
	 * ```ts
	 * Menu.item_group(MainWindow, "sort_order",
	 *     { label: "Name", target: "name" },
	 *     { label: "Date", target: "date-created" },
	 *     { label: "Size", target: "size" },
	 * )
	 * ```
	 */
	item_group,
	/**
	 * Bulk-creates `Gio.MenuItem`s that all target a single class's actions.
	 *
	 * @param klass The class the actions belong to.
	 * @param input Partial record that maps action names to their menu item config(s).
	 *
	 * The item configs accepted in `input`s values are specific.
	 * `void` actions may be a simple string for a label, but `param` and `state` actions require
	 * an object that includes `label` and `target`. `state` actions may also receive an array of config objects,
	 * which allows specifying item groups for things like radio menus (see `item_group` for more info).
	 *
	 * @example
	 * ```ts
	 * Menu.items_for(MainWindow, {
	 *     save_changes: "Save",                      // void action
	 *     set_theme: [                               // state<string> action
	 *         { label: "Light", target: "light" },
	 *         { label: "Dark", target: "dark" },
	 *     ],
	 *     load: { label: "Reload", target: "base" }, // param<string> action
	 * })
	 */
	items_for,
} as const
