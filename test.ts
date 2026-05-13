import Gtk from "gi://Gtk?version=4.0"

import { GClass, from, Signal, Narrow, Int32 } from "./src/gobjectify"

@GClass()
export class MyBox extends from(Gtk.Box, {
	clicked: Signal([Narrow(Int32)<0 | 1>()], { return_type: String }),
}) {
	ready(): void {
		this.$emit("clicked", 1)
	}
}
