import GObject from "gi://GObject?version=2.0"
import GLib from "gi://GLib?version=2.0"

import { PropertyHelpers, type AllPropertyTypes, type PropertyConfigFor } from "./property_helpers.js"

const PROPERTY_SYMBOL = Symbol("Symbol for GObjectify Property descriptors")

const FLAG_PRESETS = {
	CONSTANT: GObject.ParamFlags.READABLE,
	READWRITE: GObject.ParamFlags.READWRITE,
	CONSTRUCT: GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT,
	CONSTRUCT_ONLY: GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
} as const

type ParamFlagStrings = keyof typeof FLAG_PRESETS
type GClass<T = GObject.Object> = (new (...args: any[])=> T) & { $gtype?: GObject.GType }
type GEnum<T = number> = { $gtype?: GObject.GType<T> }
type PrimitiveMap = { bool: boolean, int32: number, double: number, uint32: number, string: string }

type PropertyDescriptor<T, F extends ParamFlagStrings = "READWRITE"> = {
	create(name: string): GObject.ParamSpec<T>,
	readonly __flags?: F,
	readonly property_symbol: typeof PROPERTY_SYMBOL,
	readonly min?: number,
	readonly max?: number,
}

type PropertyKindToTS<T extends AllPropertyTypes> = (T extends GClass<infer Inst>
	? Inst | null
	: (T extends GEnum<infer U>
		? U
		: (T extends keyof PrimitiveMap
			? PrimitiveMap[T & keyof PrimitiveMap]
			: never
		)
	)
)

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

/**
 * Creates a **Property Descriptor** for use with `from()` and `GClass`,
 * describing a GObject property in a fully type-safe way.
 *
 * This does **not** register a property on its own. Instead, it packages metadata
 * that `GClass` later uses to install `GObject.ParamSpec`s on the class being defined.
 *
 * - When used with `GClass`, numeric properties will automatically do bounds checking, and clamp incoming values
 * to their allowed ranges. Also when used with `GClass`, `int32` and `uint32` properties will truncate incoming values
 * to integers.
 * - Properties typed as GObjects are always nullable, because ParamSpecs do not support non-nullable GObject types.
 *
 * @param type
 * The underlying data type of the property.
 *
 * Supported:
 * - `"string"`, `"bool"`, `"double"`, `"int32"`, `"uint32"`
 * - Any GObject class (property becomes a nullable object reference)
 * - Any GObject enum (property becomes that enum type)
 *
 * Notes:
 * - `Number` is not directly supported, you must specify `"double"`, `"int32"`, or `"uint32"` for GObject's sake.
 *
 * @param config Additional configuration for the property.
 * @param config.default
 * Default value used when the instance is constructed (GObject types do not support this config field).
 *
 * Defaults:
 * - string: `""`
 * - double, int32, uint32: `0`
 * - bool: `false`
 * - GObject enum: first enum value
 * - GObject type: `null` (cannot be changed)
 *
 * @param config.nick
 * Human-readable nickname for the property. Defaults to the property's name
 * (determined later by `from()`).
 *
 * @param config.blurb Longer description of the property. Defaults to the property's name.
 * @param config.flags="readwrite" The GObject property flags for this property (explained later).
 * @param config.min Defines the minimum allowed value for numeric types (`"double"`, `"int32"`, `"uint32"`)
 * @param config.max Defines the maximum allowed value for numeric types (`"double"`, `"int32"`, `"uint32"`)
 *
 * Defaults for min:
 * - double: `Number.MIN_VALUE`
 * - int32: `GLib.MININT32`
 * - uint32: `0`
 *
 * Defaults for max:
 * - double: `Number.MAX_VALUE`
 * - int32: `GLib.MAXINT32`
 * - uint32: `GLib.MAXUINT32`
 *
 * ---
 *
 * # Flags - IMPORTANT
 *
 * These string-based flags map to `GObject.ParamFlags`, with a curated, simplified API. They control GObject and
 * GObjectify treat the property.
 *
 * - **"CONSTANT"** (Equivalent to flags: `READABLE`)
 *   Must be set at construction time, and can **never change** afterward.
 *
 * - **"CONSTRUCT"** (Equivalent to flags: `READWRITE | CONSTRUCT`)
 *   Must be provided during construction (or via UI file), but may change later.
 *
 * - **"CONSTRUCT_ONLY"** (Equivalent to flags: `READWRITE | CONSTRUCT_ONLY`)
 *   Must be provided during construction (or via UI file), and **cannot be changed** afterward.
 *
 * - **"READWRITE"** [default] (Equivalent to flags: READWRITE)
 *   Can be set at construct time, but not required, and may change later.
 *
 * @example
 * ```ts
 * @GClass()
 * class MyBox extends from(Gtk.Box, {
 *     title: Property("string", { flags: "CONSTRUCT_ONLY" }),
 *     rating: Property("double", { max: 5 }),
 * }) {}
 * const mb = new MyBox({ title: "Some Title" })
 * mb.rating = 2
 * mb.rating = 10 // rating will be `5`
 * mb.rating = 2.7 // rating will be `2`
 * ```
 */
function Property<
	T extends AllPropertyTypes,
	C extends PropertyConfigFor<T>,
>(
	type: T,
	config?: C,
): PropertyDescriptor<PropertyKindToTS<T>, C extends { flags: infer F extends ParamFlagStrings } ? F : "READWRITE"> {
	const get_min_max = (): { min: number, max: number } | {} => {
		if (type === "int32") return { min: (config as any)?.min ?? 0, max: (config as any)?.max ?? GLib.MAXINT32 }
		if (type === "uint32") return { min: (config as any)?.min ?? 0, max: (config as any)?.max ?? GLib.MAXUINT32 }
		if (type === "double") return { min: (config as any)?.min ?? 0, max: (config as any)?.max ?? Number.MAX_VALUE }
		return {}
	}
	return {
		create(name: string): GObject.ParamSpec<PropertyKindToTS<T>> {
			return PropertyHelpers.resolve(name, type, config)
		},
		property_symbol: PROPERTY_SYMBOL,
		...get_min_max(),
		...(config?.flags && { __flags: config.flags as any }),
	}
}

function is_property_descriptor(item: any): item is PropertyDescriptor<any, ParamFlagStrings> {
	return item?.property_symbol === PROPERTY_SYMBOL
}

export { Property, is_property_descriptor }
export type { PropertyDescriptor, ExtractWriteableProps, ExtractReadonlyProps, ExtractConstructProps }
