import GObject from "gi://GObject?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { ConstMap } from "./__const_map.js"

type GClass<T extends GObject.Object = GObject.Object> = { $gtype: GObject.GType } & (abstract new(...args: any[])=> T)
type GEnum<T extends number = number> = { $gtype: GObject.GType<T> } & { new?: never }

const FLAG_PRESETS = {
	CONSTANT: GObject.ParamFlags.READABLE,
	READWRITE: GObject.ParamFlags.READWRITE,
	CONSTRUCT: GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT,
	CONSTRUCT_ONLY: GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
} as const

const PROPERTY_SYMBOL = Symbol("Symbol for GObjectify Property descriptors")

type ParamFlagStrings = keyof typeof FLAG_PRESETS

type BaseConfig = {
	nick?: string,
	blurb?: string,
	flags?: ParamFlagStrings,
}
type NumberConfig = BaseConfig & {
	min?: number,
	max?: number,
	default?: number,
}
type DefaultableConfig<T> = BaseConfig & {
	default?: T,
}
type BoolConfig = DefaultableConfig<boolean>
type StringConfig = DefaultableConfig<string>

type PropertyDescriptor<ValueType, Flags extends ParamFlagStrings> = {
	readonly value?: ValueType,
	readonly min: number | undefined,
	readonly max: number | undefined,
	readonly flags: Flags,
	readonly property_symbol: typeof PROPERTY_SYMBOL,
	create(name: string): GObject.ParamSpec,
}

type __NoArg = typeof noArgSentinel
declare const noArgSentinel: unique symbol

type Castable<WideType, Config extends DefaultableConfig<WideType>> = {
	/**
	 * Type helper to allow narrowing of property descriptors' types
	 *
	 * @template NarrowType The type used to narrow
	 *
	 * @example
	 * ```ts
	 * as<"yes" | "no">() // Generic argument is REQUIRED
	 * ```
	 */
	as(): [never] & void,
	/**
	 * Type helper to allow narrowing of property descriptors' types
	 *
	 * @template NarrowType The type used to narrow
	 *
	 * @example
	 * ```ts
	 * as<"yes" | "no">() // Generic argument is REQUIRED
	 * ```
	 */
	as<NarrowType extends WideType>(): Config extends { default: infer D }
		? D extends NarrowType
			? PropertyDescriptor<NarrowType, FlagsFrom<Config>>
			: [never] & void
		: [never] & void,
}

type ExtractWriteableProps<D> = {
	[Key in keyof D as D[Key] extends PropertyDescriptor<any, "CONSTRUCT" | "READWRITE">
		? Key
		: never
	]: D[Key] extends PropertyDescriptor<infer T, any> ? T : never
}

type ExtractReadonlyProps<D> = {
	readonly [Key in keyof D as D[Key] extends PropertyDescriptor<any, "CONSTANT" | "CONSTRUCT_ONLY">
		? Key
		: never
	]: D[Key] extends PropertyDescriptor<infer T, any> ? T : never
}

type ExtractConstructProps<D> = {
	[Key in keyof D as D[Key] extends PropertyDescriptor<any, "CONSTRUCT" | "CONSTRUCT_ONLY">
		? Key
		: never
	]: D[Key] extends PropertyDescriptor<infer T, any> ? T : never
}

type FlagsFrom<C extends BaseConfig> = C extends { flags: infer F } ? F : "READWRITE"

const num_sizes_and_spec = new ConstMap(
	["int32", { min: GLib.MININT32, max: GLib.MAXINT32, spec: GObject.ParamSpec.int }],
	["uint32", { min: 0, max: GLib.MAXUINT32, spec: GObject.ParamSpec.uint }],
	["double", { min: -Number.MAX_VALUE, max: Number.MAX_VALUE, spec: GObject.ParamSpec.double }],
)

const get_flags = (flag_string: ParamFlagStrings): GObject.ParamFlags => FLAG_PRESETS[flag_string]

