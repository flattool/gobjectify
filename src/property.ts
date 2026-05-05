import GObject from "gi://GObject?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { ConstMap } from "./const_map.js"

type GClass<T extends GObject.Object = GObject.Object> = { $gtype: GObject.GType } & (abstract new(...args: any[])=> T)
type GEnum<T extends number = number> = { $gtype: GObject.GType<T> } & { new?: never }

const FLAG_PRESETS = {
	readwrite: GObject.ParamFlags.CONSTRUCT | GObject.ParamFlags.READWRITE,
	readonly: GObject.ParamFlags.CONSTRUCT | GObject.ParamFlags.READWRITE, // Will be treated by GObjectify as readonly post-init
	computed: GObject.ParamFlags.READWRITE, // CONSTRUCT removed so that `override get` and `override set` will work
	const: GObject.ParamFlags.READABLE,
} as const

type DEFAULT_FLAG = "readwrite"
const DEFAULT_FLAG: keyof typeof FLAG_PRESETS = "readwrite" satisfies DEFAULT_FLAG

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
	[Key in keyof D as D[Key] extends PropertyDescriptor<any, "computed" | "readwrite">
		? Key
		: never
	]: D[Key] extends PropertyDescriptor<infer T, any> ? T : never
}

type ExtractReadonlyProps<D> = {
	readonly [Key in keyof D as D[Key] extends PropertyDescriptor<any, "const" | "readonly">
		? Key
		: never
	]: D[Key] extends PropertyDescriptor<infer T, any> ? T : never
}

type ExtractConstructProps<D> = {
	[Key in keyof D as D[Key] extends PropertyDescriptor<any, "readonly">
		? Key
		: never
	]: D[Key] extends PropertyDescriptor<infer T, any> ? T : never
}

type FlagsFrom<C extends BaseConfig> = C extends { flags: infer F } ? F : DEFAULT_FLAG

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
		const flags: GObject.ParamFlags = get_flags(config?.flags ?? DEFAULT_FLAG)
		const range_and_spec = num_sizes_and_spec.get(kind)
		const min = config?.min ?? range_and_spec.min
		const max = config?.max ?? range_and_spec.max
		const default_val = config?.default ?? (0 >= min && 0 <= max ? 0 : min)
		if (default_val < min || default_val > max) {
			throw new RangeError(`Default value ${default_val} is out of range for property of type ${kind} with min ${min} and max ${max}`)
		}
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

const int32 = primitive_property("int32")
const uint32 = primitive_property("uint32")
const double = primitive_property("double")

const string = <const C extends StringConfig>(
	config?: C,
): PropertyDescriptor<string, FlagsFrom<C>> & Castable<string, C> => {
	const nick: string | null = config?.nick || null
	const blurb: string | null = config?.blurb || null
	const flags: GObject.ParamFlags = get_flags(config?.flags ?? DEFAULT_FLAG)
	return {
		property_symbol: PROPERTY_SYMBOL,
		min: undefined,
		max: undefined,
		flags: config?.flags ?? DEFAULT_FLAG as any,
		create: (name) => GObject.ParamSpec.string(name, nick, blurb, flags, config?.default ?? ""),
		as(): any { return this },
	}
}

const bool = <const C extends BoolConfig>(
	config?: C,
): PropertyDescriptor<boolean, FlagsFrom<C>> & Castable<boolean, C> => {
	const nick: string | null = config?.nick || null
	const blurb: string | null = config?.blurb || null
	const flags: GObject.ParamFlags = get_flags(config?.flags ?? DEFAULT_FLAG)
	return {
		property_symbol: PROPERTY_SYMBOL,
		min: undefined,
		max: undefined,
		flags: config?.flags ?? DEFAULT_FLAG as any,
		create: (name) => GObject.ParamSpec.boolean(name, nick, blurb, flags, config?.default ?? false),
		as(): any { return this },
	}
}

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
	const flags: GObject.ParamFlags = get_flags(config?.flags ?? DEFAULT_FLAG)
	return {
		property_symbol: PROPERTY_SYMBOL,
		min: undefined,
		max: undefined,
		flags: config?.flags ?? DEFAULT_FLAG as any,
		create: (name) => GObject.ParamSpec.object(name, nick, blurb, flags, kind),
		as(): any { return this },
	}
}

