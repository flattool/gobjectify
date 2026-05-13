import GObject from "gi://GObject?version=2.0"

import { from, Signal } from "./src/gobjectify"

class One {
	one = "one"
}

class Box extends from(GObject.Object, {
	clicked: Signal([]),
}) {
	ready(): void {
		this.$emit("clicked")
	}
}