const primitive_property = (kind: "int32" | "uint32" | "double") => {
	return <const C extends NumberConfig>(config?: C): PropertyDescriptor<
		number,
		FlagsFrom<C>
	> & Castable<number, C> => {
		const nick: string | null = config?.nick || null
		const blurb: string | null = config?.blurb || null
		const flags: GObject.ParamFlags = get_flags(config?.flags ?? "READWRITE")
		const range_and_spec = num_sizes_and_spec.get(kind)
		const min = config?.min ?? range_and_spec.min
		const max = config?.max ?? range_and_spec.max
		const default_val = config?.default ?? (0 >= min && 0 <= max ? 0 : min)
		return {
			property_symbol: PROPERTY_SYMBOL,
			min,
			max,
			flags: config?.flags ?? "READWRITE" as any,
			create: (name) => range_and_spec.spec(name, nick, blurb, flags, min, max, default_val),
			as(): any { return this },
		}
	}
}

/**
 * Creates a number property descriptor with the underlying GObject type for use with `from` and `GClass`.
 *
 * @param config Additional configuration for the property
 * @param config.default Initial value of this field when an instance is constructed
 * @param config.nick Nickname for this property
 * @param config.blurb Description for this property
 * @param config.flags Strings representing GObject.ParamFlags
 * - `"CONSTANT"` -> `READABLE`
 * - `"READWRITE"` -> `READWRITE`
 * - `"CONSTRUCT"` -> `READWRITE | CONSTRUCT`
 * - `"CONSTRUCT_ONLY"` -> `READWRITE | CONSTRUCT_ONLY`
 */
const int32 = primitive_property("int32")

/**
 * Creates a number property descriptor with the underlying GObject type for use with `from` and `GClass`.
 *
 * @param config Additional configuration for the property
 * @param config.default Initial value of this field when an instance is constructed
 * @param config.nick Nickname for this property
 * @param config.blurb Description for this property
 * @param config.flags Strings representing GObject.ParamFlags
 * - `"CONSTANT"` -> `READABLE`
 * - `"READWRITE"` -> `READWRITE`
 * - `"CONSTRUCT"` -> `READWRITE | CONSTRUCT`
 * - `"CONSTRUCT_ONLY"` -> `READWRITE | CONSTRUCT_ONLY`
 */
const uint32 = primitive_property("uint32")

/**
 * Creates a number property descriptor with the underlying GObject type for use with `from` and `GClass`.
 *
 * @param config Additional configuration for the property
 * @param config.default Initial value of this field when an instance is constructed
 * @param config.nick Nickname for this property
 * @param config.blurb Description for this property
 * @param config.flags Strings representing GObject.ParamFlags
 * - `"CONSTANT"` -> `READABLE`
 * - `"READWRITE"` -> `READWRITE`
 * - `"CONSTRUCT"` -> `READWRITE | CONSTRUCT`
 * - `"CONSTRUCT_ONLY"` -> `READWRITE | CONSTRUCT_ONLY`
 */
const double = primitive_property("double")

/**
 * Creates a string property descriptor for use with `from` and `GClass`.
 *
 * @param config Additional configuration for the property
 * @param config.default Initial value of this field when an instance is constructed
 * @param config.nick Nickname for this property
 * @param config.blurb Description for this property
 * @param config.flags Strings representing GObject.ParamFlags
 * - `"CONSTANT"` -> `READABLE`
 * - `"READWRITE"` -> `READWRITE`
 * - `"CONSTRUCT"` -> `READWRITE | CONSTRUCT`
 * - `"CONSTRUCT_ONLY"` -> `READWRITE | CONSTRUCT_ONLY`
 */
