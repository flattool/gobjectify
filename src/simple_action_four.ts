import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import Gtk from "gi://Gtk?version=4.0"

import type { PropDescriptor } from "./property.js"
import GObject from "gi://GObject?version=2.0"

// TODO: Support PropActions

const ACTION_SYMBOL = Symbol("Symbol for GObjectify SimpleAction descriptors")

type ActionKind = "void" | "param" | "state" | "prop"

type HandleActionFormat<S extends string | undefined> = (S extends string
	? GLib.$ParseConstructorInput<S>
	: undefined
)

type ActionConfig = { accels?: string[] }
type StateActionConfig<T> = ActionConfig & { default?: T }

type ActionDescriptor<K extends ActionKind, T, Default> = {
	readonly kind: K,
	readonly format: string,
	readonly initial_state: K extends "state" | "prop" ? Default : undefined,
	readonly accels: readonly string[],
	readonly action_symbol: typeof ACTION_SYMBOL,
	readonly __$t_holder?: T,
	create(prefix: string, name: string, obj: GObject.Object): TypedAction<K, T>,
}

type ActionNarrowable<K extends ActionKind, T, Default> = (
	K extends "void" | "prop" ? {
	} : K extends "param" ? {
		as<Narrow extends T>(): ActionDescriptor<K, Narrow, Narrow>,
	} : K extends "state" ? {
		as<Narrow extends T>(): [Default] extends [Narrow] ? ActionDescriptor<K, Narrow, Default> : [never] & void,
	} : never
)

type NarrowableActionDescriptor<K extends ActionKind, T, Default> = (
	ActionDescriptor<K, T, Default>
	& ActionNarrowable<K, T, Default>
)

type MethodsFieldsForKind<K extends ActionKind, T> = (
	K extends "void" ? {
		activate(): void,
		on_activated(callback: (self: TypedAction<K, T>) => void): number,
	} : K extends "param" ? {
		activate(param: T): void,
		on_activated(callback: (self: TypedAction<K, T>, param: T) => void): number,
	} : K extends "state" ? {
		activate(new_state: T): void,
		on_state_changed(callback: (self: TypedAction<K, T>, new_state: T) => void): number,
		state: T,
	} : K extends "prop" ? {
	} : never
)

type TypedActionBase<K extends ActionKind, T> = {
	readonly action: K extends "prop" ? Gio.PropertyAction : Gio.SimpleAction,
	readonly detailed_name: string,
} & (
	K extends "prop" ? { readonly enabled: boolean } : { enabled: boolean }
) & MethodsFieldsForKind<K, T>

type TypedAction<K extends ActionKind, T> = Omit<
	ActionDescriptor<K, T, T>,
	"create" | "initial_state" | "action_symbol" | "__$t_holder"
> & TypedActionBase<K, T>

type StaticActionDescriptor<K extends ActionKind, T, Default> = {
	readonly detailed_name: string,
	readonly descriptor: Omit<
		ActionDescriptor<K, T, Default>,
		"create" | "initial_state" | "action_symbol" | "__$t_holder"
	>,
} & (K extends "void" ? {
	activate(origin: GObject.Object): boolean,
} : K extends "param" ? {
	activate(origin: GObject.Object, param: T): boolean,
} : K extends "state" ? {
	activate(origin: GObject.Object, new_state: T): boolean,
} : {})

type ExtractActionDescriptors<D> = {
	readonly [Key in keyof D as D[Key] extends ActionDescriptor<any, any, any>
		? Key
		: never
	]: D[Key] extends ActionDescriptor<infer K, infer T, infer D>
		? StaticActionDescriptor<K, T, D>
		: never
}

type ExtractActions<D> = {
	readonly [Key in keyof D as D[Key] extends ActionDescriptor<any, any, any>
		? Key
		: never
	]: D[Key] extends ActionDescriptor<infer K, infer T, any>
		? Key extends "prop"
			? T extends `property::${infer F}`
				? F extends keyof D
					? D[F] extends PropDescriptor<infer PT, any>
						? TypedAction<K, PT>
						: never
					: never
				: never
			: TypedAction<K, T>
		: never
}

const make_static_descriptor = <K extends ActionKind, T, Default>(
	prefix: string,
	name: string,
	descriptor: ActionDescriptor<K, T, Default>,
): StaticActionDescriptor<K, T, Default> => ({
	descriptor,
	detailed_name: `${prefix}.${name}`,
	activate(origin: Gtk.Widget, param?: any): boolean {
		return origin.activate_action(
			this.detailed_name,
			descriptor.kind === "void" ? null : new GLib.Variant(descriptor.format, param),
		)
	},
} satisfies StaticActionDescriptor<any, T, Default> as any)

const resolve_action_prefix = (
	item: (abstract new (...args: any[]) => GObject.Object) | GObject.Object,
): string => {
	if (item instanceof GObject.Object) {
		if (item instanceof Gtk.ApplicationWindow) return "win"
		if (item instanceof Gio.Application) return "app"
		return item.constructor.name
	} else {
		if (item.prototype instanceof Gtk.ApplicationWindow) return "win"
		if (item.prototype instanceof Gio.Application) return "app"
		return item.name
	}
}

