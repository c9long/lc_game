"""TLE cases for Graphs (see scripts/tle/__init__.py).

The judge runs Python's default recursion limit of 1000 (src/lib/pyodide/driver.py does not raise
it) and most of the vendored references here are recursive DFS, so every input keeps the longest
path such a DFS can take to a few hundred. On grids that rules out one big open blob of land/water:
the large regions below are "pocket combs" -- a spine column with pockets of `t` rows hanging off
it, each pocket joined to the spine through a SINGLE entrance cell. A simple path can then run down
the spine and into at most one pocket, so a DFS never goes deeper than spine + t * width (~400 at
100 x 100 with t = 3), while the region still covers ~3/4 of the grid.
"""
from tle import naive, no_tle, tle

INF = 2**31 - 1


def _pocket_comb(rng, rows, cols, t, c0=0):
    """Cells of a pocket comb on rows `rows` (a range), columns c0..cols-1: spine at column
    cols-1, pocket bodies at columns c0..cols-3, one entrance per pocket at column cols-2 (a random
    row of the pocket). Pockets are `t` rows, separated by one row outside the comb."""
    cells = {(r, cols - 1) for r in rows}
    rows = list(rows)
    i = 0
    while i < len(rows):
        group = rows[i:i + t]
        for r in group:
            for c in range(c0, cols - 2):
                cells.add((r, c))
        cells.add((rng.choice(group), cols - 2))
        i += t + 1
    return cells


# ---------- Number of Islands ----------

@tle("number-of-islands")
def _number_of_islands(rng):
    # Max size 100 x 100, ~3/4 land in a pocket comb (bounded DFS depth, see module docstring) with
    # a few cells knocked out so some pockets split into separate islands.
    comb = _pocket_comb(rng, range(100), 100, 3)
    grid = [["0"] * 100 for _ in range(100)]
    for r, c in comb:
        if c == 99 or c == 98 or rng.random() > 0.03:
            grid[r][c] = "1"
    return [grid]


naive("number-of-islands", "flood from every land cell, dedupe islands by cell set", """from collections import deque
class Solution:
    def numIslands(self, grid):
        R, C = len(grid), len(grid[0])
        islands = set()
        for r in range(R):
            for c in range(C):
                if grid[r][c] != "1":
                    continue
                seen = {(r, c)}
                q = deque([(r, c)])
                while q:
                    x, y = q.popleft()
                    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                        if 0 <= nx < R and 0 <= ny < C and grid[nx][ny] == "1" and (nx, ny) not in seen:
                            seen.add((nx, ny))
                            q.append((nx, ny))
                islands.add(frozenset(seen))
        return len(islands)""")


# ---------- Max Area of Island ----------

@tle("max-area-of-island")
def _max_area_of_island(rng):
    # Max size 50 x 50, one pocket-comb island covering ~3/4 of the grid (bounded DFS depth, see
    # the module docstring).
    comb = _pocket_comb(rng, range(50), 50, 3)
    grid = [[0] * 50 for _ in range(50)]
    for r, c in comb:
        grid[r][c] = 1
    return [grid]


no_tle("max-area-of-island", "grid <= 50 x 50 = 2500 cells: re-flooding the island from every land cell is ~6 * 10^6 cell visits, a few seconds at most")


# ---------- Clone Graph ----------

@tle("clone-graph")
def _clone_graph(rng):
    # Max size: the complete graph on 100 nodes (4950 edges), neighbor lists shuffled.
    adj = []
    for i in range(1, 101):
        nbrs = [j for j in range(1, 101) if j != i]
        rng.shuffle(nbrs)
        adj.append(nbrs)
    return [adj]


no_tle("clone-graph", "<= 100 nodes and so <= 4950 edges: even O(V * E) work is ~5 * 10^5 steps")


# ---------- Walls and Gates ----------

