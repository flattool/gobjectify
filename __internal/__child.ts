import GObject from "gi://GObject?version=2.0"

const CHILD_SYMBOL = Symbol("Symbol for GObjectify Child descriptors")

type GClassFor<T extends GObject.Object> = abstract new (...args: any[])=> T

type ChildDescriptor<T extends GObject.Object> = {
	type: GClassFor<T>,
	child_symbol: typeof CHILD_SYMBOL,
}

type ExtractChildren<D> = {
	readonly [Key in keyof D as D[Key] extends ChildDescriptor<any>
		? Key
		: never
	]: D[Key] extends ChildDescriptor<infer T> ? T : never
}

/**
 * Creates a **ChildDescriptor** for use with `from()` and `GClass`, describing an internal Gtk Template Child.
 *
 * `from()` and `GClass` will see this descriptor and register the subclass as having this child type.
 *
 * @param child_type The GObject class of the child.
 *
 * @example
 * ```ts
 * @GClass({ template: "resource:///path/to/some/UI.ui" })
 * class MyBox extends from(Gtk.Box, {
 *     _some_child(Gtk.Button),
 * }) {}
 * ```
 */
function Child<T extends GObject.Object>(child_type: GClassFor<T>): ChildDescriptor<T> {
	return { type: child_type, child_symbol: CHILD_SYMBOL }
}

function is_child_descriptor(item: any): item is ChildDescriptor<GObject.Object> {
	return item?.child_symbol == CHILD_SYMBOL
}

export { type ChildDescriptor, type ExtractChildren, Child, is_child_descriptor }