const string = <const C extends StringConfig>(
	config?: C,
): PropertyDescriptor<string, FlagsFrom<C>> & Castable<string, C> => {
	const nick: string | null = config?.nick || null
	const blurb: string | null = config?.blurb || null
	const flags: GObject.ParamFlags = get_flags(config?.flags ?? "READWRITE")
	return {
		property_symbol: PROPERTY_SYMBOL,
		min: undefined,
		max: undefined,
		flags: config?.flags ?? "READWRITE" as any,
		create: (name) => GObject.ParamSpec.string(name, nick, blurb, flags, config?.default ?? ""),
		as(): any { return this },
	}
}

/**
 * Creates a boolean property descriptor for use with `from` and `GClass`.
 *
 * @param config Additional configuration for the property
 * @param config.default Initial value of this field when an instance is constructed
 * @param config.nick Nickname for this property
 * @param config.blurb Description for this property
 * @param config.flags Strings representing GObject.ParamFlags
 * - `"CONSTANT"` -> `READABLE`
 * - `"READWRITE"` -> `READWRITE`
 * - `"CONSTRUCT"` -> `READWRITE | CONSTRUCT`
 * - `"CONSTRUCT_ONLY"` -> `READWRITE | CONSTRUCT_ONLY`
 */
const bool = <const C extends BoolConfig>(
	config?: C,
): PropertyDescriptor<boolean, FlagsFrom<C>> & Castable<boolean, C> => {
	const nick: string | null = config?.nick || null
	const blurb: string | null = config?.blurb || null
	const flags: GObject.ParamFlags = get_flags(config?.flags ?? "READWRITE")
	return {
		property_symbol: PROPERTY_SYMBOL,
		min: undefined,
		max: undefined,
		flags: config?.flags ?? "READWRITE" as any,
		create: (name) => GObject.ParamSpec.boolean(name, nick, blurb, flags, config?.default ?? false),
		as(): any { return this },
	}
}

/**
 * Creates a GObject.Object property descriptor for use with `from` and `GClass`.
 *
 * All GObject.Object properties are also nullable, because GObject cannot ensure that a null value isn't set.
 * The default value for GObject.Object properties is null, and cannot be changed.
 *
 * @param kind The GObject class that this property will be typed too
 * @param config Additional configuration for the property
 * @param config.nick Nickname for this property
 * @param config.blurb Description for this property
 * @param config.flags Strings representing GObject.ParamFlags
 * - `"CONSTANT"` -> `READABLE`
 * - `"READWRITE"` -> `READWRITE`
 * - `"CONSTRUCT"` -> `READWRITE | CONSTRUCT`
 * - `"CONSTRUCT_ONLY"` -> `READWRITE | CONSTRUCT_ONLY`
 */
const gobject = <G extends GClass, C extends BaseConfig>(kind: G, config?: C): PropertyDescriptor<
	InstanceType<G> | null,
	FlagsFrom<C>
> & {
	/**
	 * Type helper to allow narrowing of property descriptors' types
	 *
	 * @template NarrowType The type used to narrow
	 *
	 * @example
	 * ```ts
	 * as<Gtk.Label | Gtk.Box>() // Generic argument is REQUIRED
	 * ```
	 */
	as(): [never] & void,
	/**
	 * Type helper to allow narrowing of property descriptors' types
	 *
	 * @template NarrowType The type used to narrow
	 *
	 * @example
	 * ```ts
	 * as<Gtk.Label | Gtk.Box>() // Generic argument is REQUIRED
	 * ```
	 */
	as<NarrowType extends InstanceType<G>>(): PropertyDescriptor<NarrowType | null, FlagsFrom<C>>,
} => {
	const nick: string | null = config?.nick || null
	const blurb: string | null = config?.blurb || null
	const flags: GObject.ParamFlags = get_flags(config?.flags ?? "READWRITE")
	return {
		property_symbol: PROPERTY_SYMBOL,
		min: undefined,
		max: undefined,
		flags: config?.flags ?? "READWRITE" as any,
		create: (name) => GObject.ParamSpec.object(name, nick, blurb, flags, kind),
		as(): any { return this },
	}
}

