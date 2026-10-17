"""TLE cases for Trees (see scripts/tle/__init__.py).

Trees are written in the suites' LeetCode level-order encoding (explicit nulls, trailing nulls
trimmed). Every tree here is at most DEPTH_CAP deep: the judge runs Python's default recursion
limit of 1000 (src/lib/pyodide/driver.py does not raise it), the vendored references are recursive,
and so are most learners' correct solutions -- a deeper tree would fail them with RecursionError
rather than a time limit. That cap is also what keeps O(n * depth) approaches (re-scanning a
subtree per node, walking the root path per node) inside the budget on these node counts.
"""
from tle import naive, no_tle, tle

DEPTH_CAP = 500


class _Node:
    __slots__ = ("val", "left", "right")

    def __init__(self, val=0):
        self.val, self.left, self.right = val, None, None


def _level(root):
    """Level-order with explicit nulls and trailing nulls trimmed (driver.from_tree)."""
    if root is None:
        return []
    out, q, i = [], [root], 0
    while i < len(q):
        node = q[i]
        i += 1
        if node is None:
            out.append(None)
            continue
        out.append(node.val)
        q.append(node.left)
        q.append(node.right)
    while out and out[-1] is None:
        out.pop()
    return out


def _random_tree(rng, n, depth):
    """n nodes, height exactly `depth`: a random zigzag spine of `depth` nodes guarantees the
    height, the rest hang off uniformly random free child slots no deeper than `depth`."""
    assert 1 <= depth <= n
    nodes = [_Node()]
    slots = []  # (parent, side, depth of the child that would go there)
    cur = nodes[0]
    for d in range(2, depth + 1):
        child = _Node()
        side = rng.choice(("left", "right"))
        setattr(cur, side, child)
        slots.append((cur, "right" if side == "left" else "left", d))
        nodes.append(child)
        cur = child
    while len(nodes) < n:
        j = rng.randrange(len(slots))
        slots[j], slots[-1] = slots[-1], slots[j]
        parent, side, d = slots.pop()
        child = _Node()
        setattr(parent, side, child)
        nodes.append(child)
        if d < depth:
            slots.append((child, "left", d + 1))
            slots.append((child, "right", d + 1))
    return nodes[0], nodes


def _inorder(root):
    out, stack, cur = [], [], root
    while stack or cur:
        while cur:
            stack.append(cur)
            cur = cur.left
        cur = stack.pop()
        out.append(cur)
        cur = cur.right
    return out


def _preorder(root):
    out, stack = [], [root]
    while stack:
        node = stack.pop()
        out.append(node)
        if node.right:
            stack.append(node.right)
        if node.left:
            stack.append(node.left)
    return out


def _chain(vals, sides):
    """A path: vals[i + 1] is the `sides[i]` child of vals[i]."""
    root = cur = _Node(vals[0])
    for v, side in zip(vals[1:], sides):
        child = _Node(v)
        setattr(cur, side, child)
        cur = child
    return root


def _zigzag(rng, n):
    return [rng.choice(("left", "right")) for _ in range(n - 1)]


# ---------- Invert Binary Tree ----------

@tle("invert-binary-tree")
def _invert(rng):
    # Max size (100 nodes), complete so every level is full width.
    return [[rng.randint(-100, 100) for _ in range(100)]]


no_tle("invert-binary-tree", "at most 100 nodes: every correct inversion is O(n) or close to it, a few hundred steps")


# ---------- Maximum Depth of Binary Tree ----------

@tle("maximum-depth-of-binary-tree")
def _max_depth(rng):
    # Max size as one zigzag path: the deepest possible tree (depth 100).
    return [_level(_chain([rng.randint(-100, 100) for _ in range(100)], _zigzag(rng, 100)))]


naive("maximum-depth-of-binary-tree", "doubled recursive call per level O(2^depth)", """class Solution:
    def maxDepth(self, root):
        if not root:
            return 0
        if self.maxDepth(root.left) > self.maxDepth(root.right):
            return 1 + self.maxDepth(root.left)
        return 1 + self.maxDepth(root.right)""")


# ---------- Diameter of Binary Tree ----------

