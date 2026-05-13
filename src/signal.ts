import GObject from "gi://GObject?version=2.0"

const SIGNAL_SYMBOL = Symbol("Symbol for GObjectify Signal descriptors")

type SignalArgument = (
	| GObject.GType
	| { $gtype: GObject.GType }
	| (abstract new (...args: any[]) => any)
)

type RegisterableSignal = {
	flags: GObject.SignalFlags | undefined,
	param_types: GObject.GType[],
	return_type: GObject.GType | undefined,
	accumulator: GObject.AccumulatorType | undefined,
}

type SignalDescriptor<A extends SignalArgument[], R extends SignalArgument | void> = {
	param_types?: A,
	return_type?: R,
	flags?: GObject.SignalFlags,
	accumulator?: GObject.AccumulatorType,
	signal_symbol: typeof SIGNAL_SYMBOL,
	create(): RegisterableSignal,
}

type UnderscoreToHyphen<S> = S extends `${infer Head}_${infer Tail}`
	? `${Head}-${UnderscoreToHyphen<Tail>}`
	: S

type ExtractSignals<D> = {
	[Key in keyof D as D[Key] extends SignalDescriptor<any, any>
		? UnderscoreToHyphen<Key>
		: never
	]: D[Key] extends SignalDescriptor<any, any> ? D[Key] : never
}

type UnwrapSignalArg<T> = (
	T extends GObject.GType<infer G> ? G :
	T extends { $gtype: GObject.GType<infer G> } ? G :
	T extends abstract new (...args: any[]) => infer O ? O :
	T
)

type UnwrapSignalArgs<T extends readonly unknown[]> = {
	[K in keyof T]: UnwrapSignalArg<T[K]>
}

type SignalsOf<T extends GObject.Object> = {
	[K in keyof T["$signals"] as string extends K
		? never
		: `notify::${string}` extends K
			? never
			: K
	]: T["$signals"][K]
}

type SignalOverrides<T extends GObject.Object, D> = {
	$connect<const Self extends GObject.Object, S extends keyof ExtractSignals<D> | keyof SignalsOf<T>>(
		signal_name: S,
		callback: SignalsOf<T>[S] extends (...args: infer Args) => infer Ret
			? (self: Self, ...args: Args) => Ret
			: S extends keyof ExtractSignals<D>
				? ExtractSignals<D>[S] extends SignalDescriptor<infer Args, infer Ret>
					? (self: Self, ...args: UnwrapSignalArgs<Args>) => UnwrapSignalArg<Ret>
					: never
				: never
	): number,
	$connect_after<const Self extends GObject.Object, S extends keyof ExtractSignals<D> | keyof SignalsOf<T>>(
		signal_name: S,
		callback: SignalsOf<T>[S] extends (...args: infer Args) => infer Ret
			? (self: Self, ...args: Args) => Ret
			: S extends keyof ExtractSignals<D>
				? ExtractSignals<D>[S] extends SignalDescriptor<infer Args, infer Ret>
					? (self: Self, ...args: UnwrapSignalArgs<Args>) => UnwrapSignalArg<Ret>
					: never
				: never
	): number,
	$emit<S extends keyof ExtractSignals<D> | keyof SignalsOf<T>>(
		signal_name: S,
		...args: SignalsOf<T>[S] extends (...args: infer Args) => any
			? Args
			: S extends keyof ExtractSignals<D>
				? ExtractSignals<D>[S] extends SignalDescriptor<infer Args, any>
					? UnwrapSignalArgs<Args>
					: never
				: never
	): void,
	/**
	 * Connects to a GObject signal and returns a Promise that resolves the first time the signal is emitted.
	 *
	 * This function is an async wrapper for GObject signals, allowing you
	 * to `await` the emission of a signal instead of using callbacks.
	 * Optionally, you can provide a `reject_signal` that will reject the promise if that signal is emitted first.
	 *
	 * The connected signal handlers are automatically disconnected once the promise
	 * resolves or rejects, preventing memory leaks or duplicate connections.
	 *
	 * @param resolve_signal The signal name whose emission will resolve the promise.
	 * @param reject_signal Optional signal name whose emission will reject the promise.
	 * @returns A promise that resolves with the arguments emitted by `resolve_signal`.
	 * 
	 * @remarks
	 * Only signals with a `void` return type can be awaited. Signals that return
	 * a value cannot be used with `$connect_async`, as the return value is
	 * provided by the handler rather than the emission. Use `$connect` directly
	 * for non-void signals.
	 *
	 * @example
	 * ```ts
	 * // Wait for a Gtk.Button to be clicked once
	 * const button = new Gtk.Button({ label: "Click me" })
	 * await button.$connect_async("clicked")
	 * print("Button clicked!")
	 * ```
	 *
	 * @example
	 * ```ts
	 * // Handle a signal that could fail
	 * try {
	 *     const [result] = await obj.$connect_async("success-signal", "error-signal")
	 *     print(`Success: ${result}`)
	 * } catch (err) {
	 *     print(`Error signal triggered: ${err.message}`)
	 * }
	 * ```
	 */
	$connect_async<S extends keyof ExtractSignals<D> | keyof SignalsOf<T>>(
		resolve_signal: S,
		reject_signal?: keyof ExtractSignals<D> | keyof SignalsOf<T>,
	): SignalsOf<T>[S] extends (...args: infer Args) => void
		? Promise<Args>
		: S extends keyof ExtractSignals<D>
			? ExtractSignals<D>[S] extends SignalDescriptor<infer Args, void>
				? Promise<UnwrapSignalArgs<Args>>
				: never
			: never
	$signals: {
		[Key in keyof ExtractSignals<D>]: ExtractSignals<D>[Key] extends SignalDescriptor<infer Args, infer Ret>
			? (...args: UnwrapSignalArgs<Args>) => (Ret extends void ? void : UnwrapSignalArg<Ret>)
			: never
	},
}

