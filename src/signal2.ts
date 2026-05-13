import GObject from "gi://GObject?version=2.0"
import { gtype_for } from "./types"
import type { BaseTypes, TypeDescriptor, InstanceFor, InstancesForArray } from "./types"

const SIGNAL_SYMBOL = Symbol("Symbol for GObjectify Signal descriptors")

type RegisterableSignal = {
	param_types: GObject.GType[],
	return_type: GObject.GType | undefined,
	accumulator: GObject.AccumulatorType | undefined,
	flags: GObject.SignalFlags | undefined,
}

class SignalDescriptor<A extends any[], R> {
	readonly signal_symbol: typeof SIGNAL_SYMBOL = SIGNAL_SYMBOL

	constructor(
		private readonly $__ts_params: A,
		private readonly $__ts_returns: R,
		readonly signal: RegisterableSignal,
	) {}
}

type UnderscoreToHyphen<S> = (S extends `${infer Head}_${infer Tail}`
	? `${Head}-${UnderscoreToHyphen<Tail>}`
	: S
)

type ExtractSignals<D> = {
	[Key in keyof D as D[Key] extends SignalDescriptor<any, any>
		? UnderscoreToHyphen<Key>
		: never
	]: D[Key] extends SignalDescriptor<any, any> ? D[Key] : never
}

type SignalsOf<T extends GObject.Object> = {
	[K in keyof T["$signals"] as string extends K
		? never
		: `notify::${string}` extends K
			? never
			: K
	]: T["$signals"][K]
}

function Signal<
	const A extends (BaseTypes | TypeDescriptor<any>)[] = [],
	const R extends BaseTypes | TypeDescriptor<any> | void = void,
>(
	params?: A,
	config?: {
		return_type?: R,
		accumulator?: GObject.AccumulatorType,
		flags?: GObject.SignalFlags,
	}
): SignalDescriptor<
	A extends (BaseTypes | TypeDescriptor<any>)[]
		? InstancesForArray<A>
		: [],
	R extends BaseTypes | TypeDescriptor<any>
		? InstanceFor<R>
		: void
> {
	const ret = config?.return_type && gtype_for(config.return_type)
	return new SignalDescriptor(
		undefined as any,
		config?.return_type,
		{
			param_types: params?.map(gtype_for) ?? [],
			return_type: ret,
			accumulator: config?.accumulator,
			flags: config?.flags,
		}
	) as any
}

const is_signal_descriptor = (item: any): item is SignalDescriptor<any, any> => item?.signal_symbol === SIGNAL_SYMBOL

type SignalOverrides<T extends GObject.Object, D> = {
	$connect<const Self extends GObject.Object, S extends keyof ExtractSignals<D> | keyof SignalsOf<T>>(
		signal_name: S,
		callback: SignalsOf<T>[S] extends (...args: infer Args) => infer Ret
			? (self: Self, ...args: Args) => Ret
			: S extends keyof ExtractSignals<D>
				? ExtractSignals<D>[S] extends SignalDescriptor<infer Args, infer Ret>
					? (self: Self, ...args: Args) => Ret
					:  never
				: never
	): number,
	$connect_after<const Self extends GObject.Object, S extends keyof ExtractSignals<D> | keyof SignalsOf<T>>(
		signal_name: S,
		callback: SignalsOf<T>[S] extends (...args: infer Args) => infer Ret
			? (self: Self, ...args: Args) => Ret
			: S extends keyof ExtractSignals<D>
				? ExtractSignals<D>[S] extends SignalDescriptor<infer Args, infer Ret>
					? (self: Self, ...args: Args) => Ret
					:  never
				: never
	): number,
	$emit<S extends keyof ExtractSignals<D> | keyof SignalsOf<T>>(
		signal_name: S,
		...args: SignalsOf<T>[S] extends (...args: infer Args) => any
			? Args
			: S extends keyof ExtractSignals<D>
				? ExtractSignals<D>[S] extends SignalDescriptor<infer Args, any>
					? Args
					: never
				: never
	): void,
	$connect_async<S extends keyof ExtractSignals<D> | keyof SignalsOf<T>>(
		resolve_signal: S,
		reject_signal?: keyof ExtractSignals<D> | keyof SignalsOf<T>,
	): SignalsOf<T>[S] extends (...args: infer Args) => void
		? Promise<Args>
		: S extends keyof ExtractSignals<D>
			? ExtractSignals<D>[S] extends SignalDescriptor<infer Args, any>
				? Promise<Args>
				: never
			: never
	$signals: {
		[Key in keyof ExtractSignals<D>]: ExtractSignals<D>[Key] extends SignalDescriptor<infer Args, infer Ret>
			? (...args: Args) => Ret
			: never
	}
}

export {
	SignalDescriptor,
	// type ExtractSignals,
	type SignalOverrides,
	type SignalsOf,
	type RegisterableSignal,
	Signal,
	is_signal_descriptor,
}
