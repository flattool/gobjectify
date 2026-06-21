import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import Gtk from "gi://Gtk?version=4.0"

import type { TypedAction, ActionKind, ActionDescriptor } from "./simple_action_three.js"

// TODO: Use $action_descriptors as source of truth for actions instead of ActionsOf
// TODO: Fix incorrect action prefixes for GtkApplication and GtkApplicationWindow classes

type WidgetClass = (
	abstract new (...args: any[]) => Gtk.Widget
) & {
	readonly $action_descriptors: Record<string, ActionDescriptor<any, any, any, any>>
}

type ActionsOf<G extends WidgetClass, Kinds extends ActionKind = ActionKind> = {
	[Key in keyof InstanceType<G> as Key extends "with_implements"
	? never
	: InstanceType<G>[Key] extends TypedAction<infer Kind, any, any>
	? Kind extends Kinds
	? Key
	: never
	: never
	]: InstanceType<G>[Key] extends TypedAction<any, any, any>
	? InstanceType<G>[Key]
	: never
}
type ParamStateTypeOf<D extends ActionDescriptor<any, any, any, any>> = (
	D extends ActionDescriptor<any, any, infer T, any> ? T : never
)
type KindOf<D extends ActionDescriptor<any, any, any, any>> = (
	D extends ActionDescriptor<infer Kind, any, any, any> ? Kind : never
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
	G extends WidgetClass,
	K extends keyof ActionsOf<G>,
>(
	klass: G,
	key: K,
	config: MenuItemInput<ParamStateTypeOf<ActionsOf<G>[K]>, KindOf<ActionsOf<G>[K]>>
): Gio.MenuItem {
	const descriptor: ActionDescriptor<any, any> = (klass as any).$action_descriptors[key]
	const detailed_action = `${klass.name}.${String(key)}`
	return initialize_menu_item(
		detailed_action,
		typeof config === "string" ? { label: config } : config,
		descriptor.format,
	)
}

function item_group<
	G extends WidgetClass,
	K extends keyof ActionsOf<G, "state">,
>(
	klass: G,
	key: K,
	...configs: GroupedItemInput<ParamStateTypeOf<ActionsOf<G, "state">[K]>>
): Gio.MenuItem[] {
	const descriptor: ActionDescriptor<any, any> = (klass as any).$action_descriptors[key]
	const detailed_action = `${klass.name}.${String(key)}`
	return configs.map((config) => initialize_menu_item(detailed_action, config, descriptor.format))
}

type ItemsForInput<G extends WidgetClass> = {
	[Key in keyof ActionsOf<G>]?: (ActionsOf<G>[Key]["kind"] extends "state"
		? (
			| MenuItemInput<ParamStateTypeOf<ActionsOf<G>[Key]>, "state">
			| GroupedItemInput<ParamStateTypeOf<ActionsOf<G>[Key]>>
		) : MenuItemInput<ParamStateTypeOf<ActionsOf<G>[Key]>, KindOf<ActionsOf<G>[Key]>>
	)
}

function items_for<G extends WidgetClass>(
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
	items.forEach((item) => Array.isArray(item)
		? flat.push(...item)
		: flat.push(item)
	)
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
	build,
	section,
	submenu,
	item,
	item_group,
	items_for,
} as const

// ::: ===[ TEST ]=== :::

import { Action, from } from "./gobjectify.js"

class Test extends from(Gtk.Box, {
	bye: Action.state.string("one").as<"one" | "two">(),
}) {
	fn(): void {
		this.bye.activate("two")
	}
}

Menu.build(Menu.item_group(Test, "bye", { label: "", target: "one" }, { label: "", target: "two" }))
