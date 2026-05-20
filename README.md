# GObjectify
A type-safe, declarative TypeScript library for writing & interacting with GObject classes in GNOME JavaScript (GJS).

GObjectify is a TypeScript library for GJS designed to dramatically improve the developer experience when working with GObject.

It provides:
- **Strong type safety**: GObject properties, template children, signals, actions, and interfaces are all fully typed
- **Declarative class definitions**: Decorators and mixins allow GObject subclassing without manual class registration
- **Main-loop helpers**: `timeout_ms`, `next_idle`, and typed signal awaiting integrate cleanly GLib
- **Quality-of-life utilities**: `dedent`, `ConstMap`, and others reduce common GJS friction
- **Zero-boilerplate subclassing**: Define properties, actions, and template children in one place, GObjectify handles the rest

Whether you're making GTK widgets, GObject data classes, or complex, data-driven user interfaces, GObjectify makes the process safer, cleaner, and *much more enjoyable*!

# Why GObjectify?

Writing GObject subclasses in plain GJS with TypeScript is verbose and error-prone:
- Property specs must be manually defined, and numerical props do not clamp to min/max values
- Simple Actions require explicit action group setup and repetitive, manual wiring
- Template children need correct naming conventions and manual type annotations, which aren't enforced at compile time
- `registerClass` boilerplate grows quickly and pollutes otherwise simple class files
- Signals are defined as untyped object literals, and their arguments and callbacks are all `any`
- Constructor overrides offer no help enforcing the strict object arguments and behavior that GObject requires

GObjectify acts as a thing, type-safe later over GObject, and is not a framework. Everything remains 100% compatible with GJS, GTK, and GNOME platform APIs.

Here is an example:

```ts
@GClass({ template: "resource:///org/example/my_widget.ui" })
export class MyWidget extends from(Gtk.Box, {
	title: Property.string(),
	edited: Signal([String]),
	refresh: SimpleAction(),
	_button: Child<Gtk.Button>(),
}) {
	constructor(params?: typeof MyWidget.$params) {
		super(params)
		print(`MyWidget with title '${this.title}' is fully constructed!`)
	}

	@OnSignal("edited")
	#on_edited(contents: string): void {
		print("Edited to:", contents)
	}

	@OnSimpleAction("refresh")
	#refresh(): void {
		print("Refreshing...")
	}
}
```

No `registerClass`, no `ParamSpec`, no action group setup, no untyped signal strings! Al of its automatically handled, and all of it is type-safe.

# Installation

GNOME JS is *NOT* a browser or Node environment, and as such, libraries cannot be installed from NPM or imported the same way as web/Node projects. Because of this, GObjectify is distributed as a pair of compiled files should live in your project's source directory.

## Dependencies

The only dependency of GObjectify is TypeScript types for GObject introspection. You can generate your own with `ts-for-gir`, but we recommend using [Flattool's pre-generated types](https://github.com/flattool/gir-ts-types), which are versioned and match the GNOME SDK runtimes used on Flathub.

## 1. Download GObjectify

Grab `gobjectify.js` and `gobjectify.d.ts` from the [latest release](https://github.com/flattool/gobjectify/releases/latest) and place them in your project's source directory:

```
project-root/
	src/
		your_code.ts
		gobjectify/   # create this folder if you'd like
			gobjectify.d.ts
			gobjectify.js
	tsconfig.json
```

## 2. Ensure TypeScript 5.0 Decorators are used

GObjectify uses the standardized ECMAScript decorator model introduced in TypeScript 5.0. In your `tsconfig.json`, make sure `"experimentalDecorators"` is either absent or set to `false`.

And that's it! You now have GObjectify, and can continue on to making use of it.

## Quick Start

The following code is an example of a widget subclass that displays a count, with numbers to increase or decrease the count. The [wiki](https://github.com/flattool/gobjectify/wiki) contains more documentation and guides.

```ts
import Gtk from "gi://Gtk?version=4.0"
import { from, GClass, Property, Child, WatchProp } from "./gobjectify/gobjectify.js" // or wherever you put the library

@GClass({ template: "resource:///org/example/counter.ui" })
export class Counter extends from(Gtk.Box, {
	count: Property.uint32(),
	_info_label: Child<Gtk.Label>(),
	_increment: Child<Gtk.Button>(),
	_decrement: Child<Gtk.Button>(),
}) {
	constructor(params?: typeof Counter.$params) {
		super(params)
		this._increment.$connect("clicked", () => this.count += 1)
		this._decrement.$connect("clicked", () => this.count -= 1)
	}

	@WatchProp("count")
	#on_count_changed(): void {
		this._info_label.label = `Clicked ${this.count} times`
	}
}
```

*For information on everything in this snippet (and more!), see the [wiki](https://github.com/flattool/gobjectify/wiki).*

# Build from Source

Ensure you have [NPM](https://www.npmjs.com/) installed, as GObjectify uses [Rollup](https://www.npmjs.com/package/rollup) to compile into a single `.js` and `.d.ts` file.

```sh
# Clone the repo
git clone https://github.com/flattool/gobjectify
cd gobjectify

# Initialize the types submodule
git submodule update --init --recursive

# Install dependencies
npm install

# Build
npm run build
# => Output: 'dist/gobjectify.js' and 'dist/gobjectify.d.ts'
```