@tle("walls-and-gates")
def _walls_and_gates(rng):
    # 100 x 100: the left 33 columns are all gates, column 33 is a wall with one gap at a far
    # corner, and the right 66 columns are empty rooms. One case, worst for both slow approaches
    # (the split balances them):
    #   a BFS from EVERY room to its nearest gate must first reach the gap, exploring every room
    #   nearer than it -- ~3.3 * 10^7 cell visits over the 6600 rooms;
    #   a full BFS from EVERY gate covers all ~10^4 open cells, 3300 times -- 3.3 * 10^7.
    rooms = [[0] * 33 + [-1] + [INF] * 66 for _ in range(100)]
    rooms[rng.choice((0, 99))][33] = INF
    for _ in range(20):                                   # a few walls among the rooms
        rooms[rng.randrange(100)][rng.randrange(34, 100)] = -1
    if rng.random() < 0.5:
        rooms = [row[::-1] for row in rooms]
    return [rooms]


naive("walls-and-gates", "BFS from every room to its nearest gate", """from collections import deque
class Solution:
    def wallsAndGates(self, rooms):
        R, C = len(rooms), len(rooms[0])
        INF = 2147483647
        for r in range(R):
            for c in range(C):
                if rooms[r][c] != INF:
                    continue
                q = deque([(r, c, 0)])
                seen = {(r, c)}
                while q:
                    x, y, d = q.popleft()
                    if rooms[x][y] == 0:
                        rooms[r][c] = d
                        break
                    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                        if 0 <= nx < R and 0 <= ny < C and rooms[nx][ny] != -1 and (nx, ny) not in seen:
                            seen.add((nx, ny))
                            q.append((nx, ny, d + 1))""")

naive("walls-and-gates", "full BFS from every gate, keep the minimum", """from collections import deque
class Solution:
    def wallsAndGates(self, rooms):
        R, C = len(rooms), len(rooms[0])
        gates = [(r, c) for r in range(R) for c in range(C) if rooms[r][c] == 0]
        for gr, gc in gates:
            q = deque([(gr, gc, 0)])
            seen = {(gr, gc)}
            while q:
                x, y, d = q.popleft()
                if d < rooms[x][y]:
                    rooms[x][y] = d
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < R and 0 <= ny < C and rooms[nx][ny] != -1 and (nx, ny) not in seen:
                        seen.add((nx, ny))
                        q.append((nx, ny, d + 1))""")


# ---------- Rotting Oranges ----------

@tle("rotting-oranges")
def _rotting_oranges(rng):
    # Max size 10 x 10, a snake of 55 fresh oranges (full even rows joined by one cell in each odd
    # row) with the only rotten one at an end: the most minutes a 10 x 10 grid can take, so
    # minute-by-minute rescans run the longest.
    grid = [[0] * 10 for _ in range(10)]
    for r in range(10):
        if r % 2 == 0:
            grid[r] = [1] * 10
        else:
            grid[r][9 if r % 4 == 1 else 0] = 1
    r, c = rng.choice([(0, 0), (9, 9)])                 # the snake's two ends
    grid[r][c] = 2
    return [grid]


no_tle("rotting-oranges", "grid <= 10 x 10 = 100 cells: rescanning the whole grid every minute is <= 100 minutes x 100 cells")


# ---------- Pacific Atlantic Water Flow ----------

def _pacific_atlantic_grid(rng):
    # The top row, left column and bottom row are walls of 501..1000, so nothing inside reaches
    # the Pacific. The interior is a pocket comb of height 500 whose spine is the right border (the
    # Atlantic); every other interior cell is lower (0..499). A cell-by-cell search ("can water
    # from here reach both oceans?") therefore never finds the Pacific from the ~7000 comb cells
    # and floods all ~9600 interior cells from each: ~7 * 10^7 cell visits. The reference climbs
    # from the borders instead and only ever walks the comb and the walls.
    h = [[rng.randint(0, 499) for _ in range(100)] for _ in range(100)]
    for c in range(100):
        h[0][c] = rng.randint(501, 1000)
        h[99][c] = rng.randint(501, 1000)
    for r in range(100):
        h[r][0] = rng.randint(501, 1000)
    for r, c in _pocket_comb(rng, range(1, 99), 100, 3, c0=1):
        h[r][c] = 500
    return h


