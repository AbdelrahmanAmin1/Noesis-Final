# Tries (Prefix Trees)

A trie is a tree-like data structure that stores strings by sharing common prefixes. Each node represents a character, and the path from the root to a node spells out a prefix. Tries are efficient for problems involving prefix matching, autocomplete, and dictionary lookups.

## Structure

The root is an empty node. Each edge from a node represents one character. A boolean flag or special marker at a node indicates whether the path from the root to that node forms a complete word. For an alphabet of size A, each node can have up to A children.

## Insertion

To insert a word, start at the root and follow or create edges for each character. After processing the last character, mark the node as a word endpoint. Insertion runs in O(L) time where L is the length of the word.

## Search

To search for a word, follow edges character by character from the root. If any character edge is missing, the word is not in the trie. If all characters are found and the final node is marked as a word endpoint, the word exists. Search is O(L).

## Prefix Search

To check if any word starts with a given prefix, follow edges for each prefix character. If all prefix characters are found, at least one word with that prefix exists. This is the key advantage of tries over hash tables: prefix queries are natural and fast.

## Deletion

To delete a word, first verify it exists. Unmark the endpoint flag. If the node has no other children and is not part of another word, remove it and recurse upward. Deletion is O(L).

## Space Complexity

A naive trie with A children per node uses O(N * A) space where N is the total number of characters stored. Compressed tries (Patricia tries or radix trees) merge chains of single-child nodes into one edge, reducing space.

## Complexity Summary

Insert: O(L). Search: O(L). Prefix search: O(L). Delete: O(L). Space: O(N * A) for naive, better for compressed. L is word length, N is total characters, A is alphabet size.

## Common Mistakes

Forgetting to mark word endpoints, causing search to report words that are only prefixes. Confusing trie depth with the number of words — depth equals the longest word, not the word count. Using a trie when a hash set would be simpler and sufficient (tries pay off mainly when prefix operations are needed).

## Applications

Autocomplete systems, spell checkers, IP routing tables (longest prefix match), phone directories, and solving word games like Boggle efficiently.
