# Trees and Binary Search Trees

A *tree* is a hierarchical structure in which each node has a value and zero or more children, and there is exactly one path from the root to any node. Trees show up everywhere: filesystem hierarchies, parsed expressions, decision trees, indexes (B-trees in databases).

A *binary tree* is a tree where each node has at most two children, conventionally called `left` and `right`.

## Binary Search Tree (BST)

A BST adds an *ordering invariant*: for every node `v`,

- all keys in `v.left` are less than `v.key`,
- all keys in `v.right` are greater than `v.key`.

Lookup, insert, and delete then mirror binary search: at each node, compare the target to the current key and step left or right.

```java
class Node { int key; Node left, right; }

Node find(Node root, int target) {
    if (root == null || root.key == target) return root;
    return target < root.key ? find(root.left, target) : find(root.right, target);
}
```

## Costs

| Operation | Balanced BST | Unbalanced BST (worst) |
|-----------|--------------|------------------------|
| Lookup | O(log n) | O(n) |
| Insert | O(log n) | O(n) |
| Delete | O(log n) | O(n) |
| In-order traversal | O(n) | O(n) |

The "unbalanced worst case" is the catch. Insert sorted keys into a plain BST and you get a degenerate linked list of height `n`. That is why production BSTs are *self-balancing*.

## Self-balancing BSTs

- **Red-Black trees.** Each node is colored red or black; recolor + rotate on insert/delete to maintain a height bound of 2·log₂(n+1). Java's `TreeMap` is a red-black tree.
- **AVL trees.** Stricter balance (heights of left/right subtrees differ by ≤ 1). Slightly faster lookups, slightly slower inserts.
- **Splay trees.** No explicit balance; recently accessed nodes get rotated to the root. Good amortized bounds, surprising read patterns.
- **B-trees / B+ trees.** Branching factor much higher than 2; designed for disk pages. Database indexes use these.

The detail of the rotation algebra is rarely needed in application code — you use `TreeMap` or `std::map` and trust the library — but understanding *why* the height is bounded matters.

## Traversals

- **In-order:** left, root, right. On a BST, this yields keys in sorted order.
- **Pre-order:** root, left, right. Used to clone trees and to serialize them.
- **Post-order:** left, right, root. Used to compute aggregations (e.g. directory size).
- **Level-order (BFS):** uses a queue, visits depth 0 then depth 1 etc.

```java
void inorder(Node n, List<Integer> out) {
    if (n == null) return;
    inorder(n.left, out);
    out.add(n.key);
    inorder(n.right, out);
}
```

The recursion uses O(h) stack space, where h is the height. For deep trees, prefer an iterative traversal with an explicit stack.

## When a BST shines

- Sorted iteration is a primary operation.
- Range queries (`floor(k)`, `ceiling(k)`, `keys in [lo, hi]`) are common.
- You need to maintain order under continuous insertion and deletion.

## When a hash table shines instead

- You only ever look up by exact key.
- You don't need sorted iteration.
- You can spare the memory.

## Tries

A trie (prefix tree) is a tree where each edge is labeled with a character. A path from root to node spells out a key. Lookup by key of length L is O(L), independent of how many keys are in the trie. Tries shine for autocomplete, dictionary spell-checks, and IP routing tables. Memory cost is the catch: each node may have up to 26 (or 256) children pointers.

## Heaps and segment trees (preview)

Heaps (next chapter) and segment trees are also tree-shaped but optimize different operations:
- Heap: O(1) min/max, O(log n) insert.
- Segment tree: O(log n) range-sum / range-min, O(log n) point updates.

The takeaway: *trees* is a structural family. The right tree depends on the operation mix you need.

## Pitfalls

- **Recursion depth.** A 10⁶-node tree may blow the stack. Use iterative traversals, or increase stack size.
- **Mutating during iteration.** Modifying a tree while you're walking it produces undefined order. Snapshot the keys first.
- **Equality-based search on a value field.** A BST is keyed; searching by a non-key field forces an O(n) scan. Maintain a secondary index instead.
- **Reinventing balanced BSTs.** Use the standard library's `TreeMap` / `std::map`. Hand-rolled red-black trees take weeks to debug.