@tle("pacific-atlantic-water-flow")
def _pacific_atlantic(rng):
    return [_pacific_atlantic_grid(rng)]


naive("pacific-atlantic-water-flow", "BFS from every cell for both oceans", """from collections import deque
class Solution:
    def pacificAtlantic(self, heights):
        R, C = len(heights), len(heights[0])
        res = []
        for r in range(R):
            for c in range(C):
                pac = atl = False
                seen = {(r, c)}
                q = deque([(r, c)])
                while q and not (pac and atl):
                    x, y = q.popleft()
                    if x == 0 or y == 0:
                        pac = True
                    if x == R - 1 or y == C - 1:
                        atl = True
                    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                        if 0 <= nx < R and 0 <= ny < C and (nx, ny) not in seen and heights[nx][ny] <= heights[x][y]:
                            seen.add((nx, ny))
                            q.append((nx, ny))
                if pac and atl:
                    res.append([r, c])
        return res""")


# ---------- Surrounded Regions ----------

@tle("surrounded-regions")
def _surrounded_regions(rng):
    # Max size 200 x 200. The border ring is a random mix of O and X, the ring inside it is all X,
    # and everything further in is one huge O region (a few X's sprinkled in) that is surrounded.
    # Checking "does this O escape?" with a fresh flood from every O walks the whole ~3.6 * 10^4
    # cell region for every one of its cells. The reference only floods from border O's.
    n = 200
    board = [["O" if rng.random() > 0.03 else "X" for _ in range(n)] for _ in range(n)]
    for i in range(n):
        for r, c in ((0, i), (n - 1, i), (i, 0), (i, n - 1)):
            board[r][c] = "O" if rng.random() < 0.3 else "X"
        for r, c in ((1, i), (n - 2, i), (i, 1), (i, n - 2)):
            if 0 < r < n - 1 and 0 < c < n - 1:
                board[r][c] = "X"
    return [board]


naive("surrounded-regions", "flood from every O to see if it escapes", """from collections import deque
class Solution:
    def solve(self, board):
        R, C = len(board), len(board[0])
        flip = []
        for r in range(R):
            for c in range(C):
                if board[r][c] != 'O':
                    continue
                seen = {(r, c)}
                q = deque([(r, c)])
                escapes = False
                while q:
                    x, y = q.popleft()
                    if x == 0 or y == 0 or x == R - 1 or y == C - 1:
                        escapes = True
                        break
                    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                        if board[nx][ny] == 'O' and (nx, ny) not in seen:
                            seen.add((nx, ny))
                            q.append((nx, ny))
                if not escapes:
                    flip.append((r, c))
        for r, c in flip:
            board[r][c] = 'X'""")


# ---------- Course Schedule / Course Schedule II ----------

def _diamond_dag(rng, n, m, stages, max_depth):
    """n courses, m unique [course, prereq] pairs, acyclic. `stages` diamonds in a chain (s -> a, b
    -> s') give 2^stages distinct prerequisite paths from the top of the chain to its bottom, so a
    DFS that remembers only the current path (no memo of finished courses) is exponential. The rest
    are random edges consistent with one random topological order. Longest path <= max_depth."""
    order = rng.sample(range(n), n)
    chain = order[:3 * stages + 1]                      # s0 a0 b0 s1 a1 b1 s2 ...
    pos = {v: i for i, v in enumerate(order)}
    pairs = set()
    for i in range(stages):
        s, a, b, s2 = chain[3 * i:3 * i + 4]
        # [course, prereq]: s2 needs a and b, which both need s.
        pairs |= {(a, s), (b, s), (s2, a), (s2, b)}
    tries = 0
    while len(pairs) < m and tries < 50 * m:
        tries += 1
        u, v = rng.sample(range(n), 2)
        if pos[u] < pos[v]:
            u, v = v, u                                  # course later in the order needs earlier
        pairs.add((u, v))
    if len(pairs) != m:
        return None
    # Longest path (in nodes) must stay well inside the recursion limit.
    longest = {}
    prereqs = {}
    for u, v in pairs:
        prereqs.setdefault(u, []).append(v)
    for v in sorted(range(n), key=pos.get):
        longest[v] = 1 + max((longest[p] for p in prereqs.get(v, [])), default=0)
    if max(longest.values()) > max_depth:
        return None
    out = [list(p) for p in pairs]
    rng.shuffle(out)
    return out


