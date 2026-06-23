import Gtk from "gi://Gtk?version=4.0"

import { from, SimpleAction, Property } from "./gobjectify"

export class Test extends from(Gtk.Box, {
	title: Property.readwrite.string(),
	act_title: SimpleAction.property("title"),
}) {
	fn(): void {
		this.act_title.activate("two")
	}
}