@tle("diameter-of-binary-tree")
def _diameter(rng):
    # 100 nodes: two 49/50-node zigzag arms from the root, so the diameter is 99 and the
    # height-per-node recomputation does its maximal ~n^2 / 4 work.
    root = _Node(rng.randint(-100, 100))
    root.left = _chain([rng.randint(-100, 100) for _ in range(49)], _zigzag(rng, 49))
    root.right = _chain([rng.randint(-100, 100) for _ in range(50)], _zigzag(rng, 50))
    return [_level(root)]


naive("diameter-of-binary-tree", "height per node with doubled recursive call O(2^depth)", """class Solution:
    def diameterOfBinaryTree(self, root):
        def height(n):
            if not n:
                return 0
            if height(n.left) > height(n.right):
                return 1 + height(n.left)
            return 1 + height(n.right)

        if not root:
            return 0
        return max(height(root.left) + height(root.right),
                   self.diameterOfBinaryTree(root.left),
                   self.diameterOfBinaryTree(root.right))""")


# ---------- Balanced Binary Tree ----------

def _min_balanced(h, memo={0: 0, 1: 1}):
    if h not in memo:
        memo[h] = _min_balanced(h - 1) + _min_balanced(h - 2) + 1
    return memo[h]


def _balanced(rng, n, h):
    """A height-balanced tree with exactly n nodes and height exactly h."""
    if n == 0:
        return None
    node = _Node(rng.randint(-1000, 1000))
    options = [(h - 1, h - 2), (h - 2, h - 1), (h - 1, h - 1)]
    rng.shuffle(options)
    for hl, hr in options:
        if hl < 0 or hr < 0:
            continue
        lo = max(_min_balanced(hl), n - 1 - (2**hr - 1))
        hi = min(2**hl - 1, n - 1 - _min_balanced(hr))
        if lo <= hi:
            nl = rng.randint(lo, hi)
            node.left = _balanced(rng, nl, hl)
            node.right = _balanced(rng, n - 1 - nl, hr)
            return node
    raise AssertionError(f"no balanced tree with {n} nodes and height {h}")


@tle("balanced-binary-tree", count=2)
def _balanced_case(rng):
    _balanced_case.calls = getattr(_balanced_case, "calls", 0) + 1
    if _balanced_case.calls % 2:
        # Case 1: max size (1000 nodes), balanced (true, so no early exit) and as tall as a
        # balanced tree of 1000 nodes can be (height 14): the most work for top-down O(n^2)
        # height recomputation.
        return [_level(_balanced(rng, 1000, 14))]
    # Case 2: 998 nodes as two zigzag arms of 498 and 499 nodes under the root (height 500 =
    # DEPTH_CAP; arm heights differ by 1, so the root itself passes; false below). Height of the
    # root's left arm alone costs 2^497 calls for a height() that recurses into the taller child
    # twice.
    root = _Node(rng.randint(-1000, 1000))
    root.left = _chain([rng.randint(-1000, 1000) for _ in range(498)], _zigzag(rng, 498))
    root.right = _chain([rng.randint(-1000, 1000) for _ in range(499)], _zigzag(rng, 499))
    return [_level(root)]


naive("balanced-binary-tree", "top-down with doubled-call height() O(2^depth)", """class Solution:
    def isBalanced(self, root):
        def height(n):
            if not n:
                return 0
            if height(n.left) > height(n.right):
                return 1 + height(n.left)
            return 1 + height(n.right)

        if not root:
            return True
        if abs(height(root.left) - height(root.right)) > 1:
            return False
        return self.isBalanced(root.left) and self.isBalanced(root.right)""")


# ---------- Same Tree ----------

@tle("same-tree")
def _same_tree(rng):
    # Two identical 100-node trees: true, so every node is compared.
    root, _ = _random_tree(rng, 100, 30)
    for node in _preorder(root):
        node.val = rng.randint(-100, 100)
    t = _level(root)
    return [t, list(t)]


no_tle("same-tree", "at most 100 nodes per tree: any comparison, even via serialisation, is a few hundred steps")


# ---------- Subtree of Another Tree ----------

