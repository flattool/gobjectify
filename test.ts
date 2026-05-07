import Gtk from "gi://Gtk?version=4.0"
import { GClass, OnSignal, Signal, from } from "./src/gobjectify"
import type GObject from "gi://GObject?version=2.0"

@GClass()
class Test extends from(Gtk.Box, {
    hi: Signal([Number])
}) {
    async fn(): Promise<void> {
        const [x] = await this.$connect_async("hi")
    }
}

const ttt = new Test({})
