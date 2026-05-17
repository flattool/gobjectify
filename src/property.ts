import GObject from "gi://GObject?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { ConstMap } from "./const_map"

type Class<T = any> = abstract new (...args: any[]) => T
type GClass<T extends GObject.Object = GObject.Object> = { $gtype: GObject.GType } & (abstract new (...args: any[]) => T)
type GEnum<T extends number = number> = { $gtype: GObject.GType<T> }

const FLAG_PRESETS = {
	readwrite: GObject.ParamFlags.CONSTRUCT | GObject.ParamFlags.READWRITE,
	readonly: GObject.ParamFlags.CONSTRUCT | GObject.ParamFlags.READWRITE, // Will be treated by GObjectify as readonly post-init
	computed: GObject.ParamFlags.READWRITE, // CONSTRUCT removed so that `override get` and `override set` will work
	const: GObject.ParamFlags.READABLE,
} as const

type ParamFlagStrings = keyof typeof FLAG_PRESETS
type DEFAULT_FLAG = "readwrite"
const DEFAULT_FLAG: ParamFlagStrings = "readwrite" satisfies DEFAULT_FLAG
const PROPERTY_SYMBOL = Symbol("Symbol for GObjectify Property descriptors")

type PropertyDescriptor<Value, Flags extends ParamFlagStrings> = {
	readonly value?: Value,
	readonly min?: number | undefined,
	readonly max?: number | undefined,
	readonly flags: Flags,
	readonly property_symbol: typeof PROPERTY_SYMBOL,
	create(name: string): GObject.ParamSpec,
}

type Castable<Wide, Default, F extends ParamFlagStrings> = {
	as<Narrow extends Wide>(): (
		Default extends Narrow ? PropertyDescriptor<Narrow, F> :
		[never] & void
	)
}

type ExtractWriteableProps<D> = {
	[Key in keyof D as D[Key] extends PropertyDescriptor<any, "readwrite" | "computed">
		? Key
		: never
	]: D[Key] extends PropertyDescriptor<infer T, any> ? T : never
}
type ExtractReadonlyProps<D> = {
	readonly [Key in keyof D as D[Key] extends PropertyDescriptor<any, "readonly" | "const">
		? Key
		: never
	]: D[Key] extends PropertyDescriptor<infer T, any> ? T : never
}
type ExtractConstructProps<D> = {
	[Key in keyof D as D[Key] extends PropertyDescriptor<any, "readonly" | "readwrite">
		? Key
		: never
	]: D[Key] extends PropertyDescriptor<infer T, any> ? T : never
}

type MinMax = {
	min?: number,
	max?: number,
}

const num_sizes_and_spec = new ConstMap(
	["int32", { min: GLib.MININT32, max: GLib.MAXINT32, spec: GObject.ParamSpec.int }],
	["uint32", { min: 0, max: GLib.MAXUINT32, spec: GObject.ParamSpec.uint }],
	["double", { min: -Number.MAX_VALUE, max: Number.MAX_VALUE, spec: GObject.ParamSpec.double }],
)

// TODO: Add castable
function numeric_prop(kind: "int32" | "uint32" | "double") {
	const { min: default_min, max: default_max, spec } = num_sizes_and_spec.get(kind)
	return <N extends number | undefined, F extends ParamFlagStrings | undefined>(
		flag: F = DEFAULT_FLAG as F,
		...args: (
			F extends "computed" ? [] :
			F extends "const" ? [default_value: N, config?: MinMax] :
			[default_value?: N, config?: MinMax]
		)
	): PropertyDescriptor<number, FlagsFor<F>> => {
		const flags = flag as ParamFlagStrings
		const config = args[1]
		const min = config?.min ?? default_min
		const max = config?.max ?? default_max
		const default_value = args[0] ?? (0 >= min && 0 <= max ? 0 : min)
		if (default_value < min || default_value > max) throw new RangeError(
			`Default value '${default_value}' is out of range for property of type '${kind}' with min '${min}' and max '${max}'`
		)
		return {
			flags: flag as any,
			property_symbol: PROPERTY_SYMBOL,
			min,
			max,
			create: (name) => spec(name, null, null, FLAG_PRESETS[flags], min, max, default_value)
		}
	}
}