@tle("subtree-of-another-tree")
def _subtree(rng):
    # root is a 100-node path of zeros, subRoot a 50-node path of zeros on the same sides whose
    # last value differs: every start matches ~50 nodes before failing (false).
    sides = _zigzag(rng, 100)
    root = _chain([0] * 100, sides)
    sub = _chain([0] * 49 + [rng.choice((-1, 1)) * rng.randint(1, 100)], sides[50:])
    return [_level(root), _level(sub)]


naive("subtree-of-another-tree", "compare only where heights match, doubled-call height() O(2^depth)", """class Solution:
    def isSubtree(self, root, subRoot):
        def height(n):
            if not n:
                return 0
            if height(n.left) > height(n.right):
                return 1 + height(n.left)
            return 1 + height(n.right)

        def same(a, b):
            if not a or not b:
                return a is b
            return a.val == b.val and same(a.left, b.left) and same(a.right, b.right)

        target = height(subRoot)

        def dfs(n):
            if not n:
                return False
            if height(n) == target and same(n, subRoot):
                return True
            return dfs(n.left) or dfs(n.right)

        return dfs(root)""")


# ---------- Lowest Common Ancestor of a Binary Search Tree ----------

@tle("lowest-common-ancestor-of-a-binary-search-tree")
def _lca_bst(rng):
    # 100 unique values as a LEFT-leaning path (decreasing: the deepest BST), p and q the two
    # deepest nodes. A general-tree LCA that repeats its recursive calls doubles the work per
    # level here: 2^98 calls.
    vals = sorted(rng.sample(range(-100, 101), 100), reverse=True)
    return [_level(_chain(vals, ["left"] * 99)), vals[-1], vals[-2]]


naive("lowest-common-ancestor-of-a-binary-search-tree", "general-tree LCA with repeated recursive calls O(2^depth)", """class Solution:
    def lowestCommonAncestor(self, root, p, q):
        if not root or root.val == p.val or root.val == q.val:
            return root
        if self.lowestCommonAncestor(root.left, p, q) and self.lowestCommonAncestor(root.right, p, q):
            return root
        return self.lowestCommonAncestor(root.left, p, q) or self.lowestCommonAncestor(root.right, p, q)""")


# ---------- Binary Tree Level Order Traversal ----------

@tle("binary-tree-level-order-traversal")
def _level_order(rng):
    # Max size (2000 nodes) and deep (500 levels): the most work for a DFS-per-depth approach.
    root, nodes = _random_tree(rng, 2000, DEPTH_CAP)
    for node in nodes:
        node.val = rng.randint(-1000, 1000)
    return [_level(root)]


naive("binary-tree-level-order-traversal", "height with doubled recursive call, then collect each level O(2^depth)", """class Solution:
    def levelOrder(self, root):
        def height(n):
            if not n:
                return 0
            if height(n.left) > height(n.right):
                return 1 + height(n.left)
            return 1 + height(n.right)

        def collect(n, d, out):
            if not n:
                return
            if d == 0:
                out.append(n.val)
                return
            collect(n.left, d - 1, out)
            collect(n.right, d - 1, out)

        res = []
        for d in range(height(root)):
            level = []
            collect(root, d, level)
            res.append(level)
        return res""")


# ---------- Binary Tree Right Side View ----------

@tle("binary-tree-right-side-view")
def _right_side(rng):
    # 100 nodes: the root's right child is a leaf and the rest is a left-leaning path, so all but
    # the top two levels are seen from the LEFT subtree.
    root = _Node(rng.randint(-100, 100))
    root.right = _Node(rng.randint(-100, 100))
    sides = ["left" if rng.random() < 0.7 else "right" for _ in range(97)]
    root.left = _chain([rng.randint(-100, 100) for _ in range(98)], sides)
    return [_level(root)]


naive("binary-tree-right-side-view", "height with doubled recursive call, then rightmost node per depth O(2^depth)", """class Solution:
    def rightSideView(self, root):
        def height(n):
            if not n:
                return 0
            if height(n.left) > height(n.right):
                return 1 + height(n.left)
            return 1 + height(n.right)

        def rightmost(n, d):
            if not n:
                return None
            if d == 0:
                return n.val
            r = rightmost(n.right, d - 1)
            return r if r is not None else rightmost(n.left, d - 1)

        return [rightmost(root, d) for d in range(height(root))]""")


