/**
 * A fully type-safe, and compile-time const Map. Using a regular Map under the hood, ConstMap ensures that values
 * "gotten" from the map are always valid, because only valid, known keys are allowed to be passed
 */
export class ConstMap<const Pairs extends [any, any][]> {
	readonly #map: ReadonlyMap<Pairs[number][0], Pairs[number][1]>

	public constructor(...pairs: Pairs) {
		this.#map = Object.freeze(new Map(pairs))
	}

	/**
     * Get a value from the map that corresponds to the key.
     *
     * This is similar to `Map.prototype.get`, but is fully typed as always returning a value, since it knows
     * what is and isn't allowed to be "gotten".
     *
     * @param key A key in the map. This value is typed as only ever allowing known values that are in the map.
     */
	public get<K extends Pairs[number][0]>(key: K): Extract<Pairs[number], [K, any]>[1] {
		return this.#map.get(key)!
	}

	/**
     * Get a value from the map that might corrosion to the key.
     *
     * This is similar to `Map.prototype.get`, but allows any type of key. The returned value is `undefined` if the
     * key is not present in the map.
     *
     * @param key
     */
	public looseGet(key: any): Extract<Pairs[number], [any, any]>[1] | undefined {
		return this.#map.get(key)
	}

	public asMap(): ReadonlyMap<Pairs[number][0], Pairs[number][1]> {
		return this.#map
	}

	public *[Symbol.iterator](): IterableIterator<Pairs[number]> {
		for (const pair of this.#map) yield pair
	}
}
