"""TLE cases for Advanced Graphs (see scripts/tle/__init__.py)."""
from tle import naive, tle

UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


# ---------- Network Delay Time ----------

@tle("network-delay-time")
def _network_delay_time(rng):
    # n = 100: a complete digraph on 30 nodes (870 edges) holding k, plus a random tree hanging the
    # other 70 nodes off it (70 edges), 940 edges in all. Every node is reachable, and the clique
    # alone has ~29! simple paths from k, so enumerating paths never finishes.
    n = 100
    nodes = list(range(1, n + 1))
    rng.shuffle(nodes)
    core, rest = nodes[:30], nodes[30:]
    times = [[u, v, rng.randint(1, 100)] for u in core for v in core if u != v]
    placed = core[:]
    for v in rest:
        times.append([rng.choice(placed), v, rng.randint(0, 100)])
        placed.append(v)
    rng.shuffle(times)
    return [times, n, rng.choice(core)]


naive("network-delay-time", "DFS over every simple path O(paths)", """import sys
from collections import defaultdict
sys.setrecursionlimit(10000)
class Solution:
    def networkDelayTime(self, times, n, k):
        adj = defaultdict(list)
        for u, v, w in times:
            adj[u].append((v, w))
        dist = {}
        on_path = set()
        def dfs(u, t):
            if t < dist.get(u, float("inf")):
                dist[u] = t
            on_path.add(u)
            for v, w in adj[u]:
                if v not in on_path:
                    dfs(v, t + w)
            on_path.remove(u)
        dfs(k, 0)
        return max(dist.values()) if len(dist) == n else -1""")


# ---------- Reconstruct Itinerary ----------

@tle("reconstruct-itinerary")
def _reconstruct_itinerary(rng):
    # 300 tickets. JFK's lexically smallest ticket goes to a hub T with 148 round trips T->Ci->T;
    # the only valid itinerary first takes JFK->B->JFK and only then enters T's loops. Backtracking
    # that tries the smallest ticket first walks into T and runs through every ordering of the 148
    # loops (148!) before giving up on it; Hierholzer's algorithm is linear.
    names = set()
    while len(names) < 150:
        s = "".join(rng.choice(UPPER) for _ in range(3))
        if s != "JFK":
            names.add(s)
    names = sorted(names)
    hub, other = names[0], names[-1]
    loops = names[1:-1]
    tickets = [["JFK", hub], ["JFK", other], [other, "JFK"]]
    for c in loops:
        tickets += [[hub, c], [c, hub]]
    rng.shuffle(tickets)
    return [tickets]


naive("reconstruct-itinerary", "backtracking, smallest ticket first", """import sys
sys.setrecursionlimit(10000)
class Solution:
    def findItinerary(self, tickets):
        adj = {}
        for s, d in sorted(tickets):
            adj.setdefault(s, []).append(d)
        res = ["JFK"]
        def dfs(src):
            if len(res) == len(tickets) + 1:
                return True
            if src not in adj:
                return False
            temp = list(adj[src])
            for i, v in enumerate(temp):
                adj[src].pop(i)
                res.append(v)
                if dfs(v):
                    return True
                adj[src].insert(i, v)
                res.pop()
            return False
        dfs("JFK")
        return res""")

naive("reconstruct-itinerary", "backtracking over used-ticket flags", """import sys
sys.setrecursionlimit(10000)
class Solution:
    def findItinerary(self, tickets):
        tickets = sorted(tickets)
        used = [False] * len(tickets)
        path = ["JFK"]
        def dfs(src):
            if len(path) == len(tickets) + 1:
                return True
            prev = None
            for i, (s, d) in enumerate(tickets):
                if used[i] or s != src or (s, d) == prev:
                    continue
                prev = (s, d)
                used[i] = True
                path.append(d)
                if dfs(d):
                    return True
                path.pop()
                used[i] = False
            return False
        dfs("JFK")
        return path""")


# ---------- Min Cost to Connect All Points ----------

