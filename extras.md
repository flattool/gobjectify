## Utilities and Decorators
Along with the core improvements GObjectify adds to GNOME JS, GObjectify also provides a set of extra quality-of-life utilities as well.

## TODO:
ConstMap \
Debounce \
Notify \
WatchProp \
OnSignal \
OnSimpleAction \
PostInit

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

```
@Debounce(200)