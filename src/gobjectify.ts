import GObject from "gi://GObject?version=2.0"
import Gio from "gi://Gio?version=2.0"
import Gtk from "gi://Gtk?version=4.0"

import {
	type ChildDescriptor,
	type ExtractChildren,
	is_child_descriptor,
	Child,
} from "./child.js"
import {
	type PropDescriptor,
	type ExtractConstructProps,
	type ExtractReadonlyProps,
	type ExtractWriteableProps,
	type FlagStrings,
	is_property_descriptor,
	Property,
} from "./property.js"
import {
	type SignalDescriptor,
	type SignalOverrides,
	type RegisterableSignal,
	type SignalsOf,
	is_signal_descriptor,
	Signal,
} from "./signal.js"
import {
	type ActionDescriptor,
	type ExtractActions,
	type ExtractActionDescriptors,
	type TypedAction,
	type ActionKind,
	is_action_descriptor,
	SimpleAction,
	resolve_action_prefix,
} from "./simple_action_three.js"
import { ConstMap } from "./const_map.js"
import GLib from "gi://GLib?version=2.0"

declare const no_override: unique symbol
type Final<T> = T & typeof no_override
type Finalize<D> = {
	[K in keyof D]: Final<D[K]>
}

type PropsAllowedForPropAction<D> = keyof {
	[Key in keyof D as D[Key] extends PropDescriptor<infer T, infer F>
		? [T, F] extends [number | boolean | string, "readwrite"]
			? Key
			: never
		: never
	]: Key
}

type Descriptor<D, T extends GObject.Object> = {
	[Key in keyof D as Key extends string
		? Key
		: never
	]: Key extends keyof T
		? never
		: (Key extends `_${string}`
			? ChildDescriptor<GObject.Object>
			: Key extends keyof T["$signals"]
				? PropDescriptor<any, any>
				: PropDescriptor<any, any> | SignalDescriptor<any[], any>
	) | (T extends Gtk.Application | Gtk.ApplicationWindow | Gtk.Widget
		? (
			ActionDescriptor<Exclude<ActionKind, "prop">, any, any, any>
			| ActionDescriptor<"prop", `property::${PropsAllowedForPropAction<D>}`, any, any>
		)
		: never
	)
}

type GClassFor<T extends GObject.Object> = new (...args: any[]) => T
type AbstractGClassFor<T extends GObject.Object> = abstract new (...args: any[]) => T

type ValidConstructorProps<D> = {
	[K in keyof ExtractConstructProps<D>]?: ExtractConstructProps<D>[K]
}

type ResultingConstructorParamsObj<
	T extends AbstractGClassFor<GObject.Object>,
	D extends Descriptor<D, InstanceType<T>>,
> = ConstructorParameters<T> extends []
	? [ValidConstructorProps<D>]
	: ConstructorParameters<T> extends [(infer First)?, ...infer Rest]
		? undefined extends ConstructorParameters<T>[0]
			? [(ValidConstructorProps<D> & First)?, ...Rest]
			: [(ValidConstructorProps<D> & First), ...Rest]
		: never

type ResultingClass<
	T extends AbstractGClassFor<GObject.Object>,
	D extends Descriptor<D, InstanceType<T>>,
	I extends AbstractGClassFor<GObject.Object>[],
> = {
	readonly $gtype: GObject.GType<InstanceType<T> & { readonly $unique: unique symbol }>,
	readonly $params: ResultingConstructorParamsObj<T, D>[0],
	readonly $action_descriptors: ExtractActionDescriptors<D>,
} & (abstract new (...args: ResultingConstructorParamsObj<T, D>) => (
	SignalOverrides<InstanceType<T>, D>
	& InstanceType<T>
	& ExtractWriteableProps<D>
	& ExtractReadonlyProps<D>
	& Finalize<ExtractChildren<D>>
	& ExtractActions<D>
	& Finalize<{ with_implements: I extends [] ? never : Instances<I> }>
))

type ClassDecoratorParams = {
	template?: Uint8Array | GLib.Bytes | string,
	css_name?: string,
	gtype_flags?: GObject.TypeFlags,
	manual_gtype_name?: string,
	manual_properties?: Record<string, GObject.ParamSpec>,
	manual_internal_children?: string[],
}

type WatchPropKeys<T extends GObject.Object> = {
	[Key in keyof T]: Key extends string
		? Key extends `_${string}`
			? never
			: Key extends "with_implements" | "$signals"
				? never
				: T[Key] extends Function
					? never
					: Key
		: never
}[keyof T]

