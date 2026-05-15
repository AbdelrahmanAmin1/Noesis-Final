# Recursion

Recursion is a technique where a function calls itself to solve a smaller instance of the same problem. Every recursive solution has two parts: a base case that stops the recursion, and a recursive case that reduces the problem and calls itself.

## Base Case

The base case is the simplest version of the problem that can be solved directly without further recursion. Without a base case, recursion continues indefinitely and causes a stack overflow. Example: for factorial, the base case is factorial(0) = 1.

## Recursive Case

The recursive case breaks the problem into one or more smaller subproblems and calls the function on each. The subproblems must move toward the base case. Example: factorial(n) = n * factorial(n - 1).

## The Call Stack

Each recursive call adds a new frame to the call stack containing local variables and the return address. When the base case returns, frames are popped in reverse order. Deep recursion can exhaust the stack, causing a stack overflow error.

## Recursion vs Iteration

Any recursive algorithm can be rewritten iteratively using an explicit stack or loop. Recursion often leads to cleaner, more intuitive code for tree traversals, divide-and-conquer, and backtracking. Iteration avoids call stack overhead and is preferred when the recursive depth could be very large.

## Divide and Conquer

Divide and conquer is a recursive strategy: divide the problem into independent subproblems, solve each recursively, and combine the results. Examples: merge sort divides the array in half, sorts each half, and merges. Quick sort partitions around a pivot, then sorts each partition.

## Backtracking

Backtracking explores all possible solutions by making a choice, recursing, and undoing the choice if it leads to a dead end. Examples: solving mazes, N-Queens, Sudoku, and generating permutations.

## Memoization

Memoization stores the results of previously computed subproblems to avoid redundant work. It transforms naive recursive solutions with overlapping subproblems from exponential to polynomial time. Example: naive recursive Fibonacci is O(2^n); memoized Fibonacci is O(n).

## Tail Recursion

A recursive call is tail recursive if it is the last operation in the function. Some compilers optimize tail recursion into a loop, eliminating stack growth. Not all languages guarantee tail call optimization.

## Common Mistakes

Missing or incorrect base case, leading to infinite recursion. Not reducing the problem toward the base case on every call. Solving overlapping subproblems without memoization, causing exponential time. Confusing recursion depth with the number of recursive calls.

## Complexity Analysis

Use recurrence relations to analyze recursive algorithms. For divide-and-conquer, the Master Theorem gives closed-form complexity: T(n) = aT(n/b) + O(n^d). Merge sort: T(n) = 2T(n/2) + O(n) = O(n log n). Binary search: T(n) = T(n/2) + O(1) = O(log n).
