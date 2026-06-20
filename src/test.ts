import Gtk from "gi://Gtk?version=4.0"

import { GClass, Action, from, OnSimpleAction } from "./gobjectify"

@GClass()
export class Test extends from(Gtk.Box, {
	stuff: Action.param.bool(),
}) {
}