const GOBJECTIFY_FROM_SYMBOL = Symbol("GOBJECTIFY_FROM_SYMBOL")
const ACTION_GROUP_SYMBOL = Symbol("GObjectify_Action_Group_Symbol")
const INIT_FINISHED_SYMBOL = Symbol("GObjectify_GClass_Initialization_Finished_Symbol")

type BaseMetadata<D, T extends AbstractGClassFor<GObject.Object>> = {
	extend: T,
	metadata_symbol: typeof GOBJECTIFY_FROM_SYMBOL,
	descriptor: D,
	implements: (AbstractGClassFor<GObject.Object> & { $gtype: GObject.GType })[],
}

function is_base_metadata(item: any): item is BaseMetadata<any, GClassFor<GObject.Object>> {
	return item?.metadata_symbol === GOBJECTIFY_FROM_SYMBOL
}

type Instances<I extends (abstract new (...args: any) => any)[]> = I extends [infer First, ...infer Rest]
	? First extends abstract new (...args: any) => any
		? Rest extends (abstract new (...args: any) => any)[]
			? InstanceType<First> & Instances<Rest>
			: InstanceType<First>
		: never
	: unknown

/**
 * Used in tandem with `GClass`, this function creates an abstract base class used to declare
 * GObject properties, GioSimpleActions, and internal template children.
 * This function provides a strongly typed way of adding common GObject items to your extended classes via the
 * descriptor object passed in. Children, properties, and actions defined in here will be picked up by the `GClass`
 * decorator **for use in a subclass**.
 *
 * See Child, Property, Signal, and Action for info on defining members for the descriptor and your resulting subclass.
 *
 * This function does **not** make a usable class on its own! Do **not** create instances from the returned class.
 *
 * @param extend The GObject class being extended
 * @param descriptor The descriptor map describing GObject properties, internal children, and simple actions.
 * - The returned class will contain members defined in the descriptor.
 * - The descriptor may only contain definitions of these three GObject members, and also requires their names be
 * correct. Children's names must start with an underscore, `_`, and properties' names cannot.
 * - The `GClass` decorator is responsible for noticing these members and applying them to the final class.
 * - The descriptor may be empty, but in that case you can just extend the base GObject class directly.
 * @param implement A rest parameter for the list of GObject interfaces the subclass implements.
 * - With `this.with_implements`, you can access the subclass as the type of these interfaces.
 * - If no interfaces are provided, `with_implements` becomes type `never`.
 *
 * @remarks
 * The returned class will not function as expected on its own. **Always use `from` with a subclass and with the
 * `GClass` decorator**.
 *
 * The returned class exposes a static `$params` field purely for constructor type information. It has no runtime value.
 * It is purely useful for when overriding the constructor, to ensure you have all of the parameter type information.
 * You would use it via: `constructor(params: typeof MyClassName.$params) { super(params) }`
 */
function from<
	T extends abstract new (...args: any[]) => GObject.Object,
	D extends Descriptor<D, InstanceType<T>>,
	I extends (AbstractGClassFor<GObject.Object> & { $gtype: GObject.GType })[],
>(
	extend: T,
	descriptor: D,
	...implement: I
): ResultingClass<T, D, I> {
	abstract class Base extends extend { }

	(Base as any)[GOBJECTIFY_FROM_SYMBOL] = {
		extend,
		metadata_symbol: GOBJECTIFY_FROM_SYMBOL,
		descriptor,
		implements: implement,
	} satisfies BaseMetadata<D, T>

	return Base as any
}

const make_accessors = (
	class_name: string,
	prop_name: string,
	prop: PropDescriptor<any, FlagStrings>,
	desc: PropertyDescriptor,
	spec: GObject.ParamSpec,
): { get(): any, set(val: any): void } => {
	let get: (this: any) => any
	let set: (this: any, val: any) => void
	if (prop.flag === "readonly") {
		get = function () {
			return prop.validate_value(desc.get!.call(this), spec)
		}
		set = function (val) {
			if (this[INIT_FINISHED_SYMBOL]) {
				throw new Error(dedent`
					GClass: ${class_name}
					Readonly property '${prop_name}' cannot be set after initialization.
					}
				`)
			}
			desc.set!.call(this, prop.validate_value(val, spec))
		}
	} else if (prop.flag === "computed") {
		get = function () {
			if (!this[INIT_FINISHED_SYMBOL]) {
				return prop.validate_value(spec.get_default_value(), spec)
			}
			return prop.validate_value(desc.get!.call(this), spec)
		}
		set = function (val) {
			if (!this[INIT_FINISHED_SYMBOL]) {
				throw new Error(dedent`
					GClass: ${class_name}
					Computed property '${prop_name}' cannot be set during initialization.
				`)
			}
			desc.set!.call(this, prop.validate_value(val, spec))
		}
	} else {
		get = function () {
			return prop.validate_value(desc.get!.call(this), spec)
		}
		set = function (val) {
			desc.set!.call(this, prop.validate_value(val, spec))
		}
	}
	return { get, set }
}

