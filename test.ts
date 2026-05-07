import Gtk from "gi://Gtk?version=4.0"
import { GClass, Signal, from } from "./src/gobjectify"
import type GObject from "gi://GObject?version=2.0"

class Test extends from(Gtk.Box, {
    hi: Signal([Number], { return_type: String })
}) {
    fn(): void {
        this.emit("hi", "")
        this.$signal("destroy").connect((__) => {})
    }
}

// const t = new Test({})
// t.$signal("hi").connect((__, num) => String(num))