const genum = <G extends number, C extends BaseConfig>(
	kind: GEnum<G>,
	default_value: G,
	config?: C,
): PropertyDescriptor<G, FlagsFrom<C>> => {
	const nick: string | null = config?.nick || null
	const blurb: string | null = config?.blurb || null
	const flags: GObject.ParamFlags = get_flags(config?.flags ?? DEFAULT_FLAG)
	return {
		property_symbol: PROPERTY_SYMBOL,
		min: undefined,
		max: undefined,
		flags: config?.flags ?? DEFAULT_FLAG as any,
		create: (name) => GObject.ParamSpec.enum(name, nick, blurb, flags, kind, default_value),
	}
}

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
	const flags: GObject.ParamFlags = get_flags(config?.flags ?? DEFAULT_FLAG)
	return {
		property_symbol: PROPERTY_SYMBOL,
		min: undefined,
		max: undefined,
		flags: config?.flags ?? DEFAULT_FLAG as any,
		create: (name) => GObject.ParamSpec.jsobject(name, nick, blurb, flags),
		as(): any { return this },
	}
}

const is_property_descriptor = (item: any): item is PropertyDescriptor<any, ParamFlagStrings> => (
	item?.property_symbol === PROPERTY_SYMBOL
)

/**
 * Object containing functions for creating GObject property descriptors,to be used with `from()` and `GClass`.
 * Each function corresponds to a different type of property, and accepts an optional configuration object to set details about the property.
 * See each function for details.
 * 
 * Every property made through this is marked as GObject.ParamFlags.CONSTRUCT, meaning their initial values will be available during construction.
 */
