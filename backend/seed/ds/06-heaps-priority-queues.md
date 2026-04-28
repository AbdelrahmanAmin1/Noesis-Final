# Heaps and Priority Queues

A *heap* is a tree-shaped data structure that maintains a partial order: in a *min-heap*, every parent's key is ≤ its children's keys (so the smallest key is always at the root); in a *max-heap* it's the reverse. Heaps are the standard implementation behind a *priority queue*: a queue in which the next element returned is the one with the smallest (or largest) key, regardless of insertion order.

## Binary heap

The most common heap is the *binary* heap, stored implicitly in an array — no per-node pointers, no allocations. For a node at index `i`:

- left child = `2i + 1`
- right child = `2i + 2`
- parent = `(i - 1) / 2`

The shape is always a complete binary tree (filled level by level), which lets us use this index arithmetic.

## Operations

| Operation | Cost |
|-----------|------|
| `peek()` (read min/max) | O(1) |
| `offer(x)` (insert) | O(log n) |
| `poll()` (remove min/max) | O(log n) |
| `heapify(array)` (build from n elements) | **O(n)** — not O(n log n) |
| `decreaseKey(node, newKey)` | O(log n) — needs node handles |

### Insert (sift-up)

Append at the end of the array, then "sift up": while the new element is smaller than its parent, swap them.

```java
void siftUp(int[] a, int i) {
    while (i > 0) {
        int p = (i - 1) / 2;
        if (a[i] >= a[p]) break;
        int t = a[i]; a[i] = a[p]; a[p] = t;
        i = p;
    }
}
```

### Remove min (sift-down)

Save the root (the answer), move the last element to position 0, decrement the size, then "sift down": swap with the smaller child until the heap property is restored.

```java
int poll(int[] a, int n) {
    int min = a[0];
    a[0] = a[n - 1];
    n--;
    siftDown(a, 0, n);
    return min;
}

void siftDown(int[] a, int i, int n) {
    while (true) {
        int l = 2*i + 1, r = 2*i + 2, smallest = i;
        if (l < n && a[l] < a[smallest]) smallest = l;
        if (r < n && a[r] < a[smallest]) smallest = r;
        if (smallest == i) return;
        int t = a[i]; a[i] = a[smallest]; a[smallest] = t;
        i = smallest;
    }
}
```

### Heapify in O(n)

Building a heap from an arbitrary array can be done bottom-up in O(n) (not O(n log n)):

```java
for (int i = n/2 - 1; i >= 0; i--) siftDown(a, i, n);
```

The proof relies on noticing that most nodes have small subtrees, so the work geometrically decreases.

## Priority queue

A priority queue is a heap with a friendly API:

```java
PriorityQueue<Integer> pq = new PriorityQueue<>();   // min-heap
pq.offer(5); pq.offer(1); pq.offer(3);
pq.poll();   // 1
```

Use a comparator for max-heaps or for non-comparable types:

```java
PriorityQueue<Task> pq = new PriorityQueue<>(Comparator.comparingInt(Task::deadline));
```

## Where heaps appear

- **Dijkstra's shortest path** — the open set is a min-PQ keyed on tentative distance.
- **A\*** — same shape, key is `g + h`.
- **Top-k** — keep a min-heap of size k; if a new value beats the smallest, replace.
- **Heapsort** — heapify in O(n), then poll n times → O(n log n) sort, in-place. Worst case is the same as merge sort but cache-unfriendly.
- **Event-driven simulation** — events keyed by time.
- **Scheduling** — jobs keyed by priority or deadline.

## Top-k pattern (the trick)

You have a stream of n values; you want the k largest. Naive sort is O(n log n). Heap solution: maintain a min-heap of size k; for each new value, if it exceeds the heap min, `poll` and `offer`. Total cost: O(n log k), and only O(k) memory. This generalizes to "top-k by score" whenever the score is comparable.

```java
PriorityQueue<Integer> pq = new PriorityQueue<>();
for (int x : stream) {
    if (pq.size() < k) pq.offer(x);
    else if (x > pq.peek()) { pq.poll(); pq.offer(x); }
}
// pq now holds the top-k.
```

## Pitfalls

- **Removing arbitrary elements.** Standard binary heaps don't support O(log n) `remove(x)` — they don't index by value. If you need that, keep a secondary `HashMap<key, index>` or use an indexed binary heap. Java's `PriorityQueue.remove(o)` is O(n).
- **Comparator inconsistency.** A bug in the comparator (returning 0 when not equal, or being non-transitive) corrupts the heap silently.
- **Mutable priority.** If you mutate the field that drives priority *while the element is in the heap*, the heap invariant is broken. Either remove-and-reinsert or use a structure that supports `decreaseKey`.
- **min vs max.** Java's `PriorityQueue` is a min-heap by default. To get a max-heap, use `Comparator.reverseOrder()`.

## Heuristics

- "Always need the smallest" → min-heap.
- "Always need the largest" → max-heap.
- "Need to remove arbitrary keys quickly" → balanced BST or indexed heap.
- "Need both keyed and ordered access" → `TreeMap` (BST) instead.