@tle("min-cost-to-connect-all-points")
def _min_cost_connect_points(rng):
    # 800 points: points[0] is a far outlier at (10^6, 10^6), the other 799 form a monotone
    # staircase from (-10^6, -10^6) with random steps, so the MST is the staircase plus the
    # outlier's link to its top end, and that link is longer than every staircase pair.
    # - Kruskal must examine (nearly) all ~3.2 * 10^5 staircase pairs before the outlier joins; a
    #   DFS cycle check per pair walks the staircase path, ~10^8 steps.
    # - O(n^3) Prim (min over tree x non-tree pairs) does ~8.5 * 10^7 distance calls.
    # Both measured ~30 s in Pyodide at n = 700, so ~45-50 s here (~3x the 15 s budget).
    # The reference (Prim over full adjacency lists + a lazy heap) starts at points[0] = the outlier,
    # so the outlier's long edges stay at the bottom of the heap and are never popped as stale; it
    # then walks the staircase, where the nearest frontier edge is always fresh: ~n pops, n^2/2
    # pushes. It is still Theta(n^2) in time and list memory: ~2 s in Pyodide at the 1000-point
    # maximum, too close to the 2 s reference budget, hence n = 800 (~1 s).
    pts = [[10**6, 10**6]]
    x = y = -10**6
    for _ in range(799):
        pts.append([x, y])
        if rng.random() < 0.5:
            x += rng.randint(1, 1500)
        else:
            y += rng.randint(1, 1500)
    return [pts]


naive("min-cost-to-connect-all-points", "Prim taking min() over all tree x non-tree pairs O(n^3)", """class Solution:
    def minCostConnectPoints(self, points):
        n = len(points)
        def dist(i, j):
            return abs(points[i][0] - points[j][0]) + abs(points[i][1] - points[j][1])
        tree = {0}
        rest = set(range(1, n))
        total = 0
        while rest:
            d, j = min((dist(i, j), j) for i in tree for j in rest)
            total += d
            tree.add(j)
            rest.remove(j)
        return total""")

naive("min-cost-to-connect-all-points", "Kruskal with a DFS cycle check per edge O(n^2 * n)", """class Solution:
    def minCostConnectPoints(self, points):
        n = len(points)
        edges = []
        for i in range(n):
            for j in range(i + 1, n):
                d = abs(points[i][0] - points[j][0]) + abs(points[i][1] - points[j][1])
                edges.append((d, i, j))
        edges.sort()
        adj = [[] for _ in range(n)]
        def connected(a, b):
            stack, seen = [a], {a}
            while stack:
                u = stack.pop()
                if u == b:
                    return True
                for v in adj[u]:
                    if v not in seen:
                        seen.add(v)
                        stack.append(v)
            return False
        total = added = 0
        for d, i, j in edges:
            if added == n - 1:
                break
            if not connected(i, j):
                adj[i].append(j)
                adj[j].append(i)
                total += d
                added += 1
        return total""")


# ---------- Swim in Rising Water ----------

@tle("swim-in-rising-water")
def _swim_in_rising_water(rng):
    # 50x50, values increasing by anti-diagonal (shuffled within each), so the bottom-right cell is
    # n^2 - 1 and the answer is the maximum: every path costs the same, a best-so-far bound never
    # prunes, and a "try each t, flood fill" scan runs all n^2 thresholds.
    n = 50
    grid = [[0] * n for _ in range(n)]
    v = 0
    for s in range(2 * n - 1):
        cells = [(r, s - r) for r in range(max(0, s - n + 1), min(n, s + 1))]
        rng.shuffle(cells)
        for r, c in cells:
            grid[r][c] = v
            v += 1
    return [grid]


naive("swim-in-rising-water", "backtracking DFS over paths with best-so-far pruning", """import sys
sys.setrecursionlimit(100000)
class Solution:
    def swimInWater(self, grid):
        n = len(grid)
        best = [float("inf")]
        seen = [[False] * n for _ in range(n)]
        def dfs(r, c, t):
            t = max(t, grid[r][c])
            if t >= best[0]:
                return
            if r == n - 1 and c == n - 1:
                best[0] = t
                return
            seen[r][c] = True
            for dr, dc in ((0, 1), (1, 0), (0, -1), (-1, 0)):
                nr, nc = r + dr, c + dc
                if 0 <= nr < n and 0 <= nc < n and not seen[nr][nc]:
                    dfs(nr, nc, t)
            seen[r][c] = False
        dfs(0, 0, 0)
        return best[0]""")


# ---------- Alien Dictionary ----------

