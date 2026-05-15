## Utilities and Decorators
Along with the core improvements GObjectify adds to GNOME JS, GObjectify also provides a set of extra quality-of-life utilities as well.

---

## `dedent()`
```ts
function dedent(strings: TemplateStringsArray, ...values: any[]): string
```

Allows writing multi-line strings with indents that match source code. This results in pretty looking code *and* pretty looking text.

```ts
const text = dedent`
	Hello,
		this line is indented relative to the block.
	Goodbye!
`
// Becomes:
// "Hello
//     this line is indented relative to the block.
// Goodbye!"
```

Note that beginning and ending whitespace is entirely removed, meaning no leading or trailing newlines.

## `next_idle()`
```ts
function next_idle(): Promise<void>
```

Sometimes a section of code handles something that will take a while that might freeze the application or cause it to stutter. `next_idle` schedules a promise to be resolved when GLib's main loop is idle (not working on anything intense like window resizing or animations). This keeps your app responsive while heavy work is done.

```ts
function blocking(): void {
	// Calling this function will freeze the app
	for (let i = 0; i < 999999; i += 1) {
		print(i)
	}
}

async function non_blocking(): Promise<void> {
	// Calling this function will not freeze the app
	for (let i = 0; i < 999999; i += 1) {
		if (i % 10 === 0) {
			// On every tenth iteration, wait for idle time
			await next_idle()
		}
		print(i)
	}
}
```

Do note that using `next_idle` will make the function slower, but this is a compromise to avoid freezes and stutters.

## `timeout_ms()`
```ts
function timeout_ms(milliseconds: number): Promise<void>
```

Since GJS is *not* a browser or Node environment, the `setTimeout` methods is *not* available. To make up for this GObjectify provides a similar function.

The function returns a promise that is resolved after the amount of milliseconds provided. `GLib.timeout_add` is utilized with `GLib.PRIORITY_DEFAULT_IDLE` to allow for an asynchronous waiting period. The promise is resolved once the time has elapsed.

```ts
async function () {
	print("Begin!")
	await timeout_ms(500)
	print("It has been 500 milliseconds!")
}
```

## `ConstMap`
TODO

## `@Debounce()`
```ts
function Debounce(
	milliseconds: number,
	params: {
		trigger: "leading" | "trailing" | "leading+trailing"
	} = {
		trigger: "trailing",
	},
): MethodDecorator
```

Method decorator that will pause calls to its method if previous calls have been made within its `milliseconds` of wait-time.

```ts
@GClass()
class MyBox extends from(Gtk.Box, {}) {
	count = 0

	@Debounce(200)
	some_method(): void {
		this.count += 1
		print(`Called ${count} time(s)`)
	}

	async main(): Promise<void> {
		this.some_method() // Called 1 time(s)
		this.some_method() // Called 1 time(s)
		await timeout_ms(200)
		this.some_method() // Called 2 time(s)
		this.some_method() // Called 2 time(s)
	}
}
```

## `@Notify()`
```ts
function Notify(): void
```

Setter accessor decorator that will emit the notify signal for computed property.

```ts
@GClass()
class MyBox extends from(Gtk.Box, {
	item_id: Property.string(),
}) {
	#item_id = ""
	override get item_id(): string {
		return this.#item_id
	}
	@Notify // automatically emits the "notify::item-id" signal
	override set item_id(v: string) {
		this.#item_id = v
	}
}
```

## `@WatchProp()`
```ts
function WatchProp(property_name: string): MethodDecorator
```

Method decorator that will run its method whenever the specified property changes.

The method will be called asynchronously on idle after class instantiation, and will be ran any time the property's value changes.

```ts
@GClass()
class MyBox extends from(Gtk.Box, {
	title: Property.string(),
}) {
	@WatchProp("title")
	#on_title_changed(): void {
		print(`My title is: ${this.title}`)
	}
}

const mb = new MyBox({ title: "File Size" }) // "My title is: File Size" prints on next idle
// Some time later
mb.title = "User Name"
```

Note: the property name is exactly as it appears in the `from` function. This means that underscores are permitted, and will be automatically converted to hyphens at runtime.

## `@OnSignal()`
```ts
function OnSignal(signal_name: string): MethodDecorator
```

Method decorator that will connect its method to the signal an instance of the class.

```ts
@GClass()
class MyBox extends from(Gtk.Button, {
	state_set: Signal(Number),
}) {
	@OnSignal("state-set") // Connect to a new signal
	#on_state_set(new_state: number): void {
		print(`State has been set to: ${new_state}`)
	}

	@OnSignal("clicked") // Connect to a built-in signal
	#on_clicked(): void {
		print("I have been clicked!")
	}
}
```

## `@OnSimpleAction`
TODO

## `@PostInit`
TODO
