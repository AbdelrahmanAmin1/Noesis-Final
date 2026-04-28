# Arrays and Complexity

## Arrays

An array is a fixed-size, contiguous block of memory holding elements of one type. Indexing is O(1) because the address of element `i` is `base + i × sizeof(T)` — pure arithmetic, no traversal.

The contiguous layout is also why arrays are fast in practice: modern CPUs prefetch nearby memory, and a sequential scan of an array fits the cache far better than a chase through pointers. This *cache locality* often makes a "slower" asymptotic algorithm on an array beat a "faster" one on a linked structure for small to medium `n`.

## Costs

| Operation | Time |
|-----------|------|
| Index access `a[i]` | O(1) |
| Update `a[i] = x` | O(1) |
| Linear search | O(n) |
| Insert at end (with capacity) | O(1) amortized |
| Insert/remove at position `i` | O(n) — must shift elements |
| Resize | O(n) — copy to a new buffer |

The "insert at end O(1) amortized" deserves a moment. A *dynamic array* (Java `ArrayList`, C++ `std::vector`, Python `list`) doubles its backing buffer when full. The doubling means individual inserts are sometimes O(n) (the resize), but averaged over many inserts, each one pays O(1). This is *amortized analysis* — the worst case per call hides the average case across calls.

## Big-O notation

Big-O describes the *upper bound* on the growth rate of an algorithm's running time as input size n grows, ignoring constant factors and lower-order terms. Common classes from fast to slow:

- O(1) — constant. Index a hash table.
- O(log n) — logarithmic. Binary search, balanced BST lookup.
- O(n) — linear. Scan an array.
- O(n log n) — linearithmic. Mergesort, quicksort average case.
- O(n²) — quadratic. Bubble/insertion sort, naive nested loops.
- O(2ⁿ) — exponential. Brute-force subset enumeration.
- O(n!) — factorial. Brute-force permutations (TSP).

Two practical reminders. First, *constants matter in the small*: an O(n²) loop with tiny constants (one comparison) often beats an O(n log n) routine with cache misses for n < ~1000. Second, *Big-O ignores I/O*: a database query is "O(1) on the index", but the network hop dominates everything.

## Big-Θ and Big-Ω

- Θ(f) — tight bound: the algorithm grows *like* f.
- Ω(f) — lower bound: the algorithm takes *at least* f.

Most CS classes use Big-O for upper bounds and Θ when they really mean "this is the actual growth rate". Ω shows up when we prove a lower bound (e.g. comparison-based sorting is Ω(n log n) — you cannot do better with comparisons alone).

## Amortized analysis — three lenses

1. **Aggregate.** Add up the cost of n operations and divide by n. Dynamic-array push: n pushes do at most 2n total work (geometric sum of the resizes), so amortized cost per push is O(1).
2. **Accounting.** Charge each operation a small "tax" that pre-pays for occasional expensive ones. Each push pays 3 coins: 1 for itself, 2 saved for the eventual rehash of itself and one earlier element.
3. **Potential.** Define a potential function Φ that increases when "trouble" accumulates and decreases when it's spent. Amortized cost = real cost + ΔΦ.

The three give the same answer; pick whichever matches the structure of the algorithm.

## When to choose an array

- Random access dominated by index, not by key.
- Size known up front, or growth fits the doubling pattern.
- Tight inner loops where cache locality matters.
- You need to pass to C/SIMD code that expects contiguous memory.

## When to avoid

- Frequent insertion/removal in the middle (use a linked list, deque, or balanced tree).
- Lookup by key (use a hash table or BST).
- The size is unbounded *and* you need O(1) push at both ends (use a deque).

## Code: dynamic array push, conceptually

```java
class DynArray {
    private int[] buf = new int[8];
    private int n = 0;

    public void push(int x) {
        if (n == buf.length) {
            int[] bigger = new int[n * 2];          // O(n) — but rare
            System.arraycopy(buf, 0, bigger, 0, n);
            buf = bigger;
        }
        buf[n++] = x;                               // O(1) typical
    }

    public int get(int i) { return buf[i]; }        // O(1)
}
```

## Common pitfalls

- **Off-by-one.** Always re-derive the loop bound from the invariant; don't guess.
- **Boxed arrays.** `Integer[]` in Java loses cache locality vs `int[]`. Use primitives in hot paths.
- **Premature growth.** Constructing an `ArrayList` with a known capacity (`new ArrayList<>(1024)`) skips early resizes.
- **Iterator invalidation.** Modifying a collection while iterating with the C++/Java iterator typically throws — or worse, silently corrupts.