# ---------- Count Good Nodes in Binary Tree ----------

@tle("count-good-nodes-in-binary-tree")
def _good_nodes(rng):
    # Max size (10^5 nodes), 500 levels deep: searching the root path of each node separately
    # visits ~n^2 / 2 = 5 * 10^9 nodes.
    root, nodes = _random_tree(rng, 10**5, DEPTH_CAP)
    for node in nodes:
        node.val = rng.randint(-100, 100)
    return [_level(root)]


naive("count-good-nodes-in-binary-tree", "search each node's root path O(n^2)", """class Solution:
    def goodNodes(self, root):
        def path_to(node, target, path):
            if not node:
                return False
            path.append(node.val)
            if node is target:
                return True
            if path_to(node.left, target, path) or path_to(node.right, target, path):
                return True
            path.pop()
            return False

        count = 0
        stack = [root]
        while stack:
            node = stack.pop()
            path = []
            path_to(root, node, path)
            if node.val >= max(path):
                count += 1
            if node.left:
                stack.append(node.left)
            if node.right:
                stack.append(node.right)
        return count""")


# ---------- Validate Binary Search Tree ----------

BROOM_PATH = 970  # right path of the validate-BST broom: depth 970 + 14 = 984; at 980 (994) the
# recursive reference already hits RecursionError


def _broom(n, path):
    """A `path`-node right-leaning path whose last node's right child is a complete tree of the
    remaining n - path nodes: the deepest shape for its size where most nodes sit at the bottom,
    under every path node."""
    nodes = [_Node() for _ in range(n)]
    for i in range(path - 1):
        nodes[i].right = nodes[i + 1]
    bottom = nodes[path:]
    for i, node in enumerate(bottom):
        if 2 * i + 1 < len(bottom):
            node.left = bottom[2 * i + 1]
        if 2 * i + 2 < len(bottom):
            node.right = bottom[2 * i + 2]
    if bottom:
        nodes[path - 1].right = bottom[0]
    return nodes[0]


@tle("validate-binary-search-tree", count=3)
def _validate_bst(rng):
    # Max size (10^4 nodes), a VALID BST (no early exit) shaped as a broom: a long right path above
    # a complete bottom, as deep as the recursive reference can go under the recursion limit. That
    # is the worst case for re-scanning each node's subtrees for their max / min (sum of depths
    # ~ 9 * 10^6 visits) and for checking each node against its whole ancestor path. Values spread
    # over the whole range including both extremes. Three cases: the slowest correct approach found,
    # the ancestor-path check, takes ~13-16 s on ONE of these, and the budget is for the whole
    # Submit, so three (~31 s measured here) put it far enough past 15 s to time out on any machine.
    root = _broom(10**4, BROOM_PATH)
    vals = sorted(rng.sample(range(-10**9 + 1, 10**9), 10**4 - 2) + [-10**9, 10**9])
    for node, v in zip(_inorder(root), vals):
        node.val = v
    return [_level(root)]


naive("validate-binary-search-tree", "search from the root for each node's ancestor path O(n^2)", """class Solution:
    def isValidBST(self, root):
        def path_to(node, target, path):
            if node is None:
                return False
            path.append(node)
            if node is target or path_to(node.left, target, path) or path_to(node.right, target, path):
                return True
            path.pop()
            return False

        stack, nodes = [root], []
        while stack:
            node = stack.pop()
            if node:
                nodes.append(node)
                stack.append(node.left)
                stack.append(node.right)
        for node in nodes:
            path = []
            path_to(root, node, path)
            for anc, child in zip(path, path[1:]):
                if child is anc.left and not node.val < anc.val:
                    return False
                if child is anc.right and not node.val > anc.val:
                    return False
        return True""")


# ---------- Kth Smallest Element in a BST ----------