/**
 * Class decorator to define a GObject/Gtk class with properties, children, actions, and signals.
 *
 * It wraps a standard GObject derived class and automatically handles:
 * - Sets the class name as the GType name (can be overridden with `options.manual_gtype_name`)
 * - Registering signals declared via the `Signal` decorator
 * - Registering an optional UI template file, custom CSS name, GType Flags, or interface implementations
 * - Registers and inits GObject properties provided by the `from` base and/or from `manual_properties`
 * - Registers internal children provided by the `from` base and/or from `manual_internal_children`
 * - Registers and hooks up GioSimpleActions provided by the `from` base
 *
 * This decorator allows a declarative approach to extending GObject classes, without having to manually call
 * `GObject.registerClass`, or manage signal/action setup.
 *
 * @template T - The base GObject class to extend.
 * @param options Optional configurations for the class.
 * @param options.template GTK template resource to use.
 * @param options.implements Interfaces to implement.
 * @param options.css_name CSS node name for GTK styling.
 * @param options.gtype_flags Flags for GType registration.
 * @param options.manual_gtype_name Provide a manual GType name instead of using the class name.
 * @param options.manual_properties Additional properties to register not provided by the `from` base.
 * @param options.manual_internal_children Additional internal child names not provided by the 'from' base.
 *
 * @example
 * ```ts
 * @GClass({ css_name: "my-widget", template: "resource:///org/my/app/ui/my_widget.ui" })
 * class MyWidget extends from(Gtk.Box, {
 *     title: Property.string({ default: "My Awesome Widget" }),
 * }) {
 *     constructor(params: typeof MyWidget.$params) {
 *         super(params)
 *         print(`${this.title} is created!`)
 *     }
 * }
 * ```
 *
 * @remarks
 * All properties defined with GObjectify's Property are marked as `CONSTRUCT` properties,
 * so they are guaranteed to be set after `super()` is finished in the constructor.
 */
