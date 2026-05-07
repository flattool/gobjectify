import GObject from "gi://GObject?version=2.0"

const SIGNAL_SYMBOL = Symbol("Symbol for GObjectify Signal descriptors")

type SignalArgument = (
	NumberConstructor
	| StringConstructor
	| BooleanConstructor
	| GObject.GType
	| { $gtype: GObject.GType }
)

type RegisterableSignal = {
	flags?: GObject.SignalFlags,
	param_types?: GObject.GType[],
	return_type?: GObject.GType,
	accumulator?: GObject.AccumulatorType,
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
	T extends NumberConstructor
		? number
		: T extends StringConstructor
			? string
			: T extends BooleanConstructor
				? boolean
				: T extends abstract new (...args: any[]) => infer I
					? I
					: T extends { $gtype: GObject.GType<infer U> }
						? U
						: T extends GObject.GType<infer U>
							? U
							: T
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
	connect<const Self extends GObject.Object, S extends keyof ExtractSignals<D> | keyof SignalsOf<T> | (string & {})>(
		signal_name: S,
		callback: S extends keyof SignalsOf<T>	
			? SignalsOf<T>[S] extends (...args: infer Args) => infer Ret
				? (self: Self, ...args: Args) => Ret
				: never
			: S extends keyof ExtractSignals<D>
				? ExtractSignals<D>[S] extends SignalDescriptor<infer Args, infer Ret>
					? (self: Self, ...args: UnwrapSignalArgs<Args>) => UnwrapSignalArg<Ret>
					: never
				: never
	): number,
	connect_after<const Self extends GObject.Object, S extends keyof ExtractSignals<D> | keyof SignalsOf<T> | (string & {})>(
		signal_name: S,
		callback: S extends keyof SignalsOf<T>
			? SignalsOf<T>[S] extends (...args: infer Args) => infer Ret
				? (self: Self, ...args: Args) => Ret
				: never
			: S extends keyof ExtractSignals<D>
				? ExtractSignals<D>[S] extends SignalDescriptor<infer Args, infer Ret>
					? (self: Self, ...args: UnwrapSignalArgs<Args>) => UnwrapSignalArg<Ret>
					: never
				: never
	): number,
	emit<const S extends keyof ExtractSignals<D> | keyof SignalsOf<T> | (string & {})>(
		signal_name: S,
		...args: S extends keyof SignalsOf<T>
			? SignalsOf<T>[S] extends (...args: infer Args) => any
				? Args
				: never
			: S extends keyof ExtractSignals<D>
				? ExtractSignals<D>[S] extends SignalDescriptor<infer Args, any>
					? UnwrapSignalArgs<Args>
					: never
				: never
	): void,
	// Additions
	$signals: {
		[Key in keyof ExtractSignals<D>]: ExtractSignals<D>[Key] extends SignalDescriptor<infer Args, infer Ret>
			? (...args: UnwrapSignalArgs<Args>) => (Ret extends void ? void : UnwrapSignalArg<Ret>)
			: never
	},
	$signal<const Self extends GObject.Object, S extends keyof ExtractSignals<D> | keyof SignalsOf<T>>(
		this: Self,
		signal_name: S,
	): S extends keyof ExtractSignals<D>
		? ExtractSignals<D>[S] extends SignalDescriptor<infer Args, infer Ret>
			? {
				connect(callback: (self: Self, ...args: UnwrapSignalArgs<Args>) => UnwrapSignalArg<Ret>): number,
			} : never
		: SignalsOf<T>[S] extends (...args: infer Args) => infer Ret
			? {
				connect(callback: (self: Self, ...args: Args) => Ret): number
			} : never
}

const signal_descriptor_args_to_gtypes = (item: SignalArgument): GObject.GType => {
	if (item === Number) return GObject.TYPE_BOOLEAN
	if (item === String) return GObject.TYPE_STRING
	if (item === Boolean) return GObject.TYPE_BOOLEAN
	if ("$gtype" in item) return item.$gtype
	throw new Error(`Attempted to register a GObjectify signal with a non-GObject.GType: '${item}'`)
}

// TODO: ADD DOCS
const Signal = <
    const A extends [] | SignalArgument[] = [],
    const R extends SignalArgument | void = void,
>(
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
		...(parameters && { parameters: parameters.map(signal_descriptor_args_to_gtypes )}),
		...(options?.accumulator && { accumulator: options.accumulator }),
		...(options?.flags && { flags: options.flags }),
		...(options?.return_type && { return_type: signal_descriptor_args_to_gtypes(options.return_type) }),
	} satisfies RegisterableSignal),
} satisfies SignalDescriptor<any, any> as any)

function is_signal_descriptor(item: any): item is SignalDescriptor<SignalArgument[], SignalArgument | void> {
	return item?.signal_symbol === SIGNAL_SYMBOL
}

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
 * @param obj The GObject instance to connect to.
 * @param resolve_signal The signal name whose emission will resolve the promise.
 * @param reject_signal Optional signal name whose emission will reject the promise.
 * @returns A promise that resolves with the arguments emitted by `resolve_signal`.
 *
 * @example
 * ```ts
 * // Wait for a Gtk.Button to be clicked once
 * const button = new Gtk.Button({ label: "Click me" })
 * await connect_async(button, "clicked")
 * print("Button clicked!")
 * ```
 *
 * @example
 * ```ts
 * // Handle a signal that could fail
 * try {
 *     const [result] = await connect_async(obj, "success-signal", "error-signal");
 *     print(`Success: ${result}`);
 * } catch (err) {
 *     print(`Error signal triggered: ${err.message}`);
 * }
 * ```
 */
const connect_async = <T extends GObject.Object, S extends keyof SignalsOf<T>>(
	obj: T,
	resolve_signal: S,
	reject_signal?: keyof SignalsOf<T>,
): Promise<SignalsOf<T>[S] extends ((...args: infer Args) => any) ? Args : never> => new Promise((resolve, reject) => {
	let resolve_id: number | null = null
	let reject_id: number | null = null
	const cleanup = (): void => {
		if (resolve_id !== null) obj.disconnect(resolve_id)
		if (reject_id !== null) obj.disconnect(reject_id)
	}

	resolve_id = obj.connect(resolve_signal as string, (_obj, ...args) => {
		cleanup()
		resolve(args as any)
	})

	if (!reject_signal) return
	reject_id = obj.connect(reject_signal as string, (_obj, ...args: any) => {
		cleanup()
		reject(new Error(`Rejection signal: '${String(reject_signal)}' triggered with args: ${args}`))
	})
})

export {
	type SignalDescriptor,
	type ExtractSignals,
	type SignalArgument,
	type SignalOverrides,
	type SignalsOf,
	type RegisterableSignal,
	Signal,
	is_signal_descriptor,
	connect_async,
}