@tle("course-schedule")
def _course_schedule(rng):
    # 1000 courses, 1000 prerequisite pairs, acyclic (answer true: no early exit), with a 40-stage
    # diamond chain: ~2^40 paths for a DFS without a "finished" memo.
    pairs = _diamond_dag(rng, 1000, 1000, 40, 300)
    return None if pairs is None else [1000, pairs]


naive("course-schedule", "DFS remembering only the current path (no memo)", """class Solution:
    def canFinish(self, numCourses, prerequisites):
        pre = {c: [] for c in range(numCourses)}
        for a, b in prerequisites:
            pre[a].append(b)

        def dfs(c, path):
            if c in path:
                return False
            path.add(c)
            for p in pre[c]:
                if not dfs(p, path):
                    return False
            path.remove(c)
            return True

        for c in range(numCourses):
            if not dfs(c, set()):
                return False
        return True""")


@tle("course-schedule-ii")
def _course_schedule_ii(rng):
    pairs = _diamond_dag(rng, 1000, 1000, 40, 300)
    return None if pairs is None else [1000, pairs]


naive("course-schedule-ii", "post-order DFS remembering only the current path", """class Solution:
    def findOrder(self, numCourses, prerequisites):
        pre = {c: [] for c in range(numCourses)}
        for a, b in prerequisites:
            pre[a].append(b)
        out, placed = [], set()

        def dfs(c, path):
            if c in path:
                return False
            path.add(c)
            for p in pre[c]:
                if not dfs(p, path):
                    return False
            path.remove(c)
            if c not in placed:
                placed.add(c)
                out.append(c)
            return True

        for c in range(numCourses):
            if not dfs(c, set()):
                return []
        return out""")


# ---------- Graph Valid Tree ----------

def _random_tree_edges(rng, n, depth_cap):
    """A random tree on 0..n-1 of height <= depth_cap from the node 0 (so <= 2 * depth_cap between
    any two nodes), as a shuffled edge list with randomly oriented pairs."""
    depth = [0] * n
    edges = []
    for v in range(1, n):
        while True:
            u = rng.randrange(v)
            if depth[u] < depth_cap:
                break
        depth[v] = depth[u] + 1
        edges.append([u, v] if rng.random() < 0.5 else [v, u])
    perm = [0] + rng.sample(range(1, n), n - 1)
    edges = [[perm[a], perm[b]] for a, b in edges]
    rng.shuffle(edges)
    return edges


@tle("graph-valid-tree")
def _graph_valid_tree(rng):
    # Max nodes, a valid tree (answer true, so nothing exits early), deep-ish chains.
    return [2000, _random_tree_edges(rng, 2000, 300)]


no_tle("graph-valid-tree", "n <= 2000 and a graph with n or more edges has a cycle among its first n: even O(n * (n + edges)) is ~10^7 steps")


# ---------- Number of Connected Components ----------

def _uf_depth(n, edges):
    """Longest parent chain the reference's recursive findParent (f[find(a)] = find(b), path
    compression, no rank) ever walks on these edges."""
    f = list(range(n))
    worst = 0

    def find(x):
        nonlocal worst
        path = []
        while f[x] != x:
            path.append(x)
            x = f[x]
        worst = max(worst, len(path))
        for p in path:
            f[p] = x
        return x

    for a, b in edges:
        f[find(a)] = find(b)
    for x in range(n):
        find(x)
    return worst