function GClass<T extends GObject.Object>(options?: ClassDecoratorParams) {
	return function (target: GClassFor<T>, _context: ClassDecoratorContext): void {
		const prototype = target.prototype
		const parent = Object.getPrototypeOf(target)
		const maybe_metadata: unknown = (parent as any)?.[GOBJECTIFY_FROM_SYMBOL]
		const properties: Record<string, GObject.ParamSpec<any>> = {}
		const property_descriptors: Record<string, PropDescriptor<any, any>> = {}
		const children: string[] = []
		const action_prefix = resolve_action_prefix(target)
		const actions = new Map<string, ActionDescriptor<any, any, any, any>>()
		const signals: Record<string, RegisterableSignal> = {}
		let implement: (AbstractGClassFor<GObject.Object> & { $gtype: GObject.GType })[] = []

		if (is_base_metadata(maybe_metadata)) {
			const real_base = maybe_metadata.extend.prototype
			implement = maybe_metadata.implements

			Object.defineProperty(prototype, "with_implements", {
				enumerable: true,
				configurable: false,
				get(): any {
					return this
				},
			})

			for (const [name, value] of Object.entries(maybe_metadata.descriptor)) {
				if (is_property_descriptor(value)) {
					property_descriptors[name] = value
					const spec = value.create(name)
					properties[name] = spec

					const is_flagged_computed: boolean = value.flag === "computed"
					const own_desc = Object.getOwnPropertyDescriptor(prototype, name)
					const has_get_or_set: boolean = (
						typeof own_desc?.get === "function"
						|| typeof own_desc?.set === "function"
					)
					if (is_flagged_computed && !has_get_or_set) {
						// Error when a computed flagged property does not have a user-provided getter and setter
						throw new Error(dedent`
							GClass: ${target.name},
							"computed" flagged property '${name}' is missing a getter or a setter function.
						`)
					}
					if (!is_flagged_computed && has_get_or_set) {
						// Error when a non-computed flagged property has a user-provided getter and setter
						throw new Error(dedent`
							GClass: ${target.name},
							Non-"computed" flagged property '${name}' has a getter or a setter function.
							To use a custom getter and setter, flag this property as "computed".
						`)
					}

					if (
						(spec.flags & GObject.ParamFlags.READABLE)
						&& !(spec.flags & GObject.ParamFlags.WRITABLE)
					) {
						// Make getters for CONSTANT properties (flags: READABLE but not WRITEABLE nor READWRITE)
						Object.defineProperty(prototype, name, {
							enumerable: true,
							configurable: false,
							get() { return spec.get_default_value() ?? null },
						})
					}
				} else if (is_child_descriptor(value)) {
					children.push(name.replace("_", ""))
				} else if (is_action_descriptor(value)) {
					if (
						value.accels.length > 0
						&& !(action_prefix === "win" || action_prefix === "app")
					) throw new Error(`
						GClass: ${target.name},
						Action '${name}' has keyboard accels despite this GClass not extend Gtk.Application or Gtk.ApplicationWindow.
						Actions with accels are only allowed on Gtk.Application and Gtk.ApplicationWindow subcalsses.
					`)
					actions.set(name, value)
				} else if (is_signal_descriptor(value)) {
					signals[name.replaceAll("_", "-")] = value.create()
				}
			}

			// Remove the 'from' base class from the prototype chain, making the decorated class directly extend the base GObject class
			Object.setPrototypeOf(prototype, real_base)
			Object.setPrototypeOf(target, maybe_metadata.extend)
		}

		(target as any).$action_descriptors = Object.fromEntries(actions)

		for (const [name, spec] of Object.entries(options?.manual_properties ?? {})) {
			if (properties[name]) {
				throw new Error(`Manual property '${name}' in GClass decorated class '${target.name}' conflicts with a property of the same name defined in the 'from' base. Please rename one of them.`)
			}
			properties[name] = spec
		}

		// runs when an instance is created, thanks GTK for having an init hook
		// -------------------------------------------------------------------
		const original_init = prototype._init
		prototype._init = function (...args: any): any {
			const original_return_val = original_init?.apply?.(this, args)

			if (actions.size > 0) {
				let action_addable: Gio.SimpleActionGroup | Gtk.ApplicationWindow | Gtk.Application | undefined
				let accel_setter: ((detailed_action_name: string, accels: string[]) => void) | undefined

				// TODO: Document how accels get set for GtkApplicationWindows, particularly the next_idle part
				if (this instanceof Gtk.ApplicationWindow) {
					action_addable = this
					accel_setter = (detailed_name, accels) => {
						if (accels.length < 1) return
						next_idle().then(() => this.get_application()?.set_accels_for_action(detailed_name, accels))
					}
				} else if (this instanceof Gtk.Application) {
					action_addable = this
					accel_setter = this.set_accels_for_action.bind(this)
				} else if (this instanceof Gtk.Widget) {
					action_addable = ((this as any)[ACTION_GROUP_SYMBOL] ??= new Gio.SimpleActionGroup())
					this.insert_action_group(target.name, action_addable!)
				}

				if (action_addable !== undefined) {
					for (const [name, value] of actions.entries()) {
						const typed_action = value.create(name)
						action_addable.add_action(typed_action.action)
						accel_setter?.(`${action_prefix}.${name}`, value.accels)
						this[name] = typed_action
					}
				}
			}

			// makes "computed" properties throw when set before this point
			// makes "readonly" properties throw when set after this point
			this[INIT_FINISHED_SYMBOL] = true

			return original_return_val
		}
		// -------------------------------------------------------------------

		GObject.registerClass({
			GTypeName: options?.manual_gtype_name || target.name,
			Implements: implement,
			Properties: properties,
			InternalChildren: options?.manual_internal_children?.concat(children) ?? children,
			Signals: signals,
			...(options?.css_name && { CssName: options.css_name }),
			...(options?.gtype_flags && { GTypeFlags: options.gtype_flags }),
			...(options?.template && { Template: options.template }),
		}, target)

		for (const [key, prop] of Object.entries(property_descriptors)) {
			const spec = properties[key]!
			if (
				!(spec.flags & GObject.ParamFlags.WRITABLE)
				|| spec.flags & GObject.ParamFlags.CONSTRUCT_ONLY
			) continue
			const desc = Object.getOwnPropertyDescriptor(prototype, key)
			if (desc === undefined || typeof desc.get !== "function" || typeof desc.set !== "function") {
				throw new Error(dedent`
					GClass: ${target.name},
					Writeable custom GObject property '${key}' is missing a getter or a setter function.
				`)
			}
			const accessors = make_accessors(target.name, key, prop, desc, spec)
			Object.defineProperty(prototype, key, {
				configurable: desc.configurable ?? true,
				enumerable: desc.enumerable ?? true,
				...accessors,
			})
		}
	}
}

