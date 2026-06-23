import GObject from "gi://GObject?version=2.0"
import GLib from "gi://GLib?version=2.0"

import { ConstMap } from "./const_map.js"

type GClass<T extends GObject.Object = GObject.Object> = { $gtype: GObject.GType } & (
	abstract new (...args: any[]) => T
)
type GEnum<T extends number = number> = { $gtype: GObject.GType<T> }

const PROPERTY_SYMBOL = Symbol("Symbol for GObjectify Property descriptors")
const FLAG_PRESETS = {
	readwrite: GObject.ParamFlags.CONSTRUCT | GObject.ParamFlags.READWRITE,
	const: GObject.ParamFlags.READABLE,

	// Will be treated by GObjectify as readonly post-init
	readonly: GObject.ParamFlags.CONSTRUCT | GObject.ParamFlags.READWRITE,

	// CONSTRUCT removed so that `override get` and `override set` will work
	computed: GObject.ParamFlags.READWRITE,
} as const

type FlagStrings = keyof typeof FLAG_PRESETS

const num_sizes_and_spec = new ConstMap(
	["int32", { min: GLib.MININT32, max: GLib.MAXINT32, spec: GObject.ParamSpec.int }],
	["uint32", { min: 0, max: GLib.MAXUINT32, spec: GObject.ParamSpec.uint }],
	["double", { min: -Number.MAX_VALUE, max: Number.MAX_VALUE, spec: GObject.ParamSpec.double }],
)

type PropDescriptor<T, F extends FlagStrings> = {
	readonly value?: T | undefined,
	readonly flag: F,
	readonly property_symbol: typeof PROPERTY_SYMBOL,
	readonly min?: number,
	readonly max?: number,
	create(name: string): GObject.ParamSpec,
	validate_value(value: any, spec: GObject.ParamSpec): T,
}
type PrimitiveCastable<Wide, Default, F extends FlagStrings> = {
	/**
	 * Type helper to allow narrowing of a property descriptor's type.
	 * A default value is required to exist, and the default value must extend the narrowed value.
	 *
	 * @template Narrow The narrowed type
	 *
	 * @example
	 * ```ts
	 * // This property now only allows "user" or "admin", instead of all strings
	 * Property.rw.string("user").as<"user" | "admin">()
	 * ```
	 */
	as<Narrow extends Wide>(): (
		Default extends Narrow ? PropDescriptor<Narrow, F>
			: [never] & void
	),
}
type NarrowablePrimitiveDescriptor<T, Default, F extends FlagStrings> = (
	PropDescriptor<T, F>
	& PrimitiveCastable<T, Default, F>
)

type ExtractWriteableProps<D> = {
	[Key in keyof D as D[Key] extends PropDescriptor<any, "readwrite" | "computed">
		? Key
		: never
	]: D[Key] extends PropDescriptor<infer T, any> ? T : never
}
type ExtractReadonlyProps<D> = {
	readonly [Key in keyof D as D[Key] extends PropDescriptor<any, "readonly" | "const">
		? Key
		: never
	]: D[Key] extends PropDescriptor<infer T, any> ? T : never
}
type ExtractConstructProps<D> = {
	[Key in keyof D as D[Key] extends PropDescriptor<any, "readonly" | "readwrite">
		? Key
		: never
	]: D[Key] extends PropDescriptor<infer T, any> ? T : never
}

type Primitives = {
	int32: number,
	uint32: number,
	double: number,
	string: string,
	bool: boolean,
}
type PrimitiveTypes = { [K in keyof Primitives]: Primitives[K] }[keyof Primitives]

type PrimitiveNeedsDefault<T extends PrimitiveTypes, F extends FlagStrings> = (
	T extends GEnum ? true
		: F extends "const" ? true
			: false
)

type PrimitiveFactory<T extends PrimitiveTypes, F extends FlagStrings> = <const Default extends T>(...args:
F extends "computed" ? []
	: PrimitiveNeedsDefault<T, F> extends true
		? [default_value: Default, ...(T extends number ? [config?: { min: number, max: number }] : [])]
		: [default_value?: Default, ...(T extends number ? [config?: { min: number, max: number }] : [])]
) => NarrowablePrimitiveDescriptor<T, Default, F>

function make_numeric_factory<F extends FlagStrings>(
	kind: "int32" | "uint32" | "double",
	flag: F,
): PrimitiveFactory<number, F> {
	const { min: default_min, max: default_max, spec } = num_sizes_and_spec.get(kind)
	return (...args) => {
		const { min, max } = args[1] ?? { min: default_min, max: default_max }
		const default_value = args[0] ?? (0 >= min && 0 <= max ? 0 : min)
		if (default_value < min || default_value > max) throw new RangeError(
			// eslint-disable-next-line
			`Default value '${default_value}' is out of range for property of type '${kind}' with min '${min}' and max '${max}'`,
		)
		return {
			flag,
			property_symbol: PROPERTY_SYMBOL,
			min,
			max,
			create: (name) => spec(name, null, null, FLAG_PRESETS[flag], min, max, default_value),
			as(): any { return this },
			validate_value: (value, _spec): any => {
				value ??= default_value
				if (value < min) {
					value = min
				} else if (value > max) {
					value = max
				}
				if (kind !== "double") {
					value = Math.trunc(value)
				}
				return value
			},
		}
	}
}

