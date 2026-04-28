# Stacks and Queues

## Stack — LIFO

A *stack* serves elements in last-in-first-out order. Two operations:

- `push(x)` — add `x` on top.
- `pop()` — remove and return the top.
- (often) `peek()` — read the top without removing.

Both `push` and `pop` are O(1). A stack can be implemented as an array (Java `ArrayDeque` is recommended over the legacy `Stack` class) or as a singly linked list with operations at the head.

### Where stacks show up

- **Function calls.** The "call stack" is literally a stack of activation records. Recursion blows up by exhausting it.
- **Expression evaluation.** Convert infix to postfix; evaluate postfix using a stack (push operands; on operator, pop two, compute, push result).
- **Parser/compiler bookkeeping.** Matching brackets, building syntax trees.
- **Backtracking.** Maze solvers, DFS, undo histories.

### Code

```java
Deque<Integer> stack = new ArrayDeque<>();
stack.push(10);
stack.push(20);
int top = stack.pop();   // 20
```

A non-trivial example — balanced brackets:

```java
boolean balanced(String s) {
    Deque<Character> st = new ArrayDeque<>();
    Map<Character,Character> match = Map.of(')', '(', ']', '[', '}', '{');
    for (char c : s.toCharArray()) {
        if ("([{".indexOf(c) >= 0) st.push(c);
        else if (match.containsKey(c)) {
            if (st.isEmpty() || st.pop() != match.get(c)) return false;
        }
    }
    return st.isEmpty();
}
```

## Queue — FIFO

A *queue* serves elements in first-in-first-out order. Two operations:

- `enqueue(x)` — add to the back.
- `dequeue()` — remove from the front.

Both O(1) when implemented properly. Java exposes the `Queue` interface; `ArrayDeque` and `LinkedList` are common implementations.

A naive array-backed queue ("shift everyone left on dequeue") is O(n) per dequeue — wrong. The right implementation uses a *circular buffer*: two indices `head` and `tail` that wrap around an array modulo capacity, doubling the buffer when full.

### Where queues show up

- **BFS** of a graph or tree — the next level always waits behind the current level.
- **Producer/consumer** pipelines.
- **Task schedulers** — print queues, job queues.
- **Streaming buffers.**

### Code

```java
Queue<Integer> q = new ArrayDeque<>();
q.offer(1);          // enqueue
q.offer(2);
int first = q.poll(); // dequeue → 1
```

`offer` returns false on bounded queues that are full; `add` throws. `poll` returns null on empty; `remove` throws. Pick by whether "empty/full" is exceptional or expected in your code.

## Deque — double-ended queue

A *deque* (pronounced "deck") allows insertion and removal at both ends in O(1). Operations: `addFirst`, `addLast`, `removeFirst`, `removeLast`. Java's `ArrayDeque` is the workhorse; it doubles as a stack (`push` = `addFirst`, `pop` = `removeFirst`) and a queue (`offer` = `addLast`, `poll` = `removeFirst`). Unless you need thread-safety, prefer `ArrayDeque` over the legacy `Stack` and `LinkedList`-as-queue.

## Priority queue

A *priority queue* serves the smallest (or largest) element next, regardless of insertion order. Standard implementation: a binary heap. Operations:

- `offer(x)` — O(log n)
- `poll()` — returns the min, O(log n)
- `peek()` — O(1)

See `06-heaps-priority-queues.md` for details. Use cases: Dijkstra's shortest-path, A*, top-k, scheduling by deadline.

## Bounded vs unbounded

A bounded queue rejects (or blocks) on `offer` when full. This is essential for backpressure: a fast producer flooding a slow consumer with an unbounded queue is the textbook out-of-memory bug. In Java, `ArrayBlockingQueue` is bounded; `LinkedBlockingQueue(int)` is bounded; the no-arg `LinkedBlockingQueue` is effectively unbounded — usually a mistake in production.

## Pitfalls

- **Stack vs Queue confusion.** Easy to mix `push/pop` with `enqueue/dequeue`. The behavior is opposite.
- **Iterating a queue while consuming.** Use `while ((x = q.poll()) != null)`, not a `for` loop over the iterator — the iterator does not consume.
- **Threading.** `ArrayDeque` is not thread-safe; for concurrent producer/consumer use `ConcurrentLinkedQueue` or a `BlockingQueue`.

## Heuristics

- "Most recent first" → stack.
- "First come first served" → queue.
- "Smallest next" → priority queue.
- "Both ends" → deque.
