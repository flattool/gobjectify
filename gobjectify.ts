import GObject from "gi://GObject?version=2.0"
import Gio from "gi://Gio?version=2.0"
import Gtk from "gi://Gtk?version=4.0"

import {
	type ChildDescriptor,
	type ExtractChildren,
	is_child_descriptor,
	Child,
} from "./__internal/__child.js"
import {
	type PropertyDescriptor,
	type ExtractConstructProps,
	type ExtractReadonlyProps,
	type ExtractWriteableProps,
	is_property_descriptor,
	Property,
} from "./__internal/__property.js"
import {
	type ActionDescriptor,
	type ExtractActions,
	SimpleAction,
	is_action_descriptor,
} from "./__internal/__simple_action.js"
import { NUMERIC_GTYPE_DEFAULTS } from "./__internal/property_helpers.js"
import { ConstMap } from "./__internal/__const_map.js"
import GLib from "gi://GLib?version=2.0"

declare const no_override: unique symbol
type Final<T> = T & typeof no_override
type Finalize<D> = {
	[K in keyof D]: Final<D[K]>
}

type Descriptor<D, T extends GObject.Object> = {
	[Key in keyof D as Key extends string
		? Key
		: never
	]: Key extends keyof T
		? never
		: (Key extends `_${string}`
			? ChildDescriptor<GObject.Object>
			: PropertyDescriptor<any, any>
		) | (T extends Gtk.Application | Gtk.ApplicationWindow | Gtk.Widget
			? ActionDescriptor
			: never
		)
}

type GClassFor<T extends GObject.Object> = new (...args: any[])=> T
type AbstractGClassFor<T extends GObject.Object> = abstract new (...args: any[])=> T

type ResultingConstructorArgs<
	T extends AbstractGClassFor<GObject.Object>,
	D extends Descriptor<D, InstanceType<T>>,
> = ExtractConstructProps<D> & Partial<ExtractWriteableProps<D>>

type ResultingClass<
	T extends AbstractGClassFor<GObject.Object>,
	D extends Descriptor<D, InstanceType<T>>,
	I extends AbstractGClassFor<GObject.Object>[],
> = { $gtype: GObject.GType } & (
	abstract new (...args: ConstructorParameters<T> extends []
		? [ResultingConstructorArgs<T, D>]
		: ConstructorParameters<T> extends [infer First, ...infer Rest]
			? [ResultingConstructorArgs<T, D> & First, ...Rest]
			: ConstructorParameters<T> extends [...infer Some]
				? [ResultingConstructorArgs<T, D> & Some[0]]
				: never
	)=> (
		InstanceType<T>
		& ExtractWriteableProps<D>
		& ExtractReadonlyProps<D>
		& Finalize<ExtractChildren<D>>
		& Finalize<ExtractActions<D>>
		& Finalize<{ with_implements: I extends [] ? never : Instances<I> }>
	)
)

type Signal = {
	flags?: GObject.SignalFlags,
	param_types?: GObject.GType[],
	return_type?: GObject.GType,
	accumulator?: GObject.AccumulatorType,
}

type ClassDecoratorParams = {
	template?: Uint8Array | GLib.Bytes | string,
	// implements?: { $gtype: GObject.GType }[],
	css_name?: string,
	gtype_flags?: GObject.TypeFlags,
	manual_gtype_name?: string,
	manual_properties?: Record<string, GObject.ParamSpec>,
	manual_internal_children?: string[],
}

const GOBJECTIFY_FROM_SYMBOL = Symbol("GOBJECTIFY_FROM_SYMBOL")
const ACTION_GROUP_SYMBOL = Symbol("GObjectify_Action_Group_Symbol")
const signals_map = new WeakMap<Function, Record<string, Signal>>()

type BaseMetadata<D, T extends AbstractGClassFor<GObject.Object>> = {
	extend: T,
	metadata_symbol: typeof GOBJECTIFY_FROM_SYMBOL,
	descriptor: D,
	implements: (AbstractGClassFor<GObject.Object> & { $gtype: GObject.GType })[],
}

function is_base_metadata(item: any): item is BaseMetadata<any, GClassFor<GObject.Object>> {
	return item?.metadata_symbol === GOBJECTIFY_FROM_SYMBOL
}