/* eslint-disable */
type PrimitiveFactoriesEnsurer<
	F extends FlagStrings,
	C extends { [K in keyof Primitives]: PrimitiveFactory<Primitives[K], F> },
> = C
type PrimitiveFactories<F extends FlagStrings> = PrimitiveFactoriesEnsurer<F, {
	/**
	 * Creates a number property descriptor, known to GObject as an int32, for use with `from` and `GClass`.
	 * The largest possible range for this property is that of a signed 32-bit integer, but this can be reduced with the `min` and `max` config options.
	 *
	 * @param default_value The default value to give to the property. Defaults to `0` or `min` if `0` is out of range.
	 * `"computed"` properties cannot accept a default, `const` properties require a default.
	 * @param config Extra configuration options. `computed` properties cannot accept a config.
	 * @param config.min Minimum allowed value. Defaults to `MIN_INT32`
	 * @param config.max Maximum allowed value. Defaults to `MAX_INT32`
	 */
	int32: PrimitiveFactory<number, F>,
	/**
	 * Creates a number property descriptor, known to GObject as a uint32, for use with `from` and `GClass`.
	 * The largest possible range for this property is that of an unsigned 32-bit integer, but this can be reduced with the `min` and `max` config options.
	 *
	 * @param default_value The default value to give to the property. Defaults to `0` or `min` if `0` is out of range.
	 * `"computed"` properties cannot accept a default, `const` properties require a default.
	 * @param config Extra configuration options. `computed` properties cannot accept a config.
	 * @param config.min Minimum allowed value. Defaults to `0`
	 * @param config.max Maximum allowed value. Defaults to `MAX_UINT32`
	 */
	uint32: PrimitiveFactory<number, F>,
	/**
	 * Creates a number property descriptor, known to GObject as a double, for use with `from` and `GClass`.
	 * The largest possible range for this property is that of a double precision float (the same as JS number), but this can be reduced with the `min` and `max` config options.
	 *
	 * @param default_value The default value to give to the property. Defaults to `0` or `min` if `0` is out of range.
	 * `"computed"` properties cannot accept a default, `const` properties require a default.
	 * @param config Extra configuration options. `computed` properties cannot accept a config.
	 * @param config.min Minimum allowed value. Defaults to `-Number.MAX_VALUE`
	 * @param config.max Maximum allowed value. Defaults to `Number.MAX_VALUE`
	 */
	double: PrimitiveFactory<number, F>,
	/**
	 * Creates a string property descriptor for use with `from` and `GClass`.
	 *
	 * @param default_value The default value to give to the property. Defaults to `""` (an empty string).
	 * `computed` properties cannot accept a default, `const` properties require a default.
	 */
	string: PrimitiveFactory<string, F>,
	/**
	 * Creates a boolean property descriptor for use with `from` and `GClass`.
	 *
	 * @param default_value The default value to give to the property. Defaults to `false`.
	 * `computed` properties cannot accept a default, `const` properties require a default.
	 */
	bool: PrimitiveFactory<boolean, F>,
}> & {
	/**
	 * Creates a GObject Enum property descriptor for use with `from` and `GClass`.
	 *
	 * @param kind The GObject Enum class that this property will be typed to
	 * @param default_value The default value given to the property. It is required, because Enums do not have a reliable 0-value
	 *
	 * GEnum properties cannot be `computed`
	 */
	genum<T extends number, E extends GEnum<T>>(
		genum: E,
		default_member: keyof E,
	): E extends GEnum<infer I> ? PropDescriptor<I, F> : never,
}
const make_primitive_factories = <F extends FlagStrings>(flag: F): PrimitiveFactories<F> => ({
	uint32: make_numeric_factory("uint32", flag),
	int32: make_numeric_factory("int32", flag),
	double: make_numeric_factory("double", flag),
	string: (val?) => {
		const default_value = val ?? ""
		return {
			flag,
			property_symbol: PROPERTY_SYMBOL,
			create: (name) => GObject.ParamSpec.string(name, null, null, FLAG_PRESETS[flag], default_value),
			as(): any { return this },
			validate_value: (value, _spec) => value ?? default_value,
		}
	},
	bool: (val?) => {
		const default_value = val ?? false
		return {
			flag,
			property_symbol: PROPERTY_SYMBOL,
			create: (name) => GObject.ParamSpec.boolean(name, null, null, FLAG_PRESETS[flag], default_value),
			as(): any { return this },
			validate_value: (value, _spec) => value ?? default_value,
		}
	},
	genum: (genum, default_member) => {
		const default_value = genum[default_member]
		return {
			flag,
			property_symbol: PROPERTY_SYMBOL,
			create: (name) => GObject.ParamSpec.enum(name, null, null, FLAG_PRESETS[flag], genum.$gtype, default_value),
			validate_value: (value, _spec) => value ?? default_value,
		} satisfies PropDescriptor<unknown, F> as any
	},
})

