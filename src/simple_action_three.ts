import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"

const ACTION_SYMBOL = Symbol("Symbol for GObjectify SimpleAction descriptors")

type ActionKind = "void" | "state" | "param"

type HandleFormat<S extends string | undefined> = (S extends string
	? GLib.$ParseConstructorInput<S>
	: undefined
)

interface TypedActionMeta<K extends ActionKind, S extends (K extends "void" ? undefined : string)> {
	kind: K
	format: S
	initial_state: HandleFormat<S>
	accels: []
	action_symbol: typeof ACTION_SYMBOL
}

type TypedAction<K extends ActionKind, S extends (K extends "void" ? undefined : string)> = TypedActionMeta<K, S> & {
	readonly action: Gio.SimpleAction,
	disconnect(id: number): void,
} & (K extends "void" ? {
	activate(): void,
	connect(callback: (self: TypedAction<K, S>) => void): number,
} : K extends "param" ? {
	activate(param: HandleFormat<S>): void,
	connect(callback: (self: TypedAction<K, S>, param: HandleFormat<S>) => void): number,
} : K extends "state" ? {
	activate(new_state: HandleFormat<S>): void,
	connect(callback: (self: TypedAction<K, S>, new_state: HandleFormat<S>) => void): number,
} : never)