/**
 * Decorator factory that debounces a method.
 *
 * When applied to a class method, `Debounce(milliseconds, options)` ensures
 * that the method is not called more frequently than the specified interval.
 *
 * You can control whether the method is called on the leading edge, trailing edge, or both.
 *
 * This is useful in GTK/GJS applications for handling rapid events
 * like `notify` or `changed` without flooding your logic.
 *
 * @template T The class type containing the method.
 * @template U The type of the method being debounced.
 * @param milliseconds The debounce interval in milliseconds.
 * @param params Options to control when the method is triggered.
 * - { trigger: "leading" }: will call the function immediately, and then not call it again within the interval
 * - { trigger: "trailing" } (default): will wait to call the function until after the interval has passed
 * - { trigger: "leading+trailing" }:
 * will call the function immediately, and call it once more after the interval has passed
 */
function Debounce<T extends GObject.Object, U extends (this: T, ...args: any[]) => void>(
	milliseconds: number,
	params: { trigger: "leading" | "trailing" | "leading+trailing" } = { trigger: "trailing" },
) {
	const leading = params.trigger.includes("leading")
	const trailing = params.trigger.includes("trailing")
	return (original_method: U, context: ClassMethodDecoratorContext): U => {
		const timeout_symbol = Symbol(`DebounceDebouncerFor${context.name.toString()}`)
		const last_args_symbol = Symbol(`DebounceDebounceArgsFor${context.name.toString()}`)
		const should_call_trailing_symbol = Symbol(
			`DebounceShouldCallTrailingFor${context.name.toString()}`,
		)
		const debounced = function (this: T, ...args: any[]): void {
			const has_scheduled = (this as any)[timeout_symbol] != null
			if (leading && !has_scheduled) {
				original_method.apply(this, args)
			} else {
				(this as any)[last_args_symbol] = args
				; (this as any)[should_call_trailing_symbol] = true
			}
			if ((this as any)[timeout_symbol]) {
				GLib.source_remove((this as any)[timeout_symbol])
			}
			(this as any)[timeout_symbol] = GLib.timeout_add(
				GLib.PRIORITY_DEFAULT,
				milliseconds,
				() => {
					(this as any)[timeout_symbol] = null
					if (trailing && (this as any)[should_call_trailing_symbol]) {
						original_method.apply(this, (this as any)[last_args_symbol] ?? [])
						; (this as any)[should_call_trailing_symbol] = false
					}
					return GLib.SOURCE_REMOVE
				},
			)
		}
		return debounced as U
	}
}

/**
 * Decorator for a setter method that automatically calls `this.notify`
 * for the corresponding GObject property after the setter runs.
 *
 * This ensures that GObject bindings or signals depending on the property
 * are correctly updated when the value changes. The property name used
 * in `notify` is the decorated setter's name with underscores replaced by hyphens,
 * which matches the typical GObject property naming convention.
 *
 * @template T The class type containing the property.
 * @template U The type of value being set.
 * @param target The original setter method.
 * @param context The decorator context.
 * @returns A wrapped setter that calls `this.notify()`.
 *
 * @example
 * ```ts
 * class MyWidget extends from(Gtk.Box, {
 *     count_value: Property.double({ flags: "computed" }),
 * }) {
 *     #count = 0
 *
 *     override get count_value(): number {
 *         return this.#count
 *     }
 *
 *     @Notify
 *     override set count_value(val: number) {
 *         print(`Setting count_value to ${val}`)
 *         this.#count = val
 *     }
 * }
 *
 * const widget = new MyWidget();
 * widget.count_value = 42; // Automatically calls widget.notify("count-value")
 * ```
 */
function Notify<T extends GObject.Object, U>(
	target: (this: T, arg0: U) => void,
	context: ClassSetterDecoratorContext<T>,
): (this: T, arg0: U) => void {
	const field_name = String(context.name)
	const canonical_name = field_name.replaceAll("_", "-")
	return function (this: T, arg0: U): void {
		target.call(this, arg0)
		this.notify(canonical_name)
	}
}

/**
 * Decorator that connects a method to a GObject signal emission.
 *
 * When applied to a class method, `OnSignal(signal_name)` ensures that the method
 * is automatically connected to the given signal_name on each instance. The decorated
 * method is bound to the instance, so `this` always refers to the object emitting
 * the signal_name.
 *
 * This is useful for GTK/GObject classes where you want to handle signals
 * declaratively without manually calling `connect`.
 *
 * @param signal_name The name of the GObject signal to connect to.
 * @returns A decorator for instance methods.
 *
 * @example
 * ```ts
 * class MyButton extends Gtk.Button {
 *     @OnSignal("clicked")
 *     handle_click() {
 *         print("I have been clicked!")
 *     }
 * }
 * ```
 *
 * @remarks
 * handle_click is automatically called when "clicked" is emitted
 */
