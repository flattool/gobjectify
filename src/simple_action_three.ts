import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"

const ACTION_SYMBOL = Symbol("Symbol for GObjectify SimpleAction descriptors")

type ActionKind = "void" | "state" | "param"

type HandleFormat<S extends string | undefined> = (S extends string
	? GLib.$ParseConstructorInput<S>
	: undefined
)

interface ActionDescriptor<K extends ActionKind, S extends (K extends "void" ? undefined : string)> {
	kind: K
	format: S
	initial_state: HandleFormat<S>
	accels: string[]
	action_symbol: typeof ACTION_SYMBOL
	create(name: string): TypedAction<K, S>
}

type TypedAction<K extends ActionKind, S extends (K extends "void" ? undefined : string)> = ActionDescriptor<K, S> & {
	readonly action: Gio.SimpleAction,
	disconnect(id: number): void,
	enabled: boolean,
} & (K extends "void" ? {
	activate(): void,
	connect(callback: (self: TypedAction<K, S>) => void): number,
} : K extends "param" ? {
	activate(param: HandleFormat<S>): void,
	connect(callback: (self: TypedAction<K, S>, param: HandleFormat<S>) => void): number,
} : K extends "state" ? {
	activate(new_state: HandleFormat<S>): void,
	connect(callback: (self: TypedAction<K, S>, new_state: HandleFormat<S>) => void): number,
	state: HandleFormat<S>,
} : never)

type ActionConfig = { accels: string[] }

const make_param = <const S extends string>(format: S, config?: ActionConfig): ActionDescriptor<"param", S> => ({
	kind: "param",
	format,
	initial_state: undefined as HandleFormat<S>,
	accels: config?.accels ?? [],
	action_symbol: ACTION_SYMBOL,
	create(name: string): TypedAction<"param", S> {
		const action = new Gio.SimpleAction({ name, parameter_type: new GLib.VariantType(format) })
		const instance: TypedAction<"param", S> = Object.assign(Object.create(this), {
			action,
			disconnect: (id: number) => action.disconnect(id),
			get enabled() { return action.get_enabled() },
			set enabled(v) { action.set_enabled(v) },
			activate: (param: HandleFormat<S>) => action.activate(new GLib.Variant(format, param as any)),
			connect: (callback: (self: TypedAction<"param", S>, param: HandleFormat<S>) => void) => (
				action.$connect("activate", (_self, variant) => callback(instance, variant!.unpack() as HandleFormat<S>))
			),
		})
		return instance
	},
})

const make_state = <const S extends string>(format: S, initial_state: HandleFormat<S>, config?: ActionConfig): ActionDescriptor<"state", S> => ({
	kind: "state",
	format,
	initial_state,
	accels: config?.accels ?? [],
	action_symbol: ACTION_SYMBOL,
	create(name: string): TypedAction<"state", S> {
		const action = new Gio.SimpleAction({ name, state: new GLib.Variant(format, initial_state as any) })
		const instance: TypedAction<"state", S> = Object.assign(Object.create(this), {
			action,
			disconnect: (id: number) => action.disconnect(id),
			get enabled() { return action.get_enabled() },
			set enabled(v) { action.set_enabled(v) },
			get state() { return action.get_state()!.unpack() as HandleFormat<S> },
			set state(v) { action.set_state(new GLib.Variant(format, v as any)) },
			activate: (new_state: HandleFormat<S>) => action.activate(new GLib.Variant(format, new_state as any)),
			connect: (callback: (self: TypedAction<"state", S>, new_state: HandleFormat<S>) => void) => (
				action.$connect("activate", (_self, variant) => callback(instance, variant!.unpack() as HandleFormat<S>))
			),
		})
		return instance
	},
})

const Action = {
	void: (config?: ActionConfig): ActionDescriptor<"void", undefined> => ({
		kind: "void",
		format: undefined,
		initial_state: undefined,
		accels: config?.accels ?? [],
		action_symbol: ACTION_SYMBOL,
		create(name: string): TypedAction<"void", undefined> {
			const action = new Gio.SimpleAction({ name })
			const instance: TypedAction<"void", undefined> = Object.assign(Object.create(this), {
				action,
				disconnect: (id: number) => action.disconnect(id),
				get enabled() { return action.get_enabled() },
				set enabled(v) { action.set_enabled(v) },
				activate: () => action.activate(null),
				connect: (callback: (self: TypedAction<"void", undefined>) => void) => (
					action.$connect("activate", () => callback(instance))
				),
			})
			return instance
		},
	}),
	param: {
		string: (config?: ActionConfig) => make_param("s", config),
		bool: (config?: ActionConfig) => make_param("b", config),
		int32: (config?: ActionConfig) => make_param("i", config),
		uint32: (config?: ActionConfig) => make_param("u", config),
		double: (config?: ActionConfig) => make_param("d", config),
		// TODO: Do this for `state` as well
		variant: <const F extends string>(format: F, config?: ActionConfig): ActionDescriptor<"param", F> => make_param(format, config),
	},
	state: {
		string: <const T extends string>(initial_state: T, config?: ActionConfig) => make_state("s", initial_state, config),
		bool: <const T extends boolean>(initial_state: T, config?: ActionConfig) => make_state("b", initial_state, config),
		int32: <const T extends number>(initial_state: T, config?: ActionConfig) => make_state("i", initial_state, config),
		uint32: <const T extends number>(initial_state: T, config?: ActionConfig) => make_state("u", initial_state, config),
		double: <const T extends number>(initial_state: T, config?: ActionConfig) => make_state("d", initial_state, config),
	}
	// variant()
} as const
