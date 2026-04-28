# Linked Lists

A linked list stores elements in *nodes* scattered through memory. Each node holds a value and a reference (pointer) to the next node — and, in a *doubly* linked list, also to the previous one. The list itself is just a reference to the head node.

```java
class Node<T> {
    T value;
    Node<T> next;
    Node(T v) { value = v; }
}

class LinkedList<T> {
    private Node<T> head;
    private int size = 0;

    public void prepend(T v) {
        Node<T> n = new Node<>(v);
        n.next = head;
        head = n;
        size++;
    }
}
```

## Costs

| Operation | Singly | Doubly |
|-----------|--------|--------|
| Insert at head | O(1) | O(1) |
| Insert at tail (with tail pointer) | O(1) | O(1) |
| Insert/remove given a node ref | O(n) traversal — but O(1) once at the node | O(1) |
| Find by value | O(n) | O(n) |
| Indexed access `list[i]` | O(n) | O(n) |

The headline: linked lists give O(1) structural edits but lose O(1) indexing. Arrays are the opposite. That tradeoff is the whole reason both data structures exist.

## Singly vs doubly linked

- **Singly:** one pointer per node; cannot walk backwards. To delete a node `x` you must know its predecessor (so you usually delete by *value* and accept the O(n) traversal, or you keep the previous pointer in a loop).
- **Doubly:** two pointers per node; cheaper edits at any known node, costs more memory and book-keeping. Java's `LinkedList` is doubly linked.

## When to use a linked list

Honest answer: rarely, in modern code. Empirical benchmarks show that `ArrayList`/`std::vector` beat `LinkedList`/`std::list` for almost all real workloads because of cache locality. The cases where linked lists genuinely win:

- You need O(1) splice (move a sub-list from one place to another).
- You hold node references directly and need O(1) insert/remove around them (intrusive lists in OS kernels, LRU caches with node-level access).
- You are implementing another data structure on top (queues, stacks, adjacency lists, graphs).

If you are tempted to choose a linked list because "inserts are O(1)", measure first; the constant factor and cache behavior often eat the asymptotic win.

## Pointer surgery — the classic insert

Inserting a new node `n` after a known node `p` in a singly linked list:

```java
n.next = p.next;
p.next = n;
```

Order matters. If you flip the lines, you orphan the rest of the list. This pattern is the bread-and-butter of any interview question on linked lists: state the invariant ("after this, p.next is n, and n.next is the old p.next") and write the two assignments that hold it.

## Sentinel / dummy head

A common trick: keep a dummy head node whose `next` is the real first element. Now insertion at "the head" is the same code as insertion anywhere else — no special-case for `head == null`. The cost is one wasted node; the benefit is half the bugs.

## Floyd's cycle detection ("tortoise and hare")

If a list has a cycle, walking a "slow" pointer one step and a "fast" pointer two steps per iteration will cause them to meet inside the cycle. O(n) time, O(1) extra space. Used in interview questions and in some GC algorithms.

```java
boolean hasCycle(Node head) {
    Node slow = head, fast = head;
    while (fast != null && fast.next != null) {
        slow = slow.next;
        fast = fast.next.next;
        if (slow == fast) return true;
    }
    return false;
}
```

## Reverse in place

```java
Node reverse(Node head) {
    Node prev = null, cur = head;
    while (cur != null) {
        Node next = cur.next;
        cur.next = prev;
        prev = cur;
        cur = next;
    }
    return prev;
}
```

The four-line pattern (save `next`, rewire `cur.next`, advance `prev`, advance `cur`) is worth memorizing.

## Pitfalls

- **Memory churn.** Every node is a separate allocation. For high-throughput pipelines the allocator becomes the bottleneck.
- **Cache misses.** `next` pointers usually land on random memory pages. A 100M-element traversal can be 5-10× slower than the equivalent array scan.
- **NullPointerException.** Always check `node != null` before dereferencing `.next`. A loop like `while (cur.next != null)` walks past the last node — preferred over `while (cur != null)` when you need to operate on adjacent pairs.
- **Lost references.** In garbage-collected languages, dropping the head pointer drops the whole list. Easy to do mid-refactor.
