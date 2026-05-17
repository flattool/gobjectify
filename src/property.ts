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

type FlagsFor<F extends ParamFlagStrings | undefined> = (
	F extends undefined ? never :
	undefined extends F ? DEFAULT_FLAG :
	F
)

type PropertyDescriptor<Value, Flags extends ParamFlagStrings> = {
	readonly value?: Value,
	readonly min?: number | undefined,
	readonly max?: number | undefined,
	readonly flags: Flags,
	readonly property_symbol: typeof PROPERTY_SYMBOL,
	create(name: string): GObject.ParamSpec,
}

type PrimitiveCastable<Wide, Default, F extends ParamFlagStrings> = {
	/**
	 * Type helper to allow narrowing of a property descriptor's type.
	 * A default value is required to exist, and the default value must extend the narrowed value.
	 * 
	 * @template Narrow The narrowed type
	 * 
	 * @example
	 * ```ts
	 * Property.string("readwrite", "user").as<"user" | "admin">() // This property now only allows "user" or "admin", instead of all strings
	 * ```
	 */
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

function numeric_prop(kind: "int32" | "uint32" | "double") {
	const { min: default_min, max: default_max, spec } = num_sizes_and_spec.get(kind)
	return <N extends number | undefined, F extends ParamFlagStrings | undefined>(
		flag: F = DEFAULT_FLAG as F,
		...args: (
			F extends "computed" ? [] :
			F extends "const" ? [default_value: N, config?: MinMax] :
			[default_value?: N, config?: MinMax]
		)
	): PropertyDescriptor<number, FlagsFor<F>> & PrimitiveCastable<number, N, FlagsFor<F>> => {
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
			create: (name) => spec(name, null, null, FLAG_PRESETS[flags], min, max, default_value),
			as(): any { return this },
		}
	}
}