type Instances<I extends (abstract new (...args: any)=> any)[]>
	= I extends [infer First, ...infer Rest]
		? First extends abstract new (...args: any)=> any
			? Rest extends (abstract new (...args: any)=> any)[]
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
 * See Child, Property, and Action for info on defining members for the descriptor and your resulting subclass.
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
 */
function from<
	T extends abstract new (...args: any[])=> GObject.Object,
	D extends Descriptor<D, InstanceType<T>>,
	I extends (AbstractGClassFor<GObject.Object> & { $gtype: GObject.GType })[],
>(
	extend: T,
	descriptor: D,
	...implement: I
): ResultingClass<T, D, I> {
	abstract class Base extends extend {}

	(Base as any)[GOBJECTIFY_FROM_SYMBOL] = {
		extend,
		metadata_symbol: GOBJECTIFY_FROM_SYMBOL,
		descriptor,
		implements: implement,
	} satisfies BaseMetadata<D, T>

	return Base as any
}

type ReadyFunc = { _ready?: ()=> (void | Promise<void>) }

/**
 * Class decorator to define a GObject/Gtk class with properties, children, actions, and signals.
 *
 * It wraps a standard GObject derived class and automatically handles:
 * - Sets the class name as the GType name (can be overridden with `options.manual_gtype_name`)
 * - Registering signals declared via the `Signal` decorator
 * - Running an optional `_ready` method after the first idle iteration of the Gtk Main Loop after instantiation
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
 *     title: Property("string", { default: "My Awesome Widget!" }),
 * }) {
 *     _ready() {
 *         print(`${this.title} is ready!)
 *     }
 * }
 * ```
 *
 * @remarks
 * If a `_ready` function is defined on the class, it may only return `void` or `Promise<void>`.
 * If provided, the `_ready` function will be called once on the next GLib idle cycle after initialization,
 * allowing you to safely run post-construction logic.
 */
