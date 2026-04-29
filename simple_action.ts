import Gio from "gi://Gio?version=2.0"

const ACTION_SYMBOL = Symbol("Symbol for GObjectify SimpleAction descriptors")

type ActionArgs = Omit<Partial<Gio.SimpleAction.ConstructorProps>, "name">

type ActionDescriptor = {
	args: ActionArgs,
	accels: string[],
	action_symbol: typeof ACTION_SYMBOL,
}

type ExtractActions<D> = {
	readonly [Key in keyof D as D[Key] extends ActionDescriptor ? Key : never]: Gio.SimpleAction
}

/**
 * Creates an **ActionDescriptor** for use with `from()` and `GClass`, describing a GioSimpleAction. This can only be
 * used if the resulting subclass is of a GtkApplication, GtkApplicationWindow, or a GtkWidget
 *
 * `from()` and `GClass` will see this descriptor and connect up the action to the instance on instantiation.
 *
 * @param params Optional parameters for the SimpleAction. See `new Gio.SimpleAction()` constructor parameters
 *
 * @example
 * ```ts
 * @GClass()
 * class MyBox extends from(Gtk.Box, {
 *     some_action(),
 * }) {}
 * // MyBox instances now have a `some_action` GioSimpleAction available
 * ```
 */
function SimpleAction(params?: ActionArgs & { accels?: string[] }): ActionDescriptor {
	const { accels, ...args } = params ?? {}
	return {
		args,
		accels: accels ?? [],
		action_symbol: ACTION_SYMBOL,
	}
}

function is_action_descriptor(item: any): item is ActionDescriptor {
	return item?.action_symbol === ACTION_SYMBOL
}

export { type ActionDescriptor, type ExtractActions, SimpleAction, is_action_descriptor }
