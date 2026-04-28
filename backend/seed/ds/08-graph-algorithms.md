# Graph Algorithms

This chapter covers the workhorse algorithms on graphs: shortest paths, minimum spanning trees, and a couple of common patterns (topological sort, max-flow at a high level).

## Dijkstra's shortest path

Single-source shortest paths on a graph with non-negative edge weights. Maintain a tentative distance for each vertex; repeatedly extract the closest unfinished vertex and relax its outgoing edges. With a binary heap as the priority queue, the cost is **O((V + E) log V)**.

```java
int[] dijkstra(int src, List<List<int[]>> adj, int V) {
    int[] dist = new int[V];
    Arrays.fill(dist, Integer.MAX_VALUE);
    dist[src] = 0;
    PriorityQueue<int[]> pq = new PriorityQueue<>(Comparator.comparingInt(a -> a[1]));
    pq.offer(new int[]{src, 0});
    while (!pq.isEmpty()) {
        int[] cur = pq.poll();
        int u = cur[0], d = cur[1];
        if (d > dist[u]) continue;            // stale entry
        for (int[] e : adj.get(u)) {
            int v = e[0], w = e[1];
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                pq.offer(new int[]{v, dist[v]});
            }
        }
    }
    return dist;
}
```

Note: we don't `decreaseKey` the heap entry; we just push a duplicate and skip the stale one when we pop. Simpler, costs an extra factor of log but stays cache-friendly.

**Failure case:** negative edge weights. Dijkstra can finalize a vertex too early, missing a later improvement through a negative edge. Use Bellman–Ford instead.

## Bellman–Ford

Single-source shortest paths allowing negative edge weights. Relax *every* edge `V − 1` times. **O(V·E)**. A final pass that still relaxes proves a *negative cycle* is reachable from the source.

```java
boolean bellmanFord(List<int[]> edges, int V, int src, int[] dist) {
    Arrays.fill(dist, Integer.MAX_VALUE);
    dist[src] = 0;
    for (int i = 0; i < V - 1; i++) {
        for (int[] e : edges) {                // e = {u, v, w}
            if (dist[e[0]] != Integer.MAX_VALUE && dist[e[0]] + e[2] < dist[e[1]])
                dist[e[1]] = dist[e[0]] + e[2];
        }
    }
    for (int[] e : edges)
        if (dist[e[0]] != Integer.MAX_VALUE && dist[e[0]] + e[2] < dist[e[1]])
            return false;                       // negative cycle
    return true;
}
```

## Floyd–Warshall

All-pairs shortest paths via dynamic programming. **O(V³)** time, **O(V²)** space. The triple loop:

```java
for (int k = 0; k < V; k++)
  for (int i = 0; i < V; i++)
    for (int j = 0; j < V; j++)
      if (d[i][k] + d[k][j] < d[i][j])
        d[i][j] = d[i][k] + d[k][j];
```

Order of `k, i, j` matters — `k` (the intermediate) must be the outer loop. Practical for small dense graphs (V ≤ a few hundred).

## A* (informed search)

Dijkstra ordered by `g(n) + h(n)`, where `g` is cost-so-far and `h` is an *admissible* heuristic estimate of remaining cost (never overestimates). With a perfect `h`, A* visits only the optimal path; with `h ≡ 0` it degenerates into Dijkstra. Common in pathfinding (`h` = Euclidean / Manhattan distance to the goal).

## Minimum Spanning Tree (MST)

Given a connected undirected weighted graph, an MST is a subset of edges of minimum total weight that keeps the graph connected.

### Kruskal's

Sort edges by weight; add them one at a time, skipping those that form a cycle. Use a *union-find* (DSU) to detect cycles in near-O(1) per query. Total: **O(E log E)**.

```java
sortByWeight(edges);
DSU dsu = new DSU(V);
int total = 0;
for (int[] e : edges) {                          // e = {u, v, w}
    if (dsu.union(e[0], e[1])) total += e[2];
}
```

### Prim's

Grow the MST one vertex at a time, always adding the lightest edge that crosses the boundary. Implement with a min-PQ keyed on the lightest known edge to each unfinished vertex. **O((V + E) log V)** with a binary heap. Mirror image of Dijkstra.

Pick Kruskal for sparse graphs (sort dominates); Prim for dense graphs (PQ wins).

## Topological sort (recap)

DAG-only. Two algorithms (see `07-graphs.md`):

- **Kahn's:** O(V + E), explicit in-degrees.
- **DFS-based:** O(V + E), push on the way out.

Used for build orders, course prerequisites, scheduling. A topo sort exists iff the graph has no directed cycle.

## Strongly Connected Components

Two classic O(V + E) algorithms:

- **Tarjan's:** single DFS, maintains a stack and `lowlink` value per vertex. Emits an SCC when a vertex's `lowlink` equals its index.
- **Kosaraju's:** two DFS passes. First pass on the original graph; push vertices in finish-order onto a stack. Second pass on the *reversed* graph from the top of the stack — each launch yields one SCC.

Use SCCs to "condense" a directed graph into a DAG of SCCs (`a` reaches `b` iff their SCCs are in the right order in the condensation).

## Max-flow (high level)

Given a graph with edge capacities, find the maximum flow from source `s` to sink `t`.

- **Ford–Fulkerson** with BFS finds augmenting paths in the residual graph; **Edmonds–Karp** is the BFS variant with O(V · E²) complexity.
- **Dinic's algorithm** uses BFS to build a layered graph plus blocking flows — O(V² · E), much faster in practice.

Min-cut equals max-flow (max-flow min-cut theorem). Bipartite matching reduces to max-flow.

## Pitfalls

- **Negative weights in Dijkstra.** Will silently give wrong answers. Switch to Bellman–Ford.
- **Integer overflow.** Distances and flows accumulate; use `long`.
- **Reusing visited[] across components.** When you walk multiple components, reset or scope the visited array carefully.
- **Mutable graph during traversal.** Don't add/remove edges mid-DFS — copy first.
- **Wrong representation.** O(V³) on a 10⁵-vertex graph is 10¹⁵ — Floyd–Warshall is not always your friend.

## Heuristics

- Single source + non-negative weights → Dijkstra.
- Single source + negative weights → Bellman–Ford.
- All pairs + small V → Floyd–Warshall.
- MST → Kruskal (sparse) or Prim (dense).
- Dependency order → topological sort.
- "Find the bottleneck" → max-flow / min-cut.
