import GObject from "gi://GObject?version=2.0"
import Gtk from "gi://Gtk?version=4.0"

import { GClass, Action, from } from "./gobjectify.js"

@GClass()
export class Thing extends from(Gtk.Box, {
	stuff: Action.state.string("hi"),
}) {
	fn(): void {
		this.$activate_action(Thing, "stuff", "")
	}
}
