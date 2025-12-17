# GObjectify
A type-safe, declarative TypeScript library for writing & interacting with GObject classes in GNOME JavaScript (GJS).

GObjectify is a TypeScript library for GJS designed to dramatically improve the developer experience when working with GObject.

It provides:
- **Strong type safety**: GObject properties, template children, signals, actions, and interfaces are all fully typed
- **Declarative class definitions**: Decorators and mixins allow GObject subclassing without manual class registration
- **Main-loop helpers**: `timeout`, `next_idle`, and `connect_async` integrate cleanly with GLib
- **Quality-of-life utilities**: `dedent`, `ConstMap`, and others reduce common GJS friction
- **Zero-boilerplate subclassing**: Define properties, actions, and template children in one place, GObjectify handles the rest

Whether you're making GTK widgets, GObject data classes, or complex, data-driven user interfaces, GObjectify makes the process safer, cleaner, and *much more enjoyable*!

# Why GObjectify?

Writing GObject subclasses in plain GJS, or plain GJS with TS, is very verbose and error-prone:
- Property specs must be manually defined (and numerical props do not respect min/max values)
- Simple actions require complex and explicit setup
- Template children need correct naming and TS-aware syntax
- Boilerplate `registerClass` code grows quickly, and pollutes simple class files
- Signals must be defined as object literals with deeply nested structures
- Constructors are entirely untyped despite their very complex and strict behavior in GObject
- Constant and Construct-Only flagged properties aren't enforced as readonly in TS

GObjectify fixes all of this! With a single declarative descriptor, you define properties, template children, simple actions, and implemented interfaces, all automatically typed and wired into the GObject system.

GObjectify acts as a thin, typesafe layer over GObject, not a framework, so everything remains 100% compatible with GJS, GTK, and GNOME platform APIs.

Here is an example:
```ts
@GClass()
@Signal("some-signal")
export class MyWidget extends from(Gtk.Box, {
  _button: Child<Gtk.Button>(),
  title: Property.string({ default: "Hello" }),
  click: SimpleAction(),
}) {
  _ready(): void {
    print(`MyWidget with title '${this.title}' is fully constructed and ready!`)
  }

  @OnSimpleAction("click")
  on_click(): void {
    print(`Clicked: ${this.title}`)
    this.emit("some-signal")
  }

  @OnSignal("notify::title")
  on_title_changed(): void {
    print(`My title was changed to: ${this.title}`)
  }
}
```
and that's it! No `registerClass`, no `ParamSpec`, no custom action groups. All of it is automatically handled for you! And the best part, all of this is type-safe, which means you can't accidentally set up something incorrectly, or assign the wrong kind of value.

# Branches

GObjectify maintains one branch per supported GNOME SDK version, make sure to clone the correct one for your project!:
- `sdk-v49`: GNOME 49 runtime
- `main`: development for the next runtime version (⚠️ UNSTABLE)

When using GObjectify as a submodule, it is ***strongly recommended*** to track the branch matching your Flatpak runtime version

# Installation

GNOME JS is *NOT* a browser or Node environment, which means you cannot install libraries from NPM or import packages the same way you would for web or Node. Because of this, GObjectify must be installed by adding it as a submodule for your project.

## Dependencies

The only dependency of GObjectify is TS types for GObject introspection. You can generate your own with `ts-for-gir`, but we recommend using [Flattool's already generated types](https://github.com/flattool/gir-ts-types). They are pre-generated, versioned, and match the GNOME SDK runtimes used on Flathub.

## 1. Install as a Git Submodule

```
cd your-project/src
git submodule add -b sdk-v49 https://github.com/flattool/gobjectify.git gobjectify
# You can replace 'sdk-v49' for any other branch choice!
```

Then update it at any time with:

```sh
cd gobjectify
git fetch
git merge origin/sdk-v49
```

Or just update *all* of your project's submodules via:

```sh
git submodule update --remote --merge
```

You can place the submodule repo anywhere you'd like, but it is ***strongly recommended*** to put it inside of your project's source directory:

```sh
your-project/
  src/
    your_code.ts
    gobjectify/   # submodule repo
      (cloned repo contents)
  tsconfig.json
```

This keeps import paths short, and keeps GObjectify next to your application code.

## 2. Make sure TypeScript 5.0 decorators are being used

GObjectify uses the standardized ECMAScript decorator model introduced in TypeScript 5.0.

In your `tsconfig.json`, make sure `"experimentalDecorators"` is set to `false`. (False is the default, so if you don't see this option in the file, you're good).

# Quick Start

## 1. Define a base class with `from()`

The `from()` function creates a typed abstract class describing your GObject members.\
Note: do *NOT* try to instantiate from this class, you *MUST* subclass it!

```ts
import { from, Property, Child, SimpleAction } from "./gobjectify/gobjectify.js"

const Base = from(Gtk.Box, {
  _button: Child<Gtk.Button>(),
  title: Property.string({ default: "My Widget" }),
  activate: SimpleAction(),
})
```

This metadata defines the structure for your subclass.

## 2. Create your subclass with `@GClass`

The GClass decorator is the other half of the magic; It tells GObject to register the class, and you can add a template UI resource, css_name, custom GType name instead of using the class name, and any GType flags you'd like.

```ts
// This code is continued in the same file from Step 1
import { GClass, OnSimpleAction } from "./gobjectify.gobjectify.js"

@GClass({
  template: "resource:///org/example/ui/my_widget.ui",
  css_name: "my-widget",
})
export class MyWidget extends Base {
  @OnSimpleAction("activate")
  #do_activate(): void {
    print(`Widget with title '${this.title}' activated!`)
  }

  _ready(): void {
    // now the activate function can be triggered with the button or with the action
    this._button.connect("clicked", () => this.#do_activate())
  }
}
```

GObjectify automatically:
- Registers the GObject properties
- Binds template children
- Installs SimpleActions
- Connects `@OnSimpleAction` handlers
- Applies the custom CSS name
- Runs the `_ready()` function an idle frame after construction

# An Example: Gtk Application Window with a counter

```ts
@GClass({ template: "resource:///org/example/ui/my_widget.ui" })
export class MainWindow extends from(Gtk.ApplicationWindow, {
  count: Property.uint32(),
  _increment_btn: Child<Gtk.Button>(),
  _decrement_btn: Child<Gtk.Button>(),
  _count_lbl: Child<Gtk.Label>(),
}) {
  _ready(): void {
    this.#on_count_change()
    this._increment_btn.connect("clicked", () => this.count++)
    this._decrement_btn.connect("clicked", () => this.count--)
  }

  @OnSignal("notify::count")
  #on_count_change(): void {
    this._count_lbl.label = `Count at: ${this.count}`
  }
}
```

Here, GObjectify registeres the class with a UI template, binds the internal widgets, creats the GObject properties, binds the `on_count_change` function to the notify signal for `count`, and will run the `_ready()` function (which handles our button click connections).

Tip: Using UI bound properties can reduce this code even more! (Not demonstrated here, as UI files are out of GObjectify's scope)

# Advanced Features

GObjectify also includes a number of small but powerful tools to make your life easier:

- **Debounced methods**: `@Debounce(ms)` to limit how often a method runs, perfect for rapid events
- **Automatic notifications**: `@Notify` on setters triggers GObject property notifications automatically
- **Async signal handling**: `connect_async` to `await` signals like promises, avoiding messy callbacks
