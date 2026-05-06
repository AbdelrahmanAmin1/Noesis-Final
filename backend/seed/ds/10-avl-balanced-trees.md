# Balanced Binary Search Trees

A binary search tree stores keys so every node's left subtree contains smaller keys and every node's right subtree contains larger keys. A plain binary search tree can degrade to a linked list if values are inserted in sorted order, making search, insertion, and deletion O(n).

## Balance

Balanced binary search trees keep their height close to O(log n). When height is logarithmic, search, insertion, and deletion stay efficient because each comparison removes a large part of the remaining tree.

## AVL Trees

An AVL tree is a self-balancing binary search tree. For every node, the heights of the left and right subtrees differ by at most one. The balance factor is usually defined as height(left) minus height(right), and valid AVL balance factors are -1, 0, and 1.

## Rotations

Rotations restore balance while preserving the binary search tree ordering invariant. A right rotation fixes a left-left imbalance. A left rotation fixes a right-right imbalance. Left-right and right-left imbalances require a double rotation.

## Complexity

AVL search, insertion, and deletion are O(log n) because the tree height remains logarithmic. Insertions and deletions may perform rotations, but each rotation is O(1).

## Trade-Offs

AVL trees are stricter about balance than many other balanced trees, so lookup is fast and predictable. The trade-off is that updates can require more rebalancing work. They are useful when reads are frequent and ordered traversal is needed.

