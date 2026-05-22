# Hash Tables

A hash table maps keys to values and provides expected O(1) lookup, insert, and delete. The trick: a *hash function* turns the key into an integer; the integer modulo table size picks a slot; the slot stores the value or a small list of values that landed there.

## The pieces

1. **Hash function `h(key)`.** Deterministic, well-distributed, fast. For strings, use a proven algorithm (`String.hashCode` plus `HashMap`'s extra mixing in Java; `MurmurHash`/`xxHash` for high-performance use).
2. **Table.** An array of `m` slots.
3. **Bucket index.** `i = h(key) mod m`.
4. **Collision strategy.** What to do when two keys land in the same slot.

## Collision strategies

### Separate chaining

Each slot holds a linked list or small array of `(key, value)` entries. Lookup walks the chain. Java's `HashMap` does this, and since Java 8, when a chain grows past 8 entries it converts to a balanced tree, capping the worst case at O(log n).

### Open addressing

The slot itself stores at most one entry. On collision, probe for another slot:

- **Linear probing:** try `i+1`, `i+2`, ... Excellent cache behavior; suffers from *clustering*, which creates long contiguous runs of occupied slots and degrades probe length.
- **Quadratic probing:** try `i+1^2`, `i+2^2`, ... Reduces clustering but can leave the table reachable from only some seeds, so sizing must be chosen carefully.
- **Double hashing:** step size is a second hash function. Best distribution; trickier to implement.

Open addressing is faster in tight loops because there are no per-entry allocations. Chaining is more forgiving when the hash function is mediocre.

## Load factor

Load factor `alpha = n / m` is the number of keys divided by the number of slots. It is the single most important number in a hash table.

- For chaining, expected chain length is about `alpha`; expected lookups walk `alpha/2` entries on a hit and `alpha` on a miss.
- For open addressing, expected probes for unsuccessful lookup are about `1 / (1 - alpha)`. At `alpha = 0.9` you probe about 10 times. At `alpha = 0.99` you probe about 100 times. This is why open-addressed tables resize aggressively.

When `alpha` exceeds a threshold the table *resizes*: allocate a bigger array, typically 2x, then rehash every existing key into the new table. Resizing is O(n), but it happens rarely enough to keep amortized insert at O(1). Java's `HashMap` resizes at `alpha = 0.75` by default: aggressive enough to keep lookups fast, lazy enough to avoid thrashing.

## O(1) is a polite lie

`get` and `put` are *expected* O(1), assuming the hash function distributes keys uniformly. The worst case is O(n) when every key hashes to the same slot. That is why:

- Java 8 added the chain-to-tree fallback, capping worst case at O(log n) per slot.
- Production hash maps use *seeded* hash functions to defend against adversarial inputs, a known denial-of-service vector when an attacker can choose keys such as URL parameters.

## Code: minimal chaining hash map

```java
class HashMap<K, V> {
    private static class Entry<K, V> { K key; V val; Entry<K,V> next; }

    private Entry<K, V>[] table;
    private int n = 0;

    public V get(K key) {
        int i = (key.hashCode() & 0x7fffffff) % table.length;
        for (Entry<K,V> e = table[i]; e != null; e = e.next)
            if (e.key.equals(key)) return e.val;
        return null;
    }

    public void put(K key, V val) {
        int i = (key.hashCode() & 0x7fffffff) % table.length;
        for (Entry<K,V> e = table[i]; e != null; e = e.next) {
            if (e.key.equals(key)) { e.val = val; return; }
        }
        Entry<K,V> e = new Entry<>(); e.key = key; e.val = val; e.next = table[i];
        table[i] = e;
        if (++n > 0.75 * table.length) resize();
    }
    // resize(): new table 2x size, walk every entry, re-hash, re-place.
}
```

## Hash function quality

A good hash function:

- Distributes uniformly over the integer range.
- Is fast, usually one or two arithmetic operations per byte.
- Avalanches: changing one bit in the input changes about half the bits in the output.

For your own classes, override `hashCode` whenever you override `equals`. The contract: equal objects must have equal hash codes. The reverse need not hold. Most IDEs generate this correctly from selected fields.

## When to use a hash table

- Lookup by key dominates the workload.
- You do not need keys in sorted order.
- You can spare the memory overhead. A hash map is roughly 2-3x a packed array because of slot headroom and entry overhead.

## When to avoid

- You need range queries, such as "all keys between A and Z" - use a balanced BST or skip list.
- Memory is extremely tight - use a sorted array plus binary search.
- You need O(1) worst-case lookup - use a perfect hash table built ahead of time on a known key set.

## Pitfalls

- **Mutable keys.** If a key's `hashCode` depends on a field that changes, you have lost the key. Do not put mutable objects in a hash map and then mutate the hashed fields.
- **Wrong `equals`/`hashCode` contract.** Equal-by-value but not-equal-by-hash means duplicate entries you can never `get`. Always generate both together.
- **Iteration order.** Hash maps usually iterate in undefined order. Use `LinkedHashMap` for insertion-order or `TreeMap` for sorted-order.
- **Concurrent modification.** Plain `HashMap` is not thread-safe. Use `ConcurrentHashMap` for concurrent access.