type FlagsFor<F extends ParamFlagStrings | undefined> = (
	F extends undefined ? never :
	undefined extends F ? DEFAULT_FLAG :
	F
)

const Property = {
	int32: numeric_prop("int32"),
	uint32: numeric_prop("uint32"),
	double: numeric_prop("double"),

	string<S extends string, F extends ParamFlagStrings | undefined>(
		flag?: F,
		...args: (
			F extends "computed" ? [] :
			F extends "const" ? [default_value: S] :
			[default_value?: S]
		)
	): PropertyDescriptor<string, FlagsFor<F>> & Castable<string, S, FlagsFor<F>> {
		const default_value = args[0] ?? ""
		const flags = flag as ParamFlagStrings
		return {
			flags: flag as any,
			property_symbol: PROPERTY_SYMBOL,
			create: (name) => GObject.ParamSpec.string(name, null, null, FLAG_PRESETS[flags], default_value),
			as(): any { return this },
		}
	},

	bool<B extends boolean | undefined, F extends ParamFlagStrings | undefined>(
		flag: F = DEFAULT_FLAG as F,
		...args: (
			F extends "computed" ? [] :
			F extends "const" ? [default_value?: B] :
			[default_value?: B]
		)
	): PropertyDescriptor<boolean, FlagsFor<F>> & Castable<boolean, B, FlagsFor<F>> {
		const default_value = args[0] ?? false
		const flags = flag as ParamFlagStrings
		return {
			flags: flag as any,
			property_symbol: PROPERTY_SYMBOL,
			create: (name) => GObject.ParamSpec.boolean(name, null, null, FLAG_PRESETS[flags], default_value),
			as(): any { return this },
		}
	},

	// Due to default always being null, it makes no sense for GObject to be const
	gobject<G extends GClass, F extends Exclude<ParamFlagStrings, "const"> | undefined>(
		kind: G,
		flag: F = DEFAULT_FLAG as F,
	): PropertyDescriptor<InstanceType<G>, FlagsFor<F>> & Castable<GObject.Object, InstanceType<G>, FlagsFor<F>> {
		const flags = flag as ParamFlagStrings
		return {
			flags: flag as any,
			property_symbol: PROPERTY_SYMBOL,
			create: (name) => GObject.ParamSpec.object(name, null, null, FLAG_PRESETS[flags], kind.$gtype),
			as(): any { return this },
		}
	},

	// Due to uncertain default values, GEnum cannot be computed
	genum<G extends number, F extends Exclude<ParamFlagStrings, "computed"> | undefined>(
		kind: GEnum<G>,
		default_value: G,
		flag: F = DEFAULT_FLAG as F,
	): PropertyDescriptor<G, FlagsFor<F>> {
		const flags = flag as ParamFlagStrings
		return {
			flags: flag as any,
			property_symbol: PROPERTY_SYMBOL,
			create: (name) => GObject.ParamSpec.enum(name, null, null, FLAG_PRESETS[flags], kind.$gtype, default_value)
		}
	},

	// Due to default always being null, it makes no sense for JSObject to be const
	jsobject<K extends Class, F extends Exclude<ParamFlagStrings, "const"> | undefined>(
		kind: K,
		flag: F = DEFAULT_FLAG as F,
	): PropertyDescriptor<InstanceType<K>, FlagsFor<F>> & Castable<any, InstanceType<K>, FlagsFor<F>> {
		const flags = flag as ParamFlagStrings
		void kind
		return {
			flags: flag as any,
			property_symbol: PROPERTY_SYMBOL,
			create: (name) => GObject.ParamSpec.jsobject(name, null, null, FLAG_PRESETS[flags]),
			as(): any { return this },
		}
	},
} as const

const is_property_descriptor = (item: any): item is PropertyDescriptor<any, ParamFlagStrings> => (
	item?.property_symbol === PROPERTY_SYMBOL
)

export { Property, is_property_descriptor, num_sizes_and_spec }
export type { PropertyDescriptor, ExtractWriteableProps, ExtractReadonlyProps, ExtractConstructProps }

let str = Property.string()