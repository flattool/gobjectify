import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import Gtk from "gi://Gtk?version=4.0"

// TODO: Document all of this!

const ACTION_SYMBOL = Symbol("Symbol for GObjectify SimpleAction descriptors")

type ActionKind = "void" | "state" | "param"

type HandleActionFormat<S extends string | undefined> = (S extends string
	? GLib.$ParseConstructorInput<S>
	: undefined
)

type ActionNarrowable<
	K extends ActionKind,
	S extends (K extends "void" ? undefined : string),
	T,
	Default extends T,
> = (K extends "void" ? {} : K extends "param" ? {
	as<Narrow extends T>(): ActionDescriptor<K, S, Narrow, Narrow>,
} : K extends "state" ? {
	as<Narrow extends T>(): Default extends Narrow ? ActionDescriptor<K, S, Narrow, Default> : [never] & void,
} : never)

type ActionDescriptor<
	K extends ActionKind,
	S extends (K extends "void" ? undefined : string),
	T = HandleActionFormat<S>,
	Default extends T = T,
> = {
	readonly kind: K,
	readonly format: S,
	readonly initial_state: K extends "state" ? Default : undefined,
	readonly accels: string[],
	readonly action_symbol: typeof ACTION_SYMBOL,
	create(name: string): TypedAction<K, S, T>,
} & ActionNarrowable<K, S, T, Default>

type TypedAction<
	K extends ActionKind,
	S extends (K extends "void" ? undefined : string),
	T,
> = ActionDescriptor<K, S, T> & {
	readonly action: Gio.SimpleAction,
	disconnect(id: number): void,
	enabled: boolean,
} & (K extends "void" ? {
	activate(): void,
	connect(callback: (self: TypedAction<K, S, T>) => void): number,
} : K extends "param" ? {
	activate(param: T): void,
	connect(callback: (self: TypedAction<K, S, T>, param: T) => void): number,
} : K extends "state" ? {
	activate(new_state: T): void,
	connect(callback: (self: TypedAction<K, S, T>, new_state: T) => void): number,
	state: T,
} : never)

type ExtractActions<D> = {
	readonly [Key in keyof D as D[Key] extends ActionDescriptor<any, any, any, any>
		? Key
		: never
	]: D[Key] extends ActionDescriptor<infer K, infer S, infer T, any>
		? TypedAction<K, S, T>
		: never
}

type ExtractActionDescriptors<D> = {
	readonly [Key in keyof D as D[Key] extends ActionDescriptor<any, any, any, any>
		? Key
		: never
	]: D[Key] extends ActionDescriptor<infer K, infer S, infer T, infer Default>
		? ActionDescriptor<K, S, T, Default>
		: never
}

type ActionConfig = { accels?: string[] }
type StateActionConfig<T> = ActionConfig & { default?: T }

function resolve_action_prefix(klass: abstract new (...args: any[]) => any): string {
	if (klass.prototype instanceof Gtk.ApplicationWindow) return "win"
	if (klass.prototype instanceof Gtk.Application) return "app"
	return klass.name
}

const make_param = <const S extends string>(
	format: S,
	config?: ActionConfig,
): ActionDescriptor<"param", S, HandleActionFormat<S>, never> => ({
	kind: "param",
	format,
	initial_state: undefined as any,
	accels: config?.accels ?? [],
	action_symbol: ACTION_SYMBOL,
	create(name: string): any {
		const action = new Gio.SimpleAction({ name, parameter_type: new GLib.VariantType(format) })
		const instance = Object.assign(Object.create(this), {
			action,
			disconnect: (id: number) => action.disconnect(id),
			get enabled() { return action.get_enabled() },
			set enabled(v) { action.set_enabled(v) },
			activate: (param: any) => action.activate(new GLib.Variant(format, param)),
			connect: (callback: any) => (
				action.$connect("activate", (_self, variant) => callback(instance, variant!.unpack()))
			),
		})
		return instance
	},
	as(): any { return this },
})

const make_state = <const S extends string, const Default extends HandleActionFormat<S>>(
	format: S,
	initial_state: Default,
	config?: ActionConfig,
): ActionDescriptor<"state", S, HandleActionFormat<S>, Default> => ({
	kind: "state",
	format,
	initial_state,
	accels: config?.accels ?? [],
	action_symbol: ACTION_SYMBOL,
	create(name: string): any {
		const action = new Gio.SimpleAction({ name, state: new GLib.Variant(format, initial_state as any) })
		const instance = Object.assign(Object.create(this), {
			action,
			disconnect: (id: number) => action.disconnect(id),
			get enabled() { return action.get_enabled() },
			set enabled(v) { action.set_enabled(v) },
			get state() { return action.get_state()!.unpack() },
			set state(v) { action.set_state(new GLib.Variant(format, v as any)) },
			activate: (new_state: any) => action.activate(new GLib.Variant(format, new_state)),
			connect: (callback: any) => (
				action.$connect("activate", (_self, variant) => callback(instance, variant!.unpack()))
			),
		})
		return instance
	},
	as(): any { return this },
})

const param = {
	string: (config?: ActionConfig) => make_param("s", config),
	bool: (config?: ActionConfig) => make_param("b", config),
	int32: (config?: ActionConfig) => make_param("i", config),
	uint32: (config?: ActionConfig) => make_param("u", config),
	double: (config?: ActionConfig) => make_param("d", config),
	variant: <const S extends string>(
		format: S,
		config?: ActionConfig,
	): Omit<ActionDescriptor<"param", S>, "as"> => make_param(format, config),
} as const

const state = {
	string: <const D extends string>(
		config?: StateActionConfig<D>,
	) => make_state("s", (config?.default ?? "" as D), config),
	bool: <const D extends boolean>(
		config?: StateActionConfig<D>,
	) => make_state("b", (config?.default ?? false as D), config),
	int32: <const D extends number>(
		config?: StateActionConfig<D>,
	) => make_state("i", (config?.default ?? 0 as D), config),
	uint32: <const D extends number>(
		config?: StateActionConfig<D>,
	) => make_state("u", (config?.default ?? 0 as D), config),
	double: <const D extends number>(
		config?: StateActionConfig<D>,
	) => make_state("d", (config?.default ?? 0 as D), config),
	variant: <const S extends string, const T extends HandleActionFormat<S>>(
		format: S,
		default_state: T,
		config?: ActionConfig,
	): Omit<ActionDescriptor<"state", S, HandleActionFormat<S>, T>, "as"> => make_state(format, default_state, config),
} as const

const SimpleAction = {
	void: (config?: ActionConfig): ActionDescriptor<"void", undefined> => ({
		kind: "void",
		format: undefined,
		initial_state: undefined,
		accels: config?.accels ?? [],
		action_symbol: ACTION_SYMBOL,
		create(name: string): any {
			const action = new Gio.SimpleAction({ name })
			const instance = Object.assign(Object.create(this), {
				action,
				disconnect: (id: number) => action.disconnect(id),
				get enabled() { return action.get_enabled() },
				set enabled(v) { action.set_enabled(v) },
				activate: () => action.activate(null),
				connect: (callback: any) => action.$connect("activate", () => callback(instance)),
			})
			return instance
		},
	}),
	param,
	state,
} as const

const is_action_descriptor = (item: any): item is ActionDescriptor<any, any> => item?.action_symbol === ACTION_SYMBOL

export { SimpleAction, is_action_descriptor, resolve_action_prefix }
export type { ActionKind, ActionDescriptor, TypedAction, ExtractActions, ExtractActionDescriptors, HandleActionFormat }