@tle("kth-smallest-element-in-a-bst")
def _kth_smallest(rng):
    # Max size (10^4 nodes, values 0..10^4), 500 levels deep, k = n: the answer is the very last
    # node in order, so an in-order walk cannot stop early.
    root, nodes = _random_tree(rng, 10**4, DEPTH_CAP)
    vals = sorted(rng.sample(range(0, 10**4 + 1), 10**4))
    for node, v in zip(_inorder(root), vals):
        node.val = v
    return [_level(root), 10**4]


naive("kth-smallest-element-in-a-bst", "k times next-smallest by full recursive traversal O(n*k)", """class Solution:
    def kthSmallest(self, root, k):
        def smallest_above(node, prev):
            if not node:
                return None
            best = node.val if prev is None or node.val > prev else None
            for child in (node.left, node.right):
                c = smallest_above(child, prev)
                if c is not None and (best is None or c < best):
                    best = c
            return best

        prev = None
        for _ in range(k):
            prev = smallest_above(root, prev)
        return prev""")



# ---------- Construct Binary Tree from Preorder and Inorder Traversal ----------

BUILD_PATH = 900  # right path of the build-tree broom: ~911 deep, which the recursive reference
# still builds with frames to spare


@tle("construct-binary-tree-from-preorder-and-inorder-traversal", count=3)
def _build_tree(rng):
    # Max size (2001 nodes, every value in [-1000, 1000]) shaped as a ~911-deep broom: a long right
    # path above a complete bottom. Rebuilding each child's preorder by filtering on membership in
    # the inorder halves costs ~ sum of m^2 over the nodes, ~13 s per case here, so three cases put a
    # whole Submit well past the 15 s budget. The textbook index()+slicing solution stays O(n^2)
    # in C and the reference takes ~50 ms a case.
    root = _broom(2001, BUILD_PATH)
    vals = list(range(-1000, 1001))
    rng.shuffle(vals)
    for node, v in zip(_preorder(root), vals):
        node.val = v
    return [[n.val for n in _preorder(root)], [n.val for n in _inorder(root)]]


naive("construct-binary-tree-from-preorder-and-inorder-traversal", "rebuild child preorders by membership filtering O(sum m^2)", """class Solution:
    def buildTree(self, preorder, inorder):
        if not preorder:
            return None
        root = TreeNode(preorder[0])
        i = inorder.index(preorder[0])
        left_in, right_in = inorder[:i], inorder[i + 1:]
        root.left = self.buildTree([x for x in preorder if x in left_in], left_in)
        root.right = self.buildTree([x for x in preorder if x in right_in], right_in)
        return root""")


# ---------- Binary Tree Maximum Path Sum ----------

@tle("binary-tree-maximum-path-sum")
def _max_path_sum(rng):
    # Max size (3 * 10^4 nodes), 500 levels deep, mixed signs: walking every path from every
    # start node visits n^2 = 9 * 10^8 nodes.
    root, nodes = _random_tree(rng, 3 * 10**4, DEPTH_CAP)
    for node in nodes:
        node.val = rng.randint(-1000, 1000)
    return [_level(root)]


naive("binary-tree-maximum-path-sum", "best path from every start node O(n^2)", """class Solution:
    def maxPathSum(self, root):
        adj = {}
        stack = [root]
        while stack:
            node = stack.pop()
            adj.setdefault(node, [])
            for child in (node.left, node.right):
                if child:
                    adj[node].append(child)
                    adj[child] = [node]
                    stack.append(child)
        best = root.val
        for start in adj:
            stack = [(start, None, start.val)]
            while stack:
                node, prev, total = stack.pop()
                if total > best:
                    best = total
                for nxt in adj[node]:
                    if nxt is not prev:
                        stack.append((nxt, node, total + nxt.val))
        return best""")


# ---------- Serialize and Deserialize Binary Tree ----------

@tle("serialize-and-deserialize-binary-tree")
def _codec(rng):
    # Max size (10^4 nodes), 500 levels deep, values over the whole range (signs, 1-4 digits).
    root, nodes = _random_tree(rng, 10**4, DEPTH_CAP)
    for node in nodes:
        node.val = rng.randint(-1000, 1000)
    return [_level(root)]


no_tle("serialize-and-deserialize-binary-tree", "at most 10^4 nodes: even list.pop(0) or string slicing per token is ~10^8 byte moves in C, well under a second")