const Property = {
	/**
	 * Creates a number property descriptor, known to GObject as an int32, for use with `from` and `GClass`.
	 * The largest possible range for this property is that of a signed 32-bit integer, but this can be reduced with the `min` and `max` config options.
	 *
	 * @param config Additional configuration for the property
	 * @param config.default Initial value of this field when an instance is constructed, defaults to `0` or `min` if `0` is out of range
	 * @param config.min Minimum allowed value. Defaults to `MIN_INT32`
	 * @param config.max Maximum allowed value. Defaults to `MAX_INT32`
	 * @param config.nick Nickname for this property
	 * @param config.blurb Description for this property
	 * @param config.flags Controls the mutability of the property on the instance, with the following options:
	 * - `"readwrite"` (default) -> Readable and writeable at all times.
	 * - `"readonly"` -> May be set during construction, but is read-only post-construction.
	 * - `"computed"` -> Allows for defining getters and setters for custom computed properties. Property will *NOT* be available during construction or init.
	 * - `"const"` -> Read-only. It cannot be set at any point. To change the value, use the `default` config option.
	*/
	int32,
	/**
	 * Creates a number property descriptor, known to GObject as a uint32, for use with `from` and `GClass`.
	 * The largest possible range for this property is that of an unsigned 32-bit integer, but this can be reduced with the `min` and `max` config options.
	 *
	 * @param config Additional configuration for the property
	 * @param config.default Initial value of this field when an instance is constructed, defaults to `0` or `min` if `0` is out of range
	 * @param config.min Minimum allowed value. Defaults to `0`
	 * @param config.max Maximum allowed value. Defaults to `MAX_UINT32`
	 * @param config.nick Nickname for this property
	 * @param config.blurb Description for this property
	 * @param config.flags Controls the mutability of the property on the instance, with the following options:
	 * - `"readwrite"` (default) -> Readable and writeable at all times.
	 * - `"readonly"` -> May be set during construction, but is read-only post-construction.
	 * - `"computed"` -> Allows for defining getters and setters for custom computed properties. Property will *NOT* be available during construction or init.
	 * - `"const"` -> Read-only. It cannot be set at any point. To change the value, use the `default` config option.
	*/
	uint32,
	/**
	 * Creates a number property descriptor, known to GObject as a double, for use with `from` and `GClass`.
	 * The largest possible range for this property is that of a double, but this can be reduced with the `min` and `max` config options.
	 *
	 * @param config Additional configuration for the property
	 * @param config.default Initial value of this field when an instance is constructed, defaults to `0` or `min` if `0` is out of range
	 * @param config.min Minimum allowed value. Defaults to `-Number.MAX_VALUE`
	 * @param config.max Maximum allowed value. Defaults to `Number.MAX_VALUE`
	 * @param config.nick Nickname for this property
	 * @param config.blurb Description for this property
	 * @param config.flags Controls the mutability of the property on the instance, with the following options:
	 * - `"readwrite"` (default) -> Readable and writeable at all times.
	 * - `"readonly"` -> May be set during construction, but is read-only post-construction.
	 * - `"computed"` -> Allows for defining getters and setters for custom computed properties. Property will *NOT* be available during construction or init.
	 * - `"const"` -> Read-only. It cannot be set at any point. To change the value, use the `default` config option.
	*/
	double,
	/**
	 * Creates a string property descriptor for use with `from` and `GClass`.
	 *
	 * @param config Additional configuration for the property
	 * @param config.default Initial value of this field when an instance is constructed, defaults to "" (an empty string)
	 * @param config.nick Nickname for this property
	 * @param config.blurb Description for this property
	 * @param config.flags Controls the mutability of the property on the instance, with the following options:
	 * - `"readwrite"` (default) -> Readable and writeable at all times.
	 * - `"readonly"` -> May be set during construction, but is read-only post-construction.
	 * - `"computed"` -> Allows for defining getters and setters for custom computed properties. Property will *NOT* be available during construction or init.
	 * - `"const"` -> Read-only. It cannot be set at any point. To change the value, use the `default` config option.
	 */
	string,
	/**
	 * Creates a boolean property descriptor for use with `from` and `GClass`.
	 *
	 * @param config Additional configuration for the property
	 * @param config.default Initial value of this field when an instance is constructed, defaults to false
	 * @param config.nick Nickname for this property
	 * @param config.blurb Description for this property
	 * @param config.flags Controls the mutability of the property on the instance, with the following options:
	 * - `"readwrite"` (default) -> Readable and writeable at all times.
	 * - `"readonly"` -> May be set during construction, but is read-only post-construction.
	 * - `"computed"` -> Allows for defining getters and setters for custom computed properties. Property will *NOT* be available during construction or init.
	 * - `"const"` -> Read-only. It cannot be set at any point. To change the value, use the `default` config option.
	 */
	bool,
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
	 * @param config.flags Controls the mutability of the property on the instance, with the following options:
	 * - `"readwrite"` (default) -> Readable and writeable at all times.
	 * - `"readonly"` -> May be set during construction, but is read-only post-construction.
	 * - `"computed"` -> Allows for defining getters and setters for custom computed properties. Property will *NOT* be available during construction or init.
	 * - `"const"` -> Not meaningful for object properties, as the default is always `null` and cannot be changed. Prefer `"readonly"` if you want a set-once property.
	*/
	gobject,
	/**
	 * Creates a GObject Enum property descriptor for use with `from` and `GClass`.
	*
	* @param kind The GObject Enum class that this property will be typed to
	* @param config Additional configuration for the property
	* @param config.default Initial value of this field when an instance is constructed, defaults to 0 (which may not be a valid value for the enum type)
	* @param config.nick Nickname for this property
	* @param config.blurb Description for this property
	* @param config.flags Controls the mutability of the property on the instance, with the following options:
	* - `"readwrite"` (default) -> Readable and writeable at all times.
	* - `"readonly"` -> May be set during construction, but is read-only post-construction.
	* - `"computed"` -> Allows for defining getters and setters for custom computed properties. Property will *NOT* be available during construction or init.
	* - `"const"` -> Read-only. It cannot be set at any point. To change the value, use the `default` config option.
	*/
	genum,
	/**
	 * Creates a JavaScript object property descriptor for use with `from` and `GClass`.
	*
	* All JS object properties are also nullable, because GObject cannot ensure that a null value isn't set.
	* The default value for JS object properties is null, and cannot be changed.
	*
	* @param config Additional configuration for the property
	* @param config.nick Nickname for this property
	* @param config.blurb Description for this property
	* @param config.flags Controls the mutability of the property on the instance, with the following options:
	* - `"readwrite"` (default) -> Readable and writeable at all times.
	* - `"readonly"` -> May be set during construction, but is read-only post-construction.
	* - `"computed"` -> Allows for defining getters and setters for custom computed properties. Property will *NOT* be available during construction or init.
	* - `"const"` -> Not meaningful for jsobject properties, as the default is always `null` and cannot be changed. Prefer `"readonly"` if you want a set-once property.
	*/
	jsobject,
} as const
export { Property, is_property_descriptor, num_sizes_and_spec }
export type { PropertyDescriptor, ExtractWriteableProps, ExtractReadonlyProps, ExtractConstructProps }
