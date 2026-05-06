# Sorting and Searching

Sorting arranges data into a defined order so later operations can be faster, easier to reason about, or easier to present. Searching locates a target item in a collection. The algorithm you choose depends on data size, whether the data is already sorted, mutation costs, memory limits, and stability requirements.

## Linear Search

Linear search scans each element until it finds the target or reaches the end. It works on unsorted data and needs no preprocessing. Its worst-case time complexity is O(n), and its space complexity is O(1).

## Binary Search

Binary search repeatedly halves the search range. It only works when the data is sorted and random access is efficient, such as with arrays. Its worst-case time complexity is O(log n), and its space complexity is O(1) for the iterative version.

## Insertion Sort

Insertion sort builds a sorted prefix by inserting each new item into its correct position. It is simple, stable, in-place, and efficient for very small or nearly sorted inputs. Its average and worst-case time complexity are O(n^2), but its best case is O(n) when the input is already sorted.

## Merge Sort

Merge sort divides the input into halves, recursively sorts each half, and merges the sorted halves. It is stable and has O(n log n) time complexity in the best, average, and worst cases. Standard merge sort uses O(n) extra space.

## Quick Sort

Quick sort partitions data around a pivot so smaller values move before the pivot and larger values move after it. Its average time complexity is O(n log n), but a poor pivot strategy can degrade to O(n^2). In-place quick sort is usually fast in practice because of low constant factors and good cache behavior.

## Heap Sort

Heap sort uses a heap to repeatedly remove the maximum or minimum element. It has O(n log n) time complexity and O(1) extra space when performed in-place. It is not stable by default.

## Choosing a Sorting Algorithm

Use insertion sort for tiny or nearly sorted inputs. Use merge sort when stability and predictable O(n log n) behavior matter. Use quick sort when average-case speed and in-place partitioning matter. Use heap sort when O(1) extra space and guaranteed O(n log n) time matter more than stability.