const Property = {
	/**
	 * Creates a number property descriptor, known to GObject as an int32, for use with `from` and `GClass`.
	 * The largest possible range for this property is that of a signed 32-bit integer, but this can be reduced with the `min` and `max` config options.
	 * 
	 * @param flag Controls the mutability of the property on the instance, with the following options:
	 * - `"readwrite"` (default) -> Readable and writeable at all times.
	 * - `"readonly"` -> May be set during construction via `super()`, but is read-only post-construction.
	 * - `"computed"` -> Allows for defining getters and setters. Property will *NOT* be available during construction, and cannot be set with `new` or `super()`.
	 * - `"const"` -> Truly read-only. It cannot be set at any point. To change the value, use the `default_value` parameter.
	 * @param default_value The default value to give to the property. Defaults to `0` or `min` if `0` is out of range.
	 * `"computed"` properties cannot accept a default, `"const"` properties require a default.
	 * @param config Extra configuration options. `"computed"` properties cannot accept a config.
	 * @param config.min Minimum allowed value. Defaults to `MIN_INT32`
	 * @param config.max Maximum allowed value. Defaults to `MAX_INT32`
	 */
	int32: numeric_prop("int32"),
	/**
	 * Creates a number property descriptor, known to GObject as a uint32, for use with `from` and `GClass`.
	 * The largest possible range for this property is that of an unsigned 32-bit integer, but this can be reduced with the `min` and `max` config options.
	 * 
	 * @param flag Controls the mutability of the property on the instance, with the following options:
	 * - `"readwrite"` (default) -> Readable and writeable at all times.
	 * - `"readonly"` -> May be set during construction via `super()`, but is read-only post-construction.
	 * - `"computed"` -> Allows for defining getters and setters. Property will *NOT* be available during construction, and cannot be set with `new` or `super()`.
	 * - `"const"` -> Truly read-only. It cannot be set at any point. To change the value, use the `default_value` parameter.
	 * @param default_value The default value to give to the property. Defaults to `0` or `min` if `0` is out of range.
	 * `"computed"` properties cannot accept a default, `"const"` properties require a default.
	 * @param config Extra configuration options. `"computed"` properties cannot accept a config.
	 * @param config.min Minimum allowed value. Defaults to `0`
	 * @param config.max Maximum allowed value. Defaults to `MAX_UINT32`
	 */
	uint32: numeric_prop("uint32"),
	/**
	 * Creates a number property descriptor, known to GObject as a double, for use with `from` and `GClass`.
	 * The largest possible range for this property is that of a double precision float (the same as JS number), but this can be reduced with the `min` and `max` config options.
	 * 
	 * @param flag Controls the mutability of the property on the instance, with the following options:
	 * - `"readwrite"` (default) -> Readable and writeable at all times.
	 * - `"readonly"` -> May be set during construction via `super()`, but is read-only post-construction.
	 * - `"computed"` -> Allows for defining getters and setters. Property will *NOT* be available during construction, and cannot be set with `new` or `super()`.
	 * - `"const"` -> Truly read-only. It cannot be set at any point. To change the value, use the `default_value` parameter.
	 * @param default_value The default value to give to the property. Defaults to `0` or `min` if `0` is out of range.
	 * `"computed"` properties cannot accept a default, `"const"` properties require a default.
	 * @param config Extra configuration options. `"computed"` properties cannot accept a config.
	 * @param config.min Minimum allowed value. Defaults to `-Number.MAX_VALUE`
	 * @param config.max Maximum allowed value. Defaults to `Number.MAX_VALUE`
	 */
	double: numeric_prop("double"),
	/**
	 * Creates a string property descriptor for use with `from` and `GClass`.
	 * 
	 * @param flag Controls the mutability of the property on the instance, with the following options:
	 * - `"readwrite"` (default) -> Readable and writeable at all times.
	 * - `"readonly"` -> May be set during construction via `super()`, but is read-only post-construction.
	 * - `"computed"` -> Allows for defining getters and setters. Property will *NOT* be available during construction, and cannot be set with `new` or `super()`.
	 * - `"const"` -> Truly read-only. It cannot be set at any point. To change the value, use the `default_value` parameter.
	 * @param default_value The default value to give to the property. Defaults to `""` (an empty string).
	 * `"computed"` properties cannot accept a default, `"const"` properties require a default.
	 */
	string<S extends string, F extends ParamFlagStrings | undefined>(
		flag?: F,
		...args: (
			F extends "computed" ? [] :
			F extends "const" ? [default_value: S] :
			[default_value?: S]
		)
	): PropertyDescriptor<string, FlagsFor<F>> & PrimitiveCastable<string, S, FlagsFor<F>> {
		const default_value = args[0] ?? ""
		const flags = flag as ParamFlagStrings
		return {
			flags: flag as any,
			property_symbol: PROPERTY_SYMBOL,
			create: (name) => GObject.ParamSpec.string(name, null, null, FLAG_PRESETS[flags], default_value),
			as(): any { return this },
		}
	},
	/**
	 * Creates a boolean property descriptor for use with `from` and `GClass`.
	 * 
	 * @param flag Controls the mutability of the property on the instance, with the following options:
	 * - `"readwrite"` (default) -> Readable and writeable at all times.
	 * - `"readonly"` -> May be set during construction via `super()`, but is read-only post-construction.
	 * - `"computed"` -> Allows for defining getters and setters. Property will *NOT* be available during construction, and cannot be set with `new` or `super()`.
	 * - `"const"` -> Truly read-only. It cannot be set at any point. To change the value, use the `default_value` parameter.
	 * @param default_value The default value to give to the property. Defaults to `false`.
	 * `"computed"` properties cannot accept a default, `"const"` properties require a default.
	 */
	bool<B extends boolean | undefined, F extends ParamFlagStrings | undefined>(
		flag: F,
		...args: (
			F extends "computed" ? [] :
			F extends "const" ? [default_value?: B] :
			[default_value?: B]
		)
	): PropertyDescriptor<boolean, FlagsFor<F>> & PrimitiveCastable<boolean, B, FlagsFor<F>> {
		const default_value = args[0] ?? false
		const flags = flag as ParamFlagStrings
		return {
			flags: flag as any,
			property_symbol: PROPERTY_SYMBOL,
			create: (name) => GObject.ParamSpec.boolean(name, null, null, FLAG_PRESETS[flags], default_value),
			as(): any { return this },
		}
	},
	/**
	 * Creates a GObject.Object property descriptor for use with `from` and `GClass`.
	 * 
	 * All GObject.Object properties are also nullable, because GObject cannot ensure that a null value isn't set.
	 * The default value for GObject.Object properties is always null, and cannot be changed.
	 * 
	 * @param kind The GObject class that this property will be typed to
	 * @param flag Controls the mutability of the property on the instance, with the following options:
	 * - `"readwrite"` (default) -> Readable and writeable at all times.
	 * - `"readonly"` -> May be set during construction via `super()`, but is read-only post-construction.
	 * - `"computed"` -> Allows for defining getters and setters. Property will *NOT* be available during construction, and cannot be set with `new` or `super()`.
	 * 
	 * The `"const"` flag is not allowed, because a const GObject.Object property would always be `null`.
	 */
	gobject<G extends GClass, F extends Exclude<ParamFlagStrings, "const"> | undefined>(
		kind: G,
		flag?: F,
	): PropertyDescriptor<InstanceType<G> | null, FlagsFor<F>> & {
		/**
		 * Type helper to allow narrowing of a property descriptor's type.
		 * A default value is required to exist, and the default value must extend the narrowed value.
		 * 
		 * @template Narrow The narrowed type
		 * 
		 * @example
		 * ```ts
		 * Property.gobject(Gtk.Widget).as<Gtk.ListBox | Gtk.Box>() // This property now only allows instances of Box or ListBox, instead of all widgets
		 * ```
		 */
		as<Narrow>(): InstanceType<G> extends Narrow ? PropertyDescriptor<Narrow, FlagsFor<F>> : [never] & void
	} {
		const flags = flag as ParamFlagStrings
		return {
			flags: flag as any,
			property_symbol: PROPERTY_SYMBOL,
			create: (name) => GObject.ParamSpec.object(name, null, null, FLAG_PRESETS[flags], kind.$gtype),
			as(): any { return this },
		}
	},
	/**
	 * Creates a GObject Enum property descriptor for use with `from` and `GClass`.
	 * 
	 * @param kind The GObject Enum class that this property will be typed to
	 * @param default_value The default value given to the property. It is required, because Enums do not have a reliable 0-value
	 * @param flag Controls the mutability of the property on the instance, with the following options:
	 * - `"readwrite"` (default) -> Readable and writeable at all times.
	 * - `"readonly"` -> May be set during construction via `super()`, but is read-only post-construction.
	 * - `"const"` -> Truly read-only. It cannot be set at any point. To change the value, use the `default_value` parameter.
	 * 
	 * The `"computed"` flag is not allowed
	 */
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
	/**
	 * Creates a JavaScript Object property descriptor for use with `from` and `GClass`.
	 * 
	 * All JS object properties are also nullable, because GObject cannot ensure that a null value isn't set.
	 * The default value for JS object properties is always null, and cannot be changed.
	 * 
	 * @param flag Controls the mutability of the property on the instance, with the following options:
	 * - `"readwrite"` (default) -> Readable and writeable at all times.
	 * - `"readonly"` -> May be set during construction via `super()`, but is read-only post-construction.
	 * - `"computed"` -> Allows for defining getters and setters. Property will *NOT* be available during construction, and cannot be set with `new` or `super()`.
	 * 
	 * The `"const"` flag is not allowed, because a const JS object property would always be `null`.
	 */
	jsobject<F extends Exclude<ParamFlagStrings, "const"> | undefined>(
		flag?: F,
	): PropertyDescriptor<object | null, FlagsFor<F>> & {
		/**
		 * Type helper to allow narrowing of a property descriptor's type.
		 * A default value is required to exist, and the default value must extend the narrowed value.
		 * 
		 * @template Narrow The narrowed type
		 * 
		 * @example
		 * ```ts
		 * Property.jsobject().as<TypeOne | TypeTwo>() // This property now only allows instances of TypeOne or TypeTwo, instead of all objects
		 * ```
		 */
		as<Narrow extends object>(): PropertyDescriptor<Narrow | null, FlagsFor<F>>
	} {
		const flags = flag as ParamFlagStrings
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
