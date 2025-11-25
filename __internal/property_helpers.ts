import GObject from "gi://GObject?version=2.0"
import GLib from "gi://GLib?version=2.0"

import { ConstMap } from "./__const_map.js"

type GClass = (abstract new (...args: any[])=> GObject.Object) & { $gtype: GObject.GType }
type GEnum<T = number> = { $gtype: GObject.GType<T> }

const FLAG_PRESETS = {
	CONSTANT: GObject.ParamFlags.READABLE,
	READWRITE: GObject.ParamFlags.READWRITE,
	CONSTRUCT: GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT,
	CONSTRUCT_ONLY: GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
} as const

export const NUMERIC_GTYPE_DEFAULTS = new ConstMap(
	// Ordered most to least common in GJS code
	[GObject.TYPE_DOUBLE, { max: Number.MAX_VALUE, min: Number.MIN_VALUE }],
	[GObject.TYPE_INT, { max: GLib.MAXINT32, min: GLib.MININT32 }],
	[GObject.TYPE_UINT, { max: GLib.MAXUINT32, min: 0 }],
	// Values larger than JS's number types have to be capped, sadly
	[GObject.TYPE_INT64, { max: Number.MAX_SAFE_INTEGER, min: Number.MIN_SAFE_INTEGER }],
	[GObject.TYPE_UINT64, { max: Number.MAX_SAFE_INTEGER, min: 0 }],
	[GObject.TYPE_FLOAT, { max: 3.4028235e38, min: -3.4028235e38 }],
)

export function clamp_to(input: number, { min, max }: { max: number, min: number }): number {
	if (input > max) return max
	if (input < min) return min
	return input
}

export type ParamFlagStrings = keyof typeof FLAG_PRESETS

type BaseSpecParams = {
	nick?: string,
	blurb?: string,
	flags?: ParamFlagStrings,
}

type DefaultableBaseSpecParams<T> = BaseSpecParams & {
	default?: T,
}

type NumberSpecParams = DefaultableBaseSpecParams<number> & {
	min?: number,
	max?: number,
}

type StringSpecParams = DefaultableBaseSpecParams<string>

type BoolSpecParams = DefaultableBaseSpecParams<boolean>

type PropertyTypeMap = {
	string: StringSpecParams,
	bool: BoolSpecParams,
	uint32: NumberSpecParams,
	int32: NumberSpecParams,
	double: NumberSpecParams,
}

export type AllPropertyTypes = GClass | GEnum | keyof PropertyTypeMap

export type PropertyConfigFor<T extends AllPropertyTypes> = (T extends GClass
	? BaseSpecParams
	: (T extends GEnum<infer U>
		? DefaultableBaseSpecParams<U>
		: (T extends keyof PropertyTypeMap
			? PropertyTypeMap[T]
			: never
		)
	)
)

function title_case(str: string): string {
	str = str.replace(/[_-]/g, " ")
	return str.replace(
		/\w\S*/g,
		(word) => word.charAt(0).toUpperCase() + word.substr(1).toLowerCase(),
	)
}

function get_defaults(name: string, params?: BaseSpecParams): Required<BaseSpecParams> {
	const nick = title_case(params?.nick ?? name)
	return {
		nick,
		blurb: params?.blurb ?? `${nick} property`,
		flags: params?.flags ?? "READWRITE",
	}
}

function string_to_flag(flag_string: ParamFlagStrings): GObject.ParamFlags {
	return FLAG_PRESETS[flag_string]
}

function is_GObject(value: any): value is GClass {
	return (
		typeof value === "function"
		&& typeof value.$gtype?.name === "string"
		&& typeof value.prototype === "object"
	)
}

function is_GEnum(value: any): value is GEnum {
	return (
		typeof value === "object" && typeof value.$gtype?.name === "string" && !("prototype" in value)
	)
}

export class PropertyHelpers {
	public static string(name: string, options?: StringSpecParams): GObject.ParamSpec<string> {
		const { nick, blurb, flags } = get_defaults(name, options)
		return GObject.ParamSpec.string(
			name,
			nick,
			blurb,
			string_to_flag(flags),
			options?.default ?? "",
		)
	}