function GClass<T extends GObject.Object>(options?: ClassDecoratorParams) {
	return function (target: GClassFor<T & ReadyFunc>, _context: ClassDecoratorContext): void {
		const prototype = target.prototype
		const parent = Object.getPrototypeOf(target)
		const maybe_metadata: unknown = (parent as any)?.[GOBJECTIFY_FROM_SYMBOL]

		let properties: Record<string, GObject.ParamSpec<any>> = {}
		const property_descriptors: Record<string, PropertyDescriptor<any, any>> = {}
		let children: string[] = []
		let actions = new Map<string, ActionDescriptor>()
		let implement: (AbstractGClassFor<GObject.Object> & { $gtype: GObject.GType })[]

		if (is_base_metadata(maybe_metadata)) {
			const real_base = maybe_metadata.extend.prototype
			implement = maybe_metadata.implements

			Object.defineProperty(prototype, "with_implements", {
				enumerable: true,
				configurable: false,
				get(): any {
					return this
				},
				set(__: any) {},
			})

			for (const [name, value] of Object.entries(maybe_metadata.descriptor)) {
				if (is_property_descriptor(value)) {
					property_descriptors[name] = value
					const spec = value.create(name)
					properties[name] = spec
					if (
						spec.flags && GObject.ParamFlags.READABLE
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
					children.push(name)
				} else if (is_action_descriptor(value)) {
					actions.set(name, value)
				}
			}

			Object.setPrototypeOf(prototype, real_base)
			Object.setPrototypeOf(target, maybe_metadata.extend)
		}

		implement ??= []

		properties = { ...properties, ...options?.manual_properties ?? {} }
		children = [...children, ...options?.manual_internal_children ?? []]

		// on first instance being created, thanks GTK for having an init hook
		// -------------------------------------------------------------------
		const original_init = prototype._init
		prototype._init = function (...args: any): any {
			const original_return_val = original_init?.apply?.(this, args)

			for (const [key, spec] of Object.entries(properties)) {
				if (
					spec.flags & GObject.ParamFlags.WRITABLE
					&& !(spec.flags & GObject.ParamFlags.CONSTRUCT_ONLY)
				) {
					const desc = (
						// Find getter/setters defined on the class before finding those declared for the instance
						Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this), key)
						?? Object.getOwnPropertyDescriptor(this, key)
					)
					if (desc === undefined || typeof desc.get !== "function" || typeof desc.set !== "function") {
						throw new Error(dedent`
							GClass:
							Writeable custom GObject property '${key}' on GClass decorated class \
							'${target.name}' is not configured with a getter or a setter function.
						`)
					}
					const instance = this
					const get = function (): any {
						return desc.get?.call(instance) ?? spec.get_default_value() ?? null
					}
					let set: (val: any)=> void
					const maybe_default_nums = NUMERIC_GTYPE_DEFAULTS.looseGet(spec.value_type)
					if (maybe_default_nums !== undefined) {
						const min = property_descriptors[key]?.min ?? maybe_default_nums.min
						const max = property_descriptors[key]?.max ?? maybe_default_nums.max
						const is_double = spec.value_type === GObject.TYPE_DOUBLE
						set = function (val: any): void {
							if (val > max) val = max
							if (val < min) val = min
							if (!is_double) val = Math.trunc(val)
							desc.set?.call(instance, val)
						}
					} else {
						set = desc.set
					}
					Object.defineProperty(this, key, {
						configurable: desc.configurable ?? true,
						enumerable: desc.enumerable ?? true,
						get,
						set,
					})
				}
			}

			if (is_base_metadata(maybe_metadata)) {
				let action_addable: Gio.SimpleActionGroup | Gtk.ApplicationWindow | Gtk.Application | undefined
				let accel_setter: ((detailed_action_name: string, accels: string[])=> void) | undefined

				if (this instanceof Gtk.ApplicationWindow) {
					action_addable = this
				} else if (this instanceof Gtk.Application) {
					action_addable = this
					accel_setter = this.set_accels_for_action.bind(this)
				} else if (this instanceof Gtk.Widget) {
					const group: Gio.SimpleActionGroup = (
						(this as any)[ACTION_GROUP_SYMBOL] ??= new Gio.SimpleActionGroup()
					)
					action_addable = group
					this.insert_action_group(target.name, group)
				}

				if (action_addable !== undefined) {
					for (const [name, value] of actions.entries()) {
						const action = new Gio.SimpleAction({ name, ...value.args })
						action_addable.add_action(action)
						accel_setter?.(`app.${name}`, value.accels)
						this[name] = action
					}
				}
			}

			const ready = target.prototype._ready
			if (typeof ready === "function") {
				GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
					const on_error = (e: unknown): void => {
						print(`Error in $ready function for ${target.name}`)
						print(e)
					}
					try {
						const return_val = ready.call(this)
						if (return_val instanceof Promise) return_val.catch(on_error)
					} catch (e) {
						on_error(e)
					}
					return GLib.SOURCE_REMOVE
				})
			}

			return original_return_val
		}

		GObject.registerClass({
			GTypeName: options?.manual_gtype_name || target.name,
			Implements: implement,
			Properties: properties,
			InternalChildren: children.map((name) => name.replace("_", "")),
			Signals: signals_map.get(target) ?? {},
			...(options?.css_name && { CssName: options.css_name }),
			...(options?.gtype_flags && { GTypeFlags: options.gtype_flags }),
			...(options?.template && { Template: options.template }),
		}, target)
		signals_map.delete(target)
	}
}

/**
 * Class decorator that declares a GObject signal for a GClass decorated class.
 *
 * Use this decorator to declare one or more signals on a GObject class before decorating it with `GClass`.
 * The signals are registered when the class is processed by `GClass`.
 *
 * @param name The name of the signal to declare.
 * @param props Optional metadata for the signal, including flags, parameter types, return type, and accumulator.
 *
 * @example
 * ```ts
 * @GClass()
 * @Signal("clicked")
 * @Signal("toggled", { flags: GObject.SignalFlags.RUN_FIRST })
 * class BoxButton extends Gtk.Box {}
 * // Instances from BoxButton now have "clicked" and "toggled" as available signals to connect to and/or emit
 * ```
 *
 * @remarks
 * The decorator does not modify class methods. It only adds signal metadata.
 * Signals are only registered once the class is wrapped with `GClass`.
 */
