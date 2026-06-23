import Gtk from "gi://Gtk?version=4.0"

import { from, SimpleAction, Property } from "./gobjectify.js"

export class Test extends from(Gtk.Box, {
	title: Property.readwrite.string(),
	act_title: SimpleAction.state.string(),
}) {
	fn(): void {
		this.act_title.activate("two")
	}
}
