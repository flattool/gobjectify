import GObject from "gi://GObject?version=2.0"

const CHILD_SYMBOL = Symbol("Symbol for GObjectify Child descriptors")

type ChildDescriptor<_TypeHolder extends GObject.Object> = {
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
 * @template ChildType The GObject type of the child.
 *
 * @example
 * ```ts
 * @GClass({ template: "resource:///path/to/some/UI.ui" })
 * class MyBox extends from(Gtk.Box, {
 *     _some_child: Child<Gtk.Button>(),
 * }) {}
 * ```
 */
function Child<ChildType extends GObject.Object>(): ChildDescriptor<ChildType> {
	return { child_symbol: CHILD_SYMBOL }
}

function is_child_descriptor(item: any): item is ChildDescriptor<GObject.Object> {
	return item?.child_symbol == CHILD_SYMBOL
}

export { type ChildDescriptor, type ExtractChildren, Child, is_child_descriptor }