const signal_descriptor_args_to_gtypes = (item: SignalArgument): GObject.GType => {
	if ("$gtype" in item) return item.$gtype
	if (typeof item === "function") return GObject.TYPE_JSOBJECT
	return item // known to be a GObject.GType
}

/**
 * Creates a Signal descriptor for use with `from` and `GClass`.
 * 
 * `from` and `GClass` will register the signals on the subclass, allowing them to be connected and emitted.
 * 
 * Note: any signals with underscores ('_') in their names will be remapped to hyphens ('-'). Example: `"user_added"` -> `"user-added"`.
 * Use these remapped names when connecting and emitting the signals.
 * 
 * Tip: GObjectify's provided `$connect`, `$connect_after`, `$connect_async`, and `$emit` methods are type-aware,
 * and will give auto-complete suggestions for these signals, as well as ensure arguments and returned values match the declared types.
 * 
 * @param parameters The types of values that must be emitted, and that will be passed to connected functions.
 * Allows for the following:
 * - `Number` (maps to GObject.TYPE_DOUBLE)
 * - `String` (maps to GObject.TYPE_STRING)
 * - `Boolean` (maps to GObject.TYPE_BOOLEAN)
 * - Any GObject.TYPE_*
 * - Any GObject subclass
 * - Any GObject enum
 * @param options Advanced signal configuration options. Refer to GObject Signal documentation for more information
 * 
 * @example
 * ```ts
 * @GClass()
 * export class Example extends from(Gtk.Button, {
 *     user_added: Signal([String]),
 * }) {
 *     do_example(): void {
 *         this.$emit("user-added", "John Doe")
 *     }
 * }
 * ```
 */
const Signal = <const A extends [] | SignalArgument[] = [], const R extends SignalArgument | void = void>(
	parameters?: A,
	options?: {
		return_type?: R,
		flags?: GObject.SignalFlags,
		accumulator?: GObject.AccumulatorType,
	}
): ([] extends A
	? void extends R
		? SignalDescriptor<[], void>
		: SignalDescriptor<[], R>
	: void extends R
		? SignalDescriptor<A, void>
		: SignalDescriptor<A, R>
) => ({
	...(parameters && { param_types: parameters }),
	...options,
	signal_symbol: SIGNAL_SYMBOL,
	create: () => ({
		param_types: parameters?.map(signal_descriptor_args_to_gtypes) ?? [],
		accumulator: options?.accumulator,
		flags: options?.flags,
		return_type: options?.return_type && signal_descriptor_args_to_gtypes(options.return_type),
	}),
} satisfies SignalDescriptor<any, any> as any)

function is_signal_descriptor(item: any): item is SignalDescriptor<SignalArgument[], SignalArgument | void> {
	return item?.signal_symbol === SIGNAL_SYMBOL
}

export {
	type SignalDescriptor,
	type ExtractSignals,
	type SignalArgument,
	type SignalOverrides,
	type SignalsOf,
	type RegisterableSignal,
	Signal,
	is_signal_descriptor,
}