/**
 * Creates a GObject Enum property descriptor for use with `from` and `GClass`.
 *
 * @param kind The GObject Enum class that this property will be typed too
 * @param config Additional configuration for the property
 * @param config.default Initial value of this field when an instance is constructed
 * @param config.nick Nickname for this property
 * @param config.blurb Description for this property
 * @param config.flags Strings representing GObject.ParamFlags
 * - `"CONSTANT"` -> `READABLE`
 * - `"READWRITE"` -> `READWRITE`
 * - `"CONSTRUCT"` -> `READWRITE | CONSTRUCT`
 * - `"CONSTRUCT_ONLY"` -> `READWRITE | CONSTRUCT_ONLY`
 */
const genum = <G extends number, C extends DefaultableConfig<G>>(
	kind: GEnum<G>,
	config?: C,
): PropertyDescriptor<G, FlagsFrom<C>> => {
	const nick: string | null = config?.nick || null
	const blurb: string | null = config?.blurb || null
	const flags: GObject.ParamFlags = get_flags(config?.flags ?? "READWRITE")
	return {
		property_symbol: PROPERTY_SYMBOL,
		min: undefined,
		max: undefined,
		flags: config?.flags ?? "READWRITE" as any,
		create: (name) => GObject.ParamSpec.enum(name, nick, blurb, flags, kind, config?.default ?? null),
	}
}

/**
 * Creates a JavaScript object property descriptor for use with `from` and `GClass`.
 *
 * All JS object properties are also nullable, because GObject cannot ensure that a null value isn't set.
 * The default value for JS object properties is null, and cannot be changed.
 *
 * @param config Additional configuration for the property
 * @param config.nick Nickname for this property
 * @param config.blurb Description for this property
 * @param config.flags Strings representing GObject.ParamFlags
 * - `"CONSTANT"` -> `READABLE`
 * - `"READWRITE"` -> `READWRITE`
 * - `"CONSTRUCT"` -> `READWRITE | CONSTRUCT`
 * - `"CONSTRUCT_ONLY"` -> `READWRITE | CONSTRUCT_ONLY`
 */
const jsobject = <C extends BaseConfig>(config?: C): PropertyDescriptor<{} | null, FlagsFrom<C>> & {
	/**
	 * Type helper to allow narrowing of property descriptors' types
	 *
	 * @template NarrowType The type used to narrow
	 *
	 * @example
	 * ```ts
	 * as<Gtk.Label | Gtk.Box>() // Generic argument is REQUIRED
	 * ```
	 */
	as(): [never] & void,
	/**
	 * Type helper to allow narrowing of property descriptors' types
	 *
	 * @template NarrowType The type used to narrow
	 *
	 * @example
	 * ```ts
	 * as<number[]>() // Generic argument is REQUIRED
	 * ```
	 */
	as<NarrowType extends {}>(): PropertyDescriptor<NarrowType | null, FlagsFrom<C>>,
} => {
	const nick: string | null = config?.nick || null
	const blurb: string | null = config?.blurb || null
	const flags: GObject.ParamFlags = get_flags(config?.flags ?? "READWRITE")
	return {
		property_symbol: PROPERTY_SYMBOL,
		min: undefined,
		max: undefined,
		flags: config?.flags ?? "READWRITE" as any,
		create: (name) => GObject.ParamSpec.jsobject(name, nick, blurb, flags),
		as(): any { return this },
	}
}

const is_property_descriptor = (item: any): item is PropertyDescriptor<any, any> => (
	item?.property_symbol === PROPERTY_SYMBOL
)

const Property = { int32, uint32, double, string, bool, jsobject, gobject, genum } as const
export { Property, is_property_descriptor }
export type { PropertyDescriptor, ExtractWriteableProps, ExtractReadonlyProps, ExtractConstructProps }