@tle("number-of-connected-components-in-an-undirected-graph")
def _count_components(rng):
    # Max size: 2000 nodes, 5000 edges, one giant component (~1900 nodes, the worst case for a BFS
    # from every node) plus a few small ones so the answer is not 1. Each component is spanned by a
    # random tree (so it is connected), then filled with random extra edges.
    n, m = 2000, 5000
    order = list(range(n))
    rng.shuffle(order)
    groups = [order[:1900], order[1900:1950], order[1950:1980], order[1980:]]
    seen, edges = set(), []

    def add(a, b):
        key = (min(a, b), max(a, b))
        if a == b or key in seen:
            return False
        seen.add(key)
        edges.append([a, b] if rng.random() < 0.5 else [b, a])
        return True

    for g in groups:
        for i in range(1, len(g)):
            add(g[i], g[rng.randrange(i)])
    weights = [len(g) for g in groups]
    while len(edges) < m:
        g = rng.choices(groups, weights)[0]
        add(*rng.sample(g, 2))
    rng.shuffle(edges)
    return [n, edges] if _uf_depth(n, edges) <= 300 else None


no_tle("number-of-connected-components-in-an-undirected-graph", "n <= 2000, edges <= 5000: even a full BFS from every node over one ~1900-node component is ~1.4 * 10^7 steps, ~3.4 s in Pyodide")


# ---------- Redundant Connection ----------

@tle("redundant-connection")
def _redundant_connection(rng):
    # Max size n = 1000: a 500-node cycle whose edges all come first (so the answer -- the cycle's
    # last edge in input order -- is early and "drop edges from the end and retest" tries ~500
    # removals), then tree edges hanging the other 500 nodes off it.
    n = 1000
    labels = rng.sample(range(1, n + 1), n)
    cyc = labels[:500]
    edges = [sorted((cyc[i], cyc[(i + 1) % 500])) for i in range(500)]
    rng.shuffle(edges)
    attached = cyc[:]
    tail = []
    for v in labels[500:]:
        tail.append(sorted((v, rng.choice(attached))))
        attached.append(v)
    rng.shuffle(tail)
    return [edges + tail]


no_tle("redundant-connection", "n <= 1000 edges: re-checking connectivity per edge or retrying each removal is ~10^6 steps")


# ---------- Word Ladder ----------

@tle("word-ladder")
def _word_ladder(rng):
    # 100 words: 99 two-letter words over 10 letters (a 10 x 10 rook's graph -- each word is one
    # letter away from 18 others) and an endWord built from two OTHER letters, so it is in the list
    # but unreachable. BFS answers 0 after ~100 words; a DFS over simple paths (keeping the best
    # length so far) never finds the end, so it cannot prune and enumerates astronomically many.
    letters = rng.sample("abcdefghijklmnopqrstuvwxyz", 12)
    alpha, other = letters[:10], letters[10:]
    words = [a + b for a in alpha for b in alpha]
    rng.shuffle(words)
    begin = words.pop()
    end = other[0] + other[1]
    words.insert(rng.randrange(len(words) + 1), end)
    return [begin, end, words]


naive("word-ladder", "DFS over every simple path, keep the shortest", """class Solution:
    def ladderLength(self, beginWord, endWord, wordList):
        words = list(wordList)
        best = [0]

        def adjacent(a, b):
            return sum(x != y for x, y in zip(a, b)) == 1

        def dfs(word, steps, used):
            if best[0] and steps >= best[0]:
                return
            if word == endWord:
                best[0] = steps
                return
            for w in words:
                if w not in used and adjacent(word, w):
                    used.add(w)
                    dfs(w, steps + 1, used)
                    used.remove(w)

        dfs(beginWord, 1, {beginWord})
        return best[0]""")