@tle("alien-dictionary")
def _alien_dictionary(rng):
    # A dense DAG made from 100 words. With the alien order L[0] < L[1] < ... < L[25] (a random
    # permutation), letters 1..25 are split into 10 chains of stride d = 1..4 (s, s+d, s+2d, ...);
    # chain e contributes the words L[0]*e + L[x] for x in the chain. Adjacent words give the edges
    # i -> i+d (d <= 4) plus L[0] -> each chain head: ~94 edges, all 26 letters, and a unique order.
    # The unique valid order is a random permutation, so trying letter permutations in sorted
    # order is hopeless (26!), and the DAG has ~3.3 * 10^7 paths for a DFS that keeps no memo.
    letters = list("abcdefghijklmnopqrstuvwxyz")
    rng.shuffle(letters)
    rank = {ch: i for i, ch in enumerate(letters)}
    chains = [list(range(s, 26, d)) for d in range(1, 5) for s in range(1, d + 1)]
    words = [letters[0] * e + letters[x] for e, ch in enumerate(chains, 1) for x in ch]
    words.sort(key=lambda w: [rank[ch] for ch in w])
    return [words]


# Not registered: a DFS topological sort that tracks only the current path (no "done" memo) is
# correct and exponential, and this case is its worst case (~3.3 * 10^7 calls; the best 99-edge DAG
# on 26 letters has ~3.6 * 10^7 paths). But that is only ~18-22 s in Pyodide here, ~1.2-1.5x the
# 15 s budget, so it would not be killed reliably on a faster machine.
naive("alien-dictionary", "try every permutation of the letters, check the words are sorted", """from itertools import permutations
class Solution:
    def alienOrder(self, words):
        letters = sorted(set("".join(words)))
        for perm in permutations(letters):
            rank = {c: i for i, c in enumerate(perm)}
            keys = [[rank[c] for c in w] for w in words]
            if all(keys[i] <= keys[i + 1] for i in range(len(keys) - 1)):
                return "".join(perm)
        return ""
""")


# ---------- Cheapest Flights Within K Stops ----------

@tle("cheapest-flights-within-k-stops")
def _cheapest_flights(rng):
    # n = 100, the maximum 4950 flights, k = 99. 4949 random flights among nodes 0..98 cost 1..5;
    # dst = 99 is reached only by one flight costing 1000. Any partial route through the core costs
    # far less than the answer, so a best-so-far bound never prunes and a DFS/BFS over routes with
    # up to k stops explores ~50^k of them; Bellman-Ford is (k+1) * E = 5 * 10^5 relaxations.
    n = 100
    core = n - 1
    pairs = [(u, v) for u in range(core) for v in range(core) if u != v]
    chosen = rng.sample(pairs, n * (n - 1) // 2 - 1)
    src = rng.randrange(core)
    last = rng.choice([u for u in range(core) if u != src])
    flights = [[u, v, rng.randint(1, 5)] for u, v in chosen]
    flights.append([last, core, 1000])
    rng.shuffle(flights)
    return [n, flights, src, core, n - 1]


naive("cheapest-flights-within-k-stops", "DFS over routes with best-so-far pruning", """import sys
sys.setrecursionlimit(10000)
class Solution:
    def findCheapestPrice(self, n, flights, src, dst, k):
        adj = [[] for _ in range(n)]
        for u, v, p in flights:
            adj[u].append((v, p))
        best = [float("inf")]
        def dfs(u, cost, edges):
            if cost >= best[0]:
                return
            if u == dst:
                best[0] = cost
                return
            if edges == k + 1:
                return
            for v, p in adj[u]:
                dfs(v, cost + p, edges + 1)
        dfs(src, 0, 0)
        return -1 if best[0] == float("inf") else best[0]""")

naive("cheapest-flights-within-k-stops", "BFS by stops without pruning", """from collections import deque
class Solution:
    def findCheapestPrice(self, n, flights, src, dst, k):
        adj = [[] for _ in range(n)]
        for u, v, p in flights:
            adj[u].append((v, p))
        best = float("inf")
        q = deque([(src, 0, 0)])
        while q:
            u, cost, edges = q.popleft()
            if u == dst:
                best = min(best, cost)
                continue
            if edges == k + 1:
                continue
            for v, p in adj[u]:
                q.append((v, cost + p, edges + 1))
        return -1 if best == float("inf") else best""")
