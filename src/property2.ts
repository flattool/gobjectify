import GObject from "gi://GObject?version=2.0"
import { Int32, Narrow, type BaseTypes, type InstanceFor, type TypeDescriptor } from "./types"
import Gtk from "gi://Gtk?version=4.0"

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
type DefaultableConfig<T> = BaseConfig & {
	default?: T,
}
type EnumConfig<T extends GEnum> = BaseConfig & {
	default: T,
}
type NumberConfig<T extends number> = DefaultableConfig<T> & {
	min?: number,
	max?: number,
}

type ConfigFor<T> = (
	T extends TypeDescriptor<infer N> ? ConfigFor<N> :
	T extends string | boolean ? DefaultableConfig<T> :
	T extends number ? NumberConfig<T> :
	T extends StringConstructor | BooleanConstructor ? ConfigFor<InstanceFor<T>> :
	T extends NumberConstructor ? NumberConfig<number> :
	T extends ObjectConstructor | GObject.Object ? BaseConfig :
	T extends GEnum ? EnumConfig<T> :
	T extends GClass | object ? BaseConfig :
	never
)

function Property<T extends BaseTypes | TypeDescriptor<any>, C extends ConfigFor<T>>(
	kind: T,
	...args: C extends EnumConfig<any> ? [C] : [C?]
): void {}

const ttt = Narrow(Int32)<10 | 20>()

Property(Narrow(String)<"yes" | "no">(), {})