function OnSignal<T extends GObject.Object, S extends keyof SignalsOf<T>>(
	signal_name: S,
) {
	return (
		target: (
			this: T,
			...args: SignalsOf<T>[S] extends (...args: infer Args) => any ? Args : never
		) => SignalsOf<T>[S] extends (...args: any) => infer Ret ? Ret : never,
		context: ClassMethodDecoratorContext<T>,
	): void => context.addInitializer(function (this: T): void {
		this.connect(signal_name as string, (_self: T, ...args: any[]) => target.apply(this, args as any))
	})
}

// TODO: Document this!
// TODO: Use $action_descriptors instead of key iteration
function OnSimpleAction<
	T extends GObject.Object,
	K extends {
		[Key in keyof T]: Key extends "with_implements"
			? never
			: T[Key] extends Gio.SimpleAction | TypedAction<any, any, any>
				? Key
				: never
	}[keyof T],
	U extends T[K] extends Gio.SimpleAction
		? (this: T, variant: GLib.Variant) => any
		: T[K] extends TypedAction<infer Kind, any, infer N>
			? Kind extends "param" | "state"
				? (this: T, param_state: N) => any
				: (this: T) => any
			: never,
>(action_name: K) {
	return function (target: U, context: ClassMethodDecoratorContext<T>): void {
		context.addInitializer(function (this: T): void {
			const action = this[action_name] as Gio.SimpleAction | TypedAction<any, any, any>
			if (action instanceof Gio.SimpleAction) {
				action.connect("activate", (_action, ...rest) => (target as any).apply(this, rest))
			} else {
				action.connect((_action, ...rest) => (target as any).apply(this, rest))
			}
		})
	}
}

/**
 * Decorator that connects a method to a Gio simple action's event signal.
 *
 * This decorator expects a string for the name of the action, but this string is limited to action fields defined on
 * the instance type in the method's class. See `from` for info on how to easily add Simple Actions to
 * GObject subclasses.
 *
 * @param action_name - Name of the field containing a GioSimpleAction to connect to.
 */
// function OnSimpleAction<
// 	T extends GObject.Object,
// 	K extends {
// 		[Key in keyof T]: Key extends "with_implements"
// 		? never
// 		: T[Key] extends Gio.SimpleAction
// 		? Key
// 		: never
// 	}[keyof T],
// 	U extends (
// 		| ((this: T) => any)
// 		| ((this: T, action: Gio.SimpleAction) => any)
// 		| ((this: T, action: Gio.SimpleAction, value: GLib.Variant) => any)
// 	),
// >(action_name: K) {
// 	return function (target: U, context: ClassMethodDecoratorContext<T>): void {
// 		context.addInitializer(function (this: T): void {
// 			(this[action_name] as Gio.SimpleAction).connect("activate", target.bind(this))
// 		})
// 	}
// }

/**
 * Decorator that connects a method to one or more GObject property change notifications.
 *
 * When applied to a class method, the method will be called asynchronously on idle after class initialization,
 * and then automatically connected to the `notify::prop-name` signal for the specified property,
 * which will cause the function to be ran whenever the property's value changes.
 *
 * Multiple `@WatchProp` decorators can be stacked on a single method to watch several properties,
 * however this will call the function multiple times on idle after initialization.
 *
 * @param prop_name The snake_case name of the GObject property to watch.
 *
 * @example
 * ```ts
 * @GClass()
 * class MyButton extends from(Gtk.Box, {
 *     header_title: Property.string(),
 * }) {
 *     @WatchProp("header_title")
 *     #on_header_title_changed(): void {
 *         print("title is:", this.header_title)
 *     }
 * }
 * ```
 *
 * @remarks
 * The property name is automatically converted from snake_case to kebab-case
 * when connecting to the notify signal, so you don't need to think about the
 * distinction. Property names must be valid, registered GObject properties.
 * Plain JavaScript fields are *not valid* and will *cause errors*.
 */
function WatchProp<T extends GObject.Object, K extends WatchPropKeys<T>>(prop_name: K) {
	const kebab: string = prop_name.replaceAll("_", "-")
	return (target: (this: T) => any, context: ClassMethodDecoratorContext<T>): void => {
		context.addInitializer(function (this: T): void {
			this.connect(`notify::${kebab}`, target.bind(this))
			next_idle().then(() => target.call(this)).catch((e) => {
				print(`Error in @WatchProp method '${target.name}'`)
				print(e)
			})
		})
	}
}

const on_post_init_error = (method_name: string, class_name: string, e: unknown): void => {
	print(`Error in @PostInit function '${method_name}' of '${class_name}':`)
	print(e)
}

