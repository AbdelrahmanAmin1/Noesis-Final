# Graphs

A *graph* is a collection of *vertices* (nodes) connected by *edges*. Graphs model anything with relationships: road networks, web pages, friend graphs, dependency graphs, state machines.

## Vocabulary

- **Directed** edges have a direction (`a → b`); **undirected** edges are bidirectional.
- **Weighted** edges carry a number (distance, cost, capacity).
- **Cyclic** graphs contain at least one cycle; **acyclic** ones (DAGs) do not.
- **Connected** undirected graphs have a path between every pair of vertices; **strongly connected** directed graphs require a path in both directions.
- **Sparse** vs **dense:** a graph is sparse if E ≪ V², dense if E ≈ V². The choice of representation depends on which.

`V` is the number of vertices, `E` the number of edges.

## Representations

### Adjacency list

For each vertex, store a list of its neighbors. Memory is O(V + E). Iterating a vertex's neighbors is O(degree). The default for sparse graphs.

```java
List<List<Integer>> adj = new ArrayList<>();
for (int i = 0; i < V; i++) adj.add(new ArrayList<>());
adj.get(u).add(v);   // edge u → v
```

For weighted edges, the inner list stores `(neighbor, weight)` pairs.

### Adjacency matrix

A V×V matrix with `m[u][v] = 1` (or weight) if an edge exists. Memory is O(V²). Edge lookup is O(1). Default for dense graphs and for shortest-path algorithms that need many edge queries (e.g. Floyd–Warshall).

### Edge list

Just an array of `(u, v, weight)` triples. Memory O(E). Used when the algorithm processes edges in sequence (Kruskal's MST).

## Traversals

### Breadth-First Search (BFS)

Visits vertices in layers — the source first, then all its neighbors, then their neighbors. Uses a queue. On an unweighted graph, BFS finds the *shortest path* (fewest edges) to every reachable vertex. O(V + E).

```java
int[] dist = new int[V];
Arrays.fill(dist, -1);
dist[src] = 0;
Queue<Integer> q = new ArrayDeque<>();
q.offer(src);
while (!q.isEmpty()) {
    int u = q.poll();
    for (int v : adj.get(u)) {
        if (dist[v] == -1) {
            dist[v] = dist[u] + 1;
            q.offer(v);
        }
    }
}
```

### Depth-First Search (DFS)

Goes as deep as possible before backtracking. Uses a stack (often the call stack via recursion). O(V + E). DFS is the engine for cycle detection, topological sort, strongly-connected-components (Tarjan, Kosaraju), bridges and articulation points.

```java
boolean[] visited = new boolean[V];
void dfs(int u) {
    if (visited[u]) return;
    visited[u] = true;
    for (int v : adj.get(u)) dfs(v);
}
```

For deep graphs, prefer an iterative DFS with an explicit stack to avoid stack overflow.

## Cycle detection

- **Undirected:** during DFS, an edge to a visited vertex *that is not the parent* is a cycle.
- **Directed:** during DFS, an edge to a vertex currently *on the recursion stack* is a back-edge → cycle. Track three states: white (unvisited), gray (on stack), black (done).

A directed graph is a *DAG* iff DFS finds no back edges.

## Topological sort

Linear ordering of a DAG's vertices such that every edge `u → v` has `u` before `v`. Two algorithms:

- **Kahn's** (BFS-style): repeatedly emit a vertex with in-degree 0 and decrement neighbors' in-degrees. O(V + E).
- **DFS-based:** push each vertex onto a stack on the way *out* of DFS; final stack order (reversed) is the topo sort.

Used for build systems, course prerequisites, scheduling.

## Shortest paths (preview — full treatment in 08)

- **Unweighted:** BFS — O(V + E).
- **Non-negative weights:** Dijkstra's algorithm with a min-PQ — O((V + E) log V).
- **Negative edges (no negative cycles):** Bellman–Ford — O(V·E).
- **All pairs:** Floyd–Warshall — O(V³); good for small dense graphs.

## Connectivity

- **Connected components** of an undirected graph: run BFS/DFS from each unvisited vertex; one CC per launch. O(V + E).
- **Strongly connected components** of a directed graph: Tarjan's or Kosaraju's, both O(V + E).
- **Union-Find / DSU:** maintains components incrementally as edges are added. Near-O(1) per operation amortized. Foundation of Kruskal's MST.

## Pitfalls

- **Mixing 0-indexed and 1-indexed vertex IDs.** Pick one and stick with it.
- **Mutable adjacency during iteration.** Don't modify `adj` while a BFS/DFS is in flight.
- **Forgetting visited[]**. Without it, BFS/DFS can loop forever in cyclic graphs.
- **Memory blowup on adjacency matrix.** A 100k-vertex graph needs a 10⁹-cell matrix — use the list.
- **Edge weights as `int`.** Distances accumulated through Dijkstra can overflow. Use `long`.

## Heuristics

- Sparse + traversal: adjacency list.
- Dense + many edge queries: adjacency matrix.
- Edge-stream algorithms (MST): edge list.
- Dynamic connectivity: union-find.