const make_param = <const S extends string>(
	format: S,
	config?: ActionConfig,
): NarrowableActionDescriptor<"param", HandleActionFormat<S>, HandleActionFormat<S>> => ({
	kind: "param",
	accels: config?.accels ?? [],
	action_symbol: ACTION_SYMBOL,
	format,
	initial_state: undefined,
	as(): any { return this },
	create(prefix, name): TypedAction<"param", HandleActionFormat<S>> {
		const action = new Gio.SimpleAction({ name, parameter_type: new GLib.VariantType(this.format) })
		const instance = Object.assign(Object.create(this), {
			action,
			detailed_name: `${prefix}.${name}`,
			activate: (param): void => action.activate(new GLib.Variant(this.format, param)),
			on_activated: (callback): number => (
				action.connect("activate", (_self, variant) => callback(instance, variant!.unpack() as any))
			),
			get enabled(): boolean { return action.get_enabled() },
			set enabled(v) { action.set_enabled(v) },
		} satisfies TypedActionBase<"param", HandleActionFormat<S>>)
		return instance
	},
})

const make_state = <const S extends string, const Default extends HandleActionFormat<S>>(
	format: S,
	initial_state: Default,
	config?: ActionConfig,
): NarrowableActionDescriptor<"state", HandleActionFormat<S>, Default> => ({
	kind: "state",
	format,
	initial_state,
	accels: config?.accels ?? [],
	action_symbol: ACTION_SYMBOL,
	create(prefix, name): TypedAction<"state", Default> {
		const action = new Gio.SimpleAction({
			name,
			parameter_type: new GLib.VariantType(format),
			state: new GLib.Variant(format, initial_state as any),
		})
		const instance = Object.assign(Object.create(this), {
			action,
			detailed_name: `${prefix}.${name}`,
			activate: (new_state): void => action.activate(new GLib.Variant(format, new_state as any)),
			on_state_changed: (callback): number => (
				action.connect("notify::state", () => callback(instance, action.state!.unpack()))
			),
			get enabled(): boolean { return action.get_enabled() },
			set enabled(v) { action.set_enabled(v) },
			get state(): any { return this.action.get_state()!.unpack() },
			set state(v) { this.action.set_state(new GLib.Variant(format, v)) },
		} satisfies TypedActionBase<"state", HandleActionFormat<S>>)
		return instance
	},
	as(): any { return this },
})

const SimpleAction = {
	void: (config?: ActionConfig): ActionDescriptor<"void", null, null> => ({
		kind: "void",
		format: "",
		accels: config?.accels ?? [],
		action_symbol: ACTION_SYMBOL,
		initial_state: undefined,
		create(prefix, name): TypedAction<"void", null> {
			const action = new Gio.SimpleAction({ name })
			const instance = Object.assign(Object.create(this), {
				action,
				detailed_name: `${prefix}.${name}`,
				activate: (): void => action.activate(null),
				on_activated: (callback): number => action.connect("activate", (_self) => callback(instance)),
				get enabled(): boolean { return action.get_enabled() },
				set enabled(v) { action.set_enabled(v) },
			} satisfies TypedActionBase<"void", null>)
			return instance
		},
	}),
	param: {
		string: (config?: ActionConfig) => make_param("s", config),
		bool: (config?: ActionConfig) => make_param("b", config),
		int32: (config?: ActionConfig) => make_param("i", config),
		uint32: (config?: ActionConfig) => make_param("u", config),
		double: (config?: ActionConfig) => make_param("d", config),
		variant: <const S extends string>(
			format: S,
			config?: ActionConfig,
		): Omit<ActionDescriptor<"param", HandleActionFormat<S>, HandleActionFormat<S>>, "as"> => make_param(
			format,
			config,
		),
	},
	state: {
		string: <const D extends string>(
			config?: StateActionConfig<string>,
		) => make_state("s", config?.default ?? "" as D, config),
		bool: <const D extends boolean>(
			config?: StateActionConfig<boolean>,
		) => make_state("b", config?.default ?? false as D, config),
		int32: <const D extends number>(
			config?: StateActionConfig<number>,
		) => make_state("i", config?.default ?? 0 as D, config),
		uint32: <const D extends number>(
			config?: StateActionConfig<number>,
		) => make_state("u", config?.default ?? 0 as D, config),
		double: <const D extends number>(
			config?: StateActionConfig<number>,
		) => make_state("d", config?.default ?? 0 as D, config),
		variant: <const S extends string, const T extends HandleActionFormat<S>>(
			format: S,
			default_state: T,
			config?: ActionConfig,
		): Omit<ActionDescriptor<"state", HandleActionFormat<S>, T>, "as"> => make_state(format, default_state, config),
	},
	property: <const Field extends string>(
		field: Field,
		config?: ActionConfig,
	): ActionDescriptor<"prop", `property::${Field}`, any> => ({
		kind: "prop",
		format: "",
		accels: config?.accels ?? [],
		action_symbol: ACTION_SYMBOL,
		initial_state: undefined,
		create(prefix, name, object): TypedAction<"prop", any> {
			const action = new Gio.PropertyAction({ name, object, property_name: field })
			const instance = Object.assign(Object.create(this), {
				action,
				detailed_name: `${prefix}.${name}`,
				get enabled(): boolean { return action.get_enabled() },
			} satisfies TypedActionBase<"prop", any>)
			return instance
		},
	}),
} as const

const is_action_descriptor = (
	item: any,
): item is ActionDescriptor<any, any, any> => item.action_symbol === ACTION_SYMBOL

export { SimpleAction, is_action_descriptor, resolve_action_prefix, make_static_descriptor }
export type {
	ActionDescriptor,
	TypedAction,
	ExtractActionDescriptors,
	ExtractActions,
	ActionKind,
	StaticActionDescriptor,
}