/**
 * Decorator for a method that will be called on the next GLib idle iteration after the class has been instantiated.
 *
 * The method will be called via GLib.idle_add, which will ensure it waits for an idle cycle after the class
 * has been constructed. Properties, template children, and class members will all be available when its called.
 *
 * @template T The class type containing the property.
 * @template U The type of value being set.
 * @param target The original setter method.
 * @param context The decorator context.
 *
 * @example
 * ```ts
 * class MyWidget extends Gtk.Box {
 *     @PostInit
 *     setup(): void {
 *         print("MyWidget has been constructed, and an idle cycle has happened!")
 *     }
 * }
 * ```
 */
function PostInit<T extends GObject.Object>(target: (this: T) => any, context: ClassMethodDecoratorContext<T>): void {
	context.addInitializer(function (this: T) {
		next_idle().then(() => {
			try {
				const result = target.call(this)
				if (result instanceof Promise) {
					result.catch((e) => on_post_init_error(target.name, this.constructor.name, e))
				}
			} catch (e) {
				on_post_init_error(target.name, this.constructor.name, e)
			}
		})
	})
}

/**
 * Schedules a callback to run on the next GLib idle iteration.
 *
 * This function returns a promise that resolves when the GLib main loop reaches the next idle cycle.
 *
 * @returns A promise that resolves on the next GLib idle iteration.
 *
 * @example
 * ```
 * await next_idle()
 * print("Runs at the next idle cycle!")
 * ```
 */
async function next_idle(): Promise<void> {
	return new Promise((resolve, _reject) => GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
		resolve()
		return GLib.SOURCE_REMOVE
	}))
}

/**
 * Wait for a specified duration in milliseconds.
 *
 * Returns a Promise that resolves after the given timeout. Internally,
 * it uses `GLib.timeout_add`, making it safe to use within GTK/GJS
 * main loop contexts without blocking the UI.
 *
 * @param duration The timeout duration in milliseconds
 * @returns A promise that resolves after the timeout.
 *
 * @example
 * ```ts
 * await timeout_ms(500)
 * print("It has been 500 milliseconds!")
 * ```
 */
async function timeout_ms(duration: number): Promise<void> {
	return new Promise((resolve, _reject) => {
		GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, duration, () => {
			resolve()
			return GLib.SOURCE_REMOVE
		})
	})
}

/**
 * Removes common leading indentation from a template string. Allowing for multi-line strings that don't have improper
 * indentation from source code.
 *
 * @param strings The literal portions of the template string.
 * @param values Interpolated values. Each value is concatenated with the corresponding
 * string segment using JavaScript's standard string coercion.
 *
 * @returns The dedented string with leading/trailing blank lines removed and common indentation stripped.
 *
 * This function is meant to be used as a template-tag:
 * @example
 * ```ts
 * const text = dedent`
 *     Hello,
 *         this line is indented relative to the block.
 *     Goodbye!
 * `
 * // Becomes:
 * // "Hello
 * //     this line is indented relative to the block.
 * // Goodbye!"
 * ```
 */
function dedent(strings: TemplateStringsArray, ...values: any[]): string {
	const full = strings.map((str, index) => str + (index < values.length ? values[index] : "")).join("")
	const lines = full.split("\n")

	while (lines.length && lines[0]?.trim() === "") {
		lines.shift()
	}
	while (lines.length && lines.at(-1)?.trim() === "") {
		lines.pop()
	}

	let mindent = Number.MAX_SAFE_INTEGER
	for (const line of lines) {
		if (line.trim() === "") continue
		const indent = line.search(/\S/)
		if (indent >= 0) mindent = Math.min(mindent, indent)
	}
	if (mindent === Number.MAX_SAFE_INTEGER) mindent = 0

	return lines.map((line) => (line.trim() === "" ? line : line.slice(mindent))).join("\n")
}