type ObjectFactories<F extends FlagStrings> = {
	/**
	 * Creates a GObject.Object property descriptor for use with `from` and `GClass`.
	 *
	 * All GObject.Object properties are also nullable, because GObject cannot ensure that a null value isn't set.
	 * The default value for GObject.Object properties is always null, and cannot be changed.
	 *
	 * @param kind The GObject class that this property will be typed to
	 */
	gobject<G extends GClass>(kind: G): PropDescriptor<InstanceType<G> | null, F> & {
		/**
		 * Type helper to allow narrowing of a property descriptor's type.
		 * A default value is required to exist, and the default value must extend the narrowed value.
		 *
		 * @template Narrow The narrowed type
		 *
		 * @example
		 * ```ts
		 * Property.rw.gobject(Gtk.Widget).as<Gtk.ListBox | Gtk.Box>() // This property now only allows instances of Box or ListBox, instead of all widgets
		 * ```
		 */
		as<Narrow extends InstanceType<G>>(): PropDescriptor<Narrow | null, F>,
	},
	/**
	 * Creates a JavaScript Object property descriptor for use with `from` and `GClass`.
	 *
	 * All JS object properties are also nullable, because GObject cannot ensure that a null value isn't set.
	 * The default value for JS object properties is always null, and cannot be changed.
	 */
	jsobject(): PropDescriptor<object | null, F> & {
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
		as<Narrow extends object>(): PropDescriptor<Narrow | null, F>,
	},
}
const make_object_factories = <F extends FlagStrings>(flag: F): ObjectFactories<F> => ({
	gobject: (kind) => ({
		flag,
		property_symbol: PROPERTY_SYMBOL,
		create: (name) => GObject.ParamSpec.object(name, null, null, FLAG_PRESETS[flag], kind.$gtype),
		as(): any { return this },
		validate_value: (value, _spec) => value ?? null,
	}),
	jsobject: () => ({
		flag,
		property_symbol: PROPERTY_SYMBOL,
		create: (name) => GObject.ParamSpec.jsobject(name, null, null, FLAG_PRESETS[flag]),
		as(): any { return this },
		validate_value: (value, _spec) => value ?? null,
	}),
})

/* eslint-enable */

type PropFactories<F extends FlagStrings> = (F extends "const"
	? PrimitiveFactories<F>
	: F extends "computed"
		// GEnum props cannot be computed due to unintuitive default value behavior
		? Omit<PrimitiveFactories<F>, "genum"> & ObjectFactories<F>
		: PrimitiveFactories<F> & ObjectFactories<F>
)
const make_factories = <F extends FlagStrings>(flag: F): PropFactories<F> => (flag === "const"
	? make_primitive_factories(flag)
	: { ...make_primitive_factories(flag), ...make_object_factories(flag) }
) as any

/**
 * Create properties for use with `from` and `GClass`.
 *
 * Properties are the main way to have reactive state stored in a GObject subclass.
 *
 * The following modifiers determine if and when properties can be written to, and how they may be written.
 */
const Property = {
	/**
	 * Properties of this modifier are writeable at all times.
	 */
	readwrite: make_factories("readwrite"),
	/**
	 * Properties of this modifier are writeable during construction (via `super()` and `new`)
	 * but cannot be written at any point post-construction
	 */
	readonly: make_factories("readonly"),
	/**
	 * Properties of this modifier are writeable at all times post-construction,
	 * but are not allowed to be written to during construction (via `super()` or `new`).
	 *
	 * Computed properties require a `get` and `set` method to be present on the subclass,
	 * and use those to read and write values. Early-reads that may happen before construction finishes
	 * will see the fallback value of the property type (0, "", false, null).
	 *
	 * Computed properties do not support specifying default values, and GEnums cannot be computed.
	 */
	computed: make_factories("computed"),
	/**
	 * Properties of this modifier may not be written to at all, and require default values to be set.
	 * GObject and JSObject properties do not support being const, as they would always be null, forever.
	 */
	const: make_factories("const"),
} satisfies { [F in FlagStrings]: PropFactories<F> }

const is_property_descriptor = (item: any): item is PropDescriptor<any, FlagStrings> => (
	item?.property_symbol === PROPERTY_SYMBOL
)

export { Property, is_property_descriptor }
export type { PropDescriptor, ExtractWriteableProps, ExtractReadonlyProps, ExtractConstructProps, FlagStrings }
