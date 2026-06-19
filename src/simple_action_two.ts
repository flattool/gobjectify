import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import type GObject from "gi://GObject?version=2.0"
import Gtk from "gi://Gtk?version=4.0"

const ACTION_SYMBOL = Symbol("Symbol for GObjectify SimpleAction descriptors")

type ActionKind = "void" | "state" | "param"

interface TypedActionBase {
	readonly action: Gio.SimpleAction
	enabled: boolean,
	get_enabled(): boolean,
	set_enabled(v: boolean): void,
	disconnect(id: number): void
}
interface TypedActionVoid extends TypedActionBase {
	connect(callback: (self: TypedActionVoid) => void): number
	activate(): void
}
interface TypedActionParam<T> extends TypedActionBase {
	connect(callback: (self: TypedActionParam<T>, param: T) => void): number
	activate(param: T): void
}
interface TypedActionState<T> extends TypedActionBase {
	state: T
	get_state(): T
	set_state(value: T): void
	connect(callback: (self: TypedActionState<T>, new_state: T) => void): number
	activate(param: T): void
}
type TypedAction<T, K extends ActionKind> = (
	K extends "void" ? TypedActionVoid :
	K extends "param" ? TypedActionParam<T> :
	K extends "state" ? TypedActionState<T> :
	never
)

const make_typed_action_base = (action: Gio.SimpleAction): TypedActionBase => ({
	action,
	get_enabled: action.get_enabled.bind(action),
	set_enabled: action.set_enabled.bind(action),
	get enabled(): boolean { return this.get_enabled() },
	set enabled(v) { this.set_enabled(v) },
	disconnect: action.disconnect.bind(action),
})

type Narrowable<T, K extends ActionKind, Default extends T> = (
	K extends "void" ? {} :
	K extends "param" ? { as<Narrow extends T>(): ActionDescriptor<Narrow, K> } :
	K extends "state" ? { as<Narrow extends T>(): Default extends Narrow ? ActionDescriptor<Narrow, K, Default> : [never] & void } :
	never
)

type ActionDescriptor<T, K extends ActionKind, Default extends T = T> = {
	readonly kind: K,
	readonly initial_state: K extends "state" ? T : undefined,
	readonly action_symbol: typeof ACTION_SYMBOL,
	readonly accels: string[],
	create(name: string): { action: Gio.SimpleAction, typed: TypedAction<T, K> },
} & Narrowable<T, K, Default>

type ActionOptions = { accels: string[] }

type ExtractActions<D> = {
	readonly [Key in keyof D as D[Key] extends ActionDescriptor<any, any>
	? Key
	: never
	]: D[Key] extends ActionDescriptor<infer T, infer K extends ActionKind> ? TypedAction<T, K> : never
}

type PrimitiveActionTypes = {
	string: string,
	bool: boolean,
	int32: number,
	uint32: number,
	double: number,
}
const variant_formats: Record<keyof PrimitiveActionTypes, string> = {
	string: "s",
	bool: "b",
	int32: "i",
	uint32: "u",
	double: "d",
}

function make_param_descriptor<K extends keyof PrimitiveActionTypes>(
	kind: K,
	config?: ActionOptions,
): ActionDescriptor<PrimitiveActionTypes[K], "param", never> {
	const format = variant_formats[kind]
	return {
		kind: "param",
		initial_state: undefined,
		action_symbol: ACTION_SYMBOL,
		accels: config?.accels ?? [],
		create(name) {
			const action = new Gio.SimpleAction({ name, parameter_type: new GLib.VariantType(format) })
			const typed: TypedActionParam<PrimitiveActionTypes[K]> = {
				...make_typed_action_base(action),
				connect: (callback) => action.$connect(
					"activate",
					(_self, variant) => callback(typed, variant!.unpack() as PrimitiveActionTypes[K])
				),
				activate: (param) => action.activate(new GLib.Variant(format, param as any)),
			}
			return { action, typed }
		},
		as(): any { return this },
	}
}

function make_state_descriptor<K extends keyof PrimitiveActionTypes, const Default extends PrimitiveActionTypes[K]>(
	kind: K,
	initial_state: Default,
	config?: ActionOptions,
): ActionDescriptor<PrimitiveActionTypes[K], "state", Default> {
	const format = variant_formats[kind]
	return {
		kind: "state",
		initial_state,
		action_symbol: ACTION_SYMBOL,
		accels: config?.accels ?? [],
		create(name) {
			const action = new Gio.SimpleAction({ name, state: new GLib.Variant(format, initial_state as any) })
			const typed: TypedActionState<PrimitiveActionTypes[K]> = {
				...make_typed_action_base(action),
				connect: (callback) => action.$connect(
					"activate",
					(_self, variant) => callback(typed, variant!.unpack() as PrimitiveActionTypes[K])
				),
				get_state() { return action.get_state()!.unpack() as PrimitiveActionTypes[K] },
				set_state(state) { action.set_state(new GLib.Variant(format, state as any)) },
				get state() { return this.get_state() },
				set state(state) { this.set_state(state) },
				activate: (state) => action.activate(new GLib.Variant(format, state as any)),
			}
			return { action, typed }
		},
		as(): any { return this },
	}
}

