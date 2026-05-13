import GObject from "gi://GObject?version=2.0"

type BaseTypes = (
	| GObject.GType // raw GType
	| { $gtype: GObject.GType } // GObject subclasses, some JS builtin classes, and GEnums
	| (abstract new (...args: any[]) => any) // JS classes
)

class TypeDescriptor<Wide> {
	constructor(public wide: Wide, public gtype: GObject.GType) {}
}

type InstanceFor<T extends BaseTypes | TypeDescriptor<any>> = (
	T extends TypeDescriptor<infer N> ? N extends BaseTypes
		? InstanceFor<N>
		: N
	:
	T extends GObject.GType<infer O> ? O :
	T extends { $gtype: GObject.GType<infer O> } ? O :
	T extends abstract new (...args: any[]) => infer O ? O :
	never
)

type InstancesForArray<T extends readonly (BaseTypes | TypeDescriptor<any>)[]> = {
	[Key in keyof T]: InstanceFor<T[Key]>
}

const gtype_for = <T extends BaseTypes | TypeDescriptor<any>>(base: T): GObject.GType => (
	base instanceof TypeDescriptor ? base.gtype :
	"$gtype" in base ? base.$gtype : // GObject subclasses, some JS builtin classes, and GEnums
	typeof base === "function" ? GObject.TYPE_JSOBJECT : // JS classes
	base // raw GType
)

function Narrow<T extends BaseTypes | TypeDescriptor<any>>(base: T): <N extends InstanceFor<T>>() => TypeDescriptor<N> {
	return (base instanceof TypeDescriptor
		? () => new TypeDescriptor(base.wide, base.gtype)
		: () => new TypeDescriptor(base, gtype_for(base)) as any
	)
}

const Int32 = new TypeDescriptor(Number, GObject.TYPE_INT)
const UInt32 = new TypeDescriptor(Number, GObject.TYPE_UINT)

export { Int32, UInt32, Narrow, gtype_for }
export type { BaseTypes, TypeDescriptor, InstanceFor, InstancesForArray }