	public static bool(name: string, options?: BoolSpecParams): GObject.ParamSpec<boolean> {
		const { nick, blurb, flags } = get_defaults(name, options)
		return GObject.ParamSpec.boolean(
			name,
			nick,
			blurb,
			string_to_flag(flags),
			options?.default ?? false,
		)
	}

	public static uint32(name: string, options?: NumberSpecParams): GObject.ParamSpec<number> {
		const { nick, blurb, flags } = get_defaults(name, options)

		const default_nums = NUMERIC_GTYPE_DEFAULTS.get(GObject.TYPE_UINT)
		const min = Math.trunc(options?.min ?? default_nums.min)
		const max = Math.trunc(options?.max ?? default_nums.max)
		const default_val = clamp_to(Math.trunc(options?.default ?? 0), { min, max })

		return GObject.ParamSpec.uint(
			name,
			nick,
			blurb,
			string_to_flag(flags),
			min,
			max,
			default_val,
		)
	}

	public static int32(name: string, options?: NumberSpecParams): GObject.ParamSpec<number> {
		const { nick, blurb, flags } = get_defaults(name, options)

		const default_nums = NUMERIC_GTYPE_DEFAULTS.get(GObject.TYPE_UINT)
		const min = Math.trunc(options?.min ?? default_nums.min)
		const max = Math.trunc(options?.max ?? default_nums.max)
		const default_val = clamp_to(Math.trunc(options?.default ?? 0), { min, max })

		return GObject.ParamSpec.int(
			name,
			nick,
			blurb,
			string_to_flag(flags),
			min,
			max,
			default_val,
		)
	}

	public static double(name: string, options?: NumberSpecParams): GObject.ParamSpec<number> {
		const { nick, blurb, flags } = get_defaults(name, options)

		const default_nums = NUMERIC_GTYPE_DEFAULTS.get(GObject.TYPE_UINT)
		const min = options?.min ?? default_nums.min
		const max = options?.max ?? default_nums.max
		const default_val = clamp_to(options?.default ?? 0, { min, max })

		return GObject.ParamSpec.double(
			name,
			nick,
			blurb,
			string_to_flag(flags),
			min,
			max,
			default_val,
		)
	}

	public static g_object<T extends GClass>(
		name: string,
		type: T,
		options?: BaseSpecParams,
	): GObject.ParamSpec<T> {
		const { nick, blurb, flags } = get_defaults(name, options)
		return GObject.ParamSpec.object(
			name,
			nick,
			blurb,
			string_to_flag(flags),
			type.$gtype,
		) as any
	}

	public static g_enum<T extends GEnum<any>>(
		name: string,
		type: T,
		options?: DefaultableBaseSpecParams<T>,
	): GObject.ParamSpec<T> {
		const { nick, blurb, flags } = get_defaults(name, options)
		return GObject.ParamSpec.enum(name, nick, blurb, string_to_flag(flags), type, options?.default)
	}

	public static make_props_object(props: GObject.ParamSpec[]): Record<string, GObject.ParamSpec> {
		const to_return: Record<string, GObject.ParamSpec> = {}
		props.forEach((prop) => (to_return[prop.name] = prop))
		return to_return
	}

	public static resolve<T extends AllPropertyTypes>(
		name: string,
		type: T,
		config?: PropertyConfigFor<T>,
	): GObject.ParamSpec<any> {
		if (is_GObject(type)) {
			return this.g_object(name, type, config)
		} else if (is_GEnum(type)) {
			return this.g_enum(name, type, config as DefaultableBaseSpecParams<GEnum<any>>)
		}
		switch (type) {
			case "string": return this.string(name, config as StringSpecParams)
			case "bool": return this.bool(name, config as BoolSpecParams)
			case "uint32": return this.uint32(name, config as NumberSpecParams)
			case "int32": return this.int32(name, config as NumberSpecParams)
			case "double": return this.double(name, config as NumberSpecParams)
		}
		throw new Error("PropertyHelpers.resolve: Unsupported property type. Called with: " + type)
	}

	private constructor() {}
}