type VariantErrorHandler<F extends string, T extends ActionDescriptor<any, any>> = (
	GLib.$ParseConstructorInput<F> extends GLib.VariantTypeError<string> ? GLib.$ParseConstructorInput<F> : T
)

function variant<const F extends string>(
	format: F,
): VariantErrorHandler<F, ActionDescriptor<GLib.$ParseConstructorInput<F>, "param">>
function variant<const F extends string, const S extends GLib.$ParseConstructorInput<F>>(
	format: F,
	state: S,
): VariantErrorHandler<F, ActionDescriptor<GLib.$ParseConstructorInput<F>, "state", S>>
function variant<const F extends string, const S extends GLib.$ParseConstructorInput<F>>(
	format__: F,
	state__?: S,
): VariantErrorHandler<F, ActionDescriptor<GLib.$ParseConstructorInput<F>, "param" | "state", S>> {
	const to_ret: ActionDescriptor<GLib.$ParseConstructorInput<F>, "param" | "state", S> = {
		kind: state__ === undefined ? "param" : "state",
		initial_state: state__,
		action_symbol: ACTION_SYMBOL,
		accels: [],
		create(name) {
			const action = new Gio.SimpleAction({
				name,
				...(this.kind === "param"
					? { parameter_type: new GLib.VariantType(format__) }
					: { state: new GLib.Variant(format__, state__ as any) }
				),
			})
			type T = GLib.$ParseConstructorInput<F>
			let typed: TypedActionParam<T> | TypedActionState<T>
			if (this.kind === "param") {
				typed = {
					...make_typed_action_base(action),
					connect: (callback) => action.$connect(
						"activate",
						(_self, variant) => callback(typed, variant!.unpack() as T)
					),
					activate: (param) => action.activate(new GLib.Variant(format__, param)),
				} satisfies TypedActionParam<T>
			} else {
				typed = {
					...make_typed_action_base(action),
					connect: (callback) => action.$connect(
						"activate",
						(_self, variant) => callback(typed as any, variant!.unpack() as T),
					),
					activate: (state) => action.activate(new GLib.Variant(format__, state)),
					get_state() { return action.get_state()!.unpack() as T },
					set_state(state) { action.set_state(new GLib.Variant(format__, state as any)) },
					get state() { return this.get_state() },
					set state(state) { this.set_state(state) },
				} satisfies TypedActionState<T>
			}
			return { action, typed }
		},
		as(): any { return this },
	}
	return to_ret as any
}

const Action = {
	void: (config?: ActionOptions): ActionDescriptor<void, "void"> => ({
		kind: "void",
		initial_state: undefined,
		action_symbol: ACTION_SYMBOL,
		accels: config?.accels ?? [],
		create(name) {
			const action = new Gio.SimpleAction({ name })
			const typed: TypedActionVoid = {
				...make_typed_action_base(action),
				connect: (callback) => action.$connect("activate", () => callback(typed)),
				activate: () => action.activate(null),
			}
			return { action, typed }
		},
	}),
	param: {
		string: (config?: ActionOptions): ActionDescriptor<string, "param"> => make_param_descriptor("string", config),
		bool: (config?: ActionOptions): ActionDescriptor<boolean, "param"> => make_param_descriptor("bool", config),
		int32: (config?: ActionOptions): ActionDescriptor<number, "param"> => make_param_descriptor("int32", config),
		uint32: (config?: ActionOptions): ActionDescriptor<number, "param"> => make_param_descriptor("uint32", config),
		double: (config?: ActionOptions): ActionDescriptor<number, "param"> => make_param_descriptor("double", config),
	},
	state: {
		string: <const D extends string>(state: D, config?: ActionOptions): ActionDescriptor<string, "state", D> => make_state_descriptor("string", state, config),
		bool: <const D extends boolean>(state: D, config?: ActionOptions): ActionDescriptor<boolean, "state", D> => make_state_descriptor("bool", state, config),
		int32: <const D extends number>(state: D, config?: ActionOptions): ActionDescriptor<number, "state", D> => make_state_descriptor("int32", state, config),
		uint32: <const D extends number>(state: D, config?: ActionOptions): ActionDescriptor<number, "state", D> => make_state_descriptor("uint32", state, config),
		double: <const D extends number>(state: D, config?: ActionOptions): ActionDescriptor<number, "state", D> => make_state_descriptor("double", state, config),
	},
	variant,
} as const

const is_action_descriptor = (item: any): item is ActionDescriptor<any, any> => item?.action_symbol === ACTION_SYMBOL

export { Action, is_action_descriptor }
export type { ActionDescriptor, ExtractActions, TypedActionBase, TypedActionParam, TypedActionState }
