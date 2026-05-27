# Linked List Demo Material

A linked list is a data structure made of nodes. Each node stores data and a reference to the next node.

## Mental Model

```text
HEAD -> [data | next] -> [data | next] -> [data | null]
```

The `head` reference points to the first node. The final node points to `null`.

## Java-Style Node

```java
class Node {
  int data;
  Node next;

  Node(int data) {
    this.data = data;
  }
}
```

## Traversal

To visit each node, start at `head`, read the current node, then move to `current.next` until the current reference becomes `null`.

## Insertion At The Front

```java
Node newNode = new Node(10);
newNode.next = head;
head = newNode;
```

## Complexity

- Access by index: O(n)
- Search: O(n)
- Insert at head: O(1)
- Delete after finding a node: O(1)

## Common Mistake

When inserting or deleting, changing `next` in the wrong order can lose the rest of the list.

## Checkpoint

Why does linked list search take O(n) time?