function Signal<T extends GObject.Object>(name: string, props?: Signal) {
	return (target: GClassFor<T>, _context: ClassDecoratorContext): void => {
		let signals = signals_map.get(target)
		if (!signals) {
			signals = {}
			signals_map.set(target, signals)
		}
		signals[name] = props ?? {}
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
function Debounce<T extends GObject.Object, U extends (this: T, ...args: any[])=> void>(
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
				;(this as any)[should_call_trailing_symbol] = true
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
						;(this as any)[should_call_trailing_symbol] = false
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
 * class MyWidget extends Gtk.Box {
 *     private __count = 0
 *
 *     get a_count(): number {
 *         return this.__count
 *     }
 *
 *     @Notify
 *     set a_count(val: number) {
 *         print(`Setting a_count to ${val}`)
 *         this.__count = val
 *     }
 * }
 *
 * const widget = new MyWidget();
 * widget.counter = 42; // Automatically calls widget.notify("a-count")
 */
function Notify<T extends GObject.Object, U>(
	target: (this: T, arg0: U)=> void,
	context: ClassSetterDecoratorContext<T>,
): (this: T, arg0: U)=> void {
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
 * // handle_Click is automatically called when "clicked" is emitted
 */
function OnSignal(signal_name: string) {
	return <T extends GObject.Object>(
		target: (this: T, ...args: any[])=> void,
		context: ClassMethodDecoratorContext<T>,
	): void => {
		context.addInitializer(function (this: T): void {
			this.connect(signal_name, target.bind(this))
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
function OnSimpleAction<
	T extends GObject.Object,
	K extends {
		[Key in keyof T]: Key extends "with_implements"
			? never
			: T[Key] extends Gio.SimpleAction
				? Key
				: never
	}[keyof T],
	U extends (
		| ((this: T)=> any)
		| ((this: T, action: Gio.SimpleAction)=> any)
		| ((this: T, action: Gio.SimpleAction, value: GLib.Variant)=> any)
	),
>(action_name: K) {
	return function (target: U, context: ClassMethodDecoratorContext<T>): void {
		context.addInitializer(function (this: T): void {
			(this[action_name] as Gio.SimpleAction).connect("activate", target.bind(this))
		})
	}
}

/**
 * Schedules a callback to run on the next GLib idle iteration.
 *
 * This function returns a promise that resolves when the GLib main loop reaches the next idle cycle.
 *
 * @returns A promise that resolves on the next GLib idle iteration.
 *
 * @example
 * await next_idle()
 * print("Runs at the next idle cycle!")
 */
async function next_idle(): Promise<void> {
	return new Promise((resolve, _reject) => GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
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
 * await timeout_ms(500)
 * print("Runs after 500 milliseconds!")
 */
async function timeout_ms(duration: number): Promise<void> {
	return new Promise((resolve, _reject) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, duration, () => {
		resolve()
		return GLib.SOURCE_REMOVE
	}))
}

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
 * @template Args Specify an array of types that the resolve_signal should emit instances of
 * @param obj The GObject instance to connect to.
 * @param resolve_signal The signal name whose emission will resolve the promise.
 * @param reject_signal Optional signal name whose emission will reject the promise.
 * @returns A promise that resolves with the arguments emitted by `resolve_signal`.
 *
 * @example
 * // Wait for a Gtk.Button to be clicked once
 * const button = new Gtk.Button({ label: "Click me" })
 * await connect_async(button, "clicked")
 * print("Button clicked!")
 *
 * @example
 * // Handle a signal that could fail
 * try {
 *   const [result] = await connect_async<[string]>(obj, "success-signal", "error-signal");
 *   print(`Success: ${result}`);
 * } catch (err) {
 *   print(`Error signal triggered: ${err.message}`);
 * }
 */
async function connect_async<Args extends unknown[] = []>(
	obj: GObject.Object,
	resolve_signal: string,
	reject_signal?: string,
): Promise<Args> {
	return new Promise((resolve, reject) => {
		let resolve_id: number | null = null
		let reject_id: number | null = null
		const cleanup = (): void => {
			if (resolve_id !== null) obj.disconnect(resolve_id)
			if (reject_id !== null) obj.disconnect(reject_id)
		}

		resolve_id = obj.connect(resolve_signal, (_obj, ...args: Args) => {
			cleanup()
			resolve(args)
		})

		if (!reject_signal) return
		reject_id = obj.connect(reject_signal, (_obj, ...args: any) => {
			cleanup()
			reject(new Error(`Rejection signal: '${reject_signal}' triggered with args: ${args}`))
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

export {
	from,
	next_idle,
	timeout_ms,
	connect_async,
	dedent,
	ConstMap,
	GClass,
	Signal,
	Debounce,
	Notify,
	OnSignal,
	OnSimpleAction,
	Property,
	Child,
	SimpleAction,
}