declare module "gi://GObject?version=2.0" {
	export namespace GObject {
		export interface Object {
			$connect<const Self extends GObject.Object, S extends keyof Self["$signals"]>(
				this: Self,
				signal_name: S,
				callback: Self["$signals"][S] extends (...args: infer Args) => infer Ret
					? (self: Self, ...args: Args) => Ret
					: never,
			): number
			$connect_after<const Self extends GObject.Object, S extends keyof Self["$signals"]>(
				this: Self,
				signal_name: S,
				callback: Self["$signals"][S] extends (...args: infer Args) => infer Ret
					? (self: Self, ...args: Args) => Ret
					: never,
			): number
			$emit<const Self extends GObject.Object, S extends keyof Self["$signals"]>(
				this: Self,
				signal_name: S,
				...args: Self["$signals"][S] extends (...args: infer Args) => any
					? Args
					: never,
			): void
			/**
			 * Connects to a GObject signal and returns a Promise that resolves the first time the signal is emitted.
			 *
			 * This function is an async wrapper for GObject signals, allowing you
			 * to `await` the emission of a signal instead of using callbacks.
			 * Optionally, you can provide a `reject_signal` that will reject the promise if that signal is emitted first.
			 *
			 * The connected signal handlers are automatically disconnected once the promise
			 * resolves or rejects, preventing memory leaks or duplicate connections.
			 *
			 * @param resolve_signal The signal name whose emission will resolve the promise.
			 * @param reject_signal Optional signal name whose emission will reject the promise.
			 * @returns A promise that resolves with the arguments emitted by `resolve_signal`.
			 *
			 * @remarks
			 * Only signals with a `void` return type can be awaited. Signals that return
			 * a value cannot be used with `$connect_async`, as the return value is
			 * provided by the handler rather than the emission. Use `$connect` directly
			 * for non-void signals.
			 *
			 * @example
			 * ```ts
			 * // Wait for a Gtk.Button to be clicked once
			 * const button = new Gtk.Button({ label: "Click me" })
			 * await button.$connect_async("clicked")
			 * print("Button clicked!")
			 * ```
			 *
			 * @example
			 * ```ts
			 * // Handle a signal that could fail
			 * try {
			 *     const [result] = await obj.$connect_async("success-signal", "error-signal")
			 *     print(`Success: ${result}`)
			 * } catch (err) {
			 *     print(`Error signal triggered: ${err.message}`)
			 * }
			 * ```
			 */
			$connect_async<const Self extends GObject.Object, S extends keyof Self["$signals"]>(
				this: Self,
				resolve_signal: S,
				reject_signal?: keyof Self["$signals"]
			): Self["$signals"][S] extends (...args: infer Args) => void
				? Promise<Args>
				: never
		}
	}
}

GObject.Object.prototype.$connect = GObject.Object.prototype.connect
GObject.Object.prototype.$connect_after = GObject.Object.prototype.connect_after
GObject.Object.prototype.$emit = GObject.Object.prototype.emit
GObject.Object.prototype.$connect_async = function (this: GObject.Object, resolve_signal: string, reject_signal?: string): Promise<any> {
	return new Promise((resolve, reject) => {
		let resolve_id: number | undefined
		let reject_id: number | undefined
		const cleanup = (): void => {
			if (resolve_id !== undefined) this.disconnect(resolve_id)
			if (reject_id !== undefined) this.disconnect(reject_id)
		}
		resolve_id = this.connect(resolve_signal, (_ob, ...args) => {
			cleanup()
			resolve(args)
		})
		if (!reject_signal) return
		reject_id = this.connect(reject_signal, (_obj, ...args) => {
			cleanup()
			reject(new Error(`Rejection signal: '${String(reject_signal)}' triggered with args: ${args}`))
		})
	})
} as any

// TODO: Document this!
// TODO: Remove "with_implements" from the iterated keys, possible use $action_descriptors instead
declare module "gi://Gtk?version=4.0" {
	export namespace Gtk {
		export interface Widget {
			$activate_action<
				C extends abstract new (...args: any[]) => Gtk.Widget,
				N extends {
					[K in keyof InstanceType<C>]: InstanceType<C>[K] extends TypedAction<any, any, any> ? K : never
				}[keyof InstanceType<C>],
			>(
				klass: C,
				name: N,
				...param: InstanceType<C>[N] extends TypedAction<"void", any, any>
					? []
					: InstanceType<C>[N] extends TypedAction<any, any, infer T>
						? [value: T]
						: []
			): void
		}
	}
}

Gtk.Widget.prototype.$activate_action = function (
	this: Gtk.Widget,
	klass: any,
	name: string,
	...params: any[]
): void {
	const descriptor: ActionDescriptor<any, any, any, any> | undefined = klass.$action_descriptors?.[name]
	const detailed_action = `${resolve_action_prefix(klass)}.${name}`
	if (descriptor?.format && params.length > 0) {
		this.activate_action(detailed_action, new GLib.Variant(descriptor.format, params[0]))
	} else {
		this.activate_action(detailed_action, null)
	}
} as any

export {
	from,
	next_idle,
	timeout_ms,
	dedent,
	ConstMap,
	GClass,
	Signal,
	Debounce,
	Notify,
	WatchProp,
	OnSignal,
	OnSimpleAction,
	PostInit,
	Property,
	Child,
	SimpleAction,
}
