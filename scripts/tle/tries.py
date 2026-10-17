"""TLE cases for Tries (see scripts/tle/__init__.py)."""
from tle import naive, tle

LETTERS = "abcdefghijklmnopqrstuvwxyz"


def _design(classname, steps):
    return [[classname] + [name for name, _ in steps], [[]] + [a for _, a in steps]]


# ---------- Implement Trie (Prefix Tree) ----------

@tle("implement-trie-prefix-tree")
def _trie(rng):
    # LeetCode: at most 3 * 10^4 calls in total. 15,000 distinct inserts, then 15,000 startsWith
    # prefixes that match NO word, so scanning the stored words for each prefix never exits early:
    # 15,000 * 15,000 = 2.25 * 10^8 startswith checks. Short words keep the file (and the
    # reference trie) small; the naive cost does not depend on word length.
    alpha = LETTERS[:25]
    words = set()
    while len(words) < 15000:
        words.add("".join(rng.choice(alpha) for _ in range(10)))
    words = sorted(words)
    rng.shuffle(words)
    prefixes = {w[:k] for w in words for k in range(1, 11)}
    queries = []
    while len(queries) < 15000:
        p = "".join(rng.choice(alpha) for _ in range(rng.randint(5, 10)))
        if p not in prefixes:
            queries.append(p)
    steps = [("insert", [w]) for w in words] + [("startsWith", [p]) for p in queries]
    return _design("Trie", steps)


naive("implement-trie-prefix-tree", "set + scan every word for startsWith O(n) per query", """class Trie:
    def __init__(self):
        self.words = set()

    def insert(self, word):
        self.words.add(word)

    def search(self, word):
        return word in self.words

    def startsWith(self, prefix):
        for w in self.words:
            if w.startswith(prefix):
                return True
        return False""")

naive("implement-trie-prefix-tree", "list + slice-compare every word O(n) per query", """class Trie:
    def __init__(self):
        self.words = []

    def insert(self, word):
        if word not in self.words:
            self.words.append(word)

    def search(self, word):
        return word in self.words

    def startsWith(self, prefix):
        return any(w[:len(prefix)] == prefix for w in self.words)""")


# ---------- Design Add and Search Words Data Structure ----------

@tle("design-add-and-search-words-data-structure")
def _word_dictionary(rng):
    # At most 10^4 calls: 5,000 distinct 25-letter words sharing one random 20-letter stem, then
    # 5,000 searches with both allowed dots inside the stem and (almost always) no match. Matching
    # the pattern against every stored word character by character gets through the stem for
    # every word: 5,000 * 5,000 * ~21 = 5 * 10^8 character comparisons. The trie walks one path
    # (the dots sit where the trie has a single child).
    stem = "".join(rng.choice(LETTERS) for _ in range(20))
    suffixes = set()
    while len(suffixes) < 5000:
        suffixes.add("".join(rng.choice(LETTERS) for _ in range(5)))
    suffixes = sorted(suffixes)
    rng.shuffle(suffixes)
    steps = [("addWord", [stem + s]) for s in suffixes]
    have = set(suffixes)
    for i in range(5000):
        s = rng.choice(suffixes)
        if i % 50 != 49:  # a few hits; the rest miss on the last letter
            s = s[:4] + rng.choice([c for c in LETTERS if s[:4] + c not in have])
        pat = list(stem + s)
        for j in rng.sample(range(20), 2):
            pat[j] = "."
        steps.append(("search", ["".join(pat)]))
    return _design("WordDictionary", steps)


naive("design-add-and-search-words-data-structure", "list + char-by-char match of every word O(n * L)", """class WordDictionary:
    def __init__(self):
        self.words = []

    def addWord(self, word):
        self.words.append(word)

    def search(self, word):
        for w in self.words:
            if len(w) != len(word):
                continue
            ok = True
            for i in range(len(word)):
                if word[i] != "." and word[i] != w[i]:
                    ok = False
                    break
            if ok:
                return True
        return False""")

naive("design-add-and-search-words-data-structure", "set + all(zip) match of every word O(n * L)", """class WordDictionary:
    def __init__(self):
        self.words = set()

    def addWord(self, word):
        self.words.add(word)

    def search(self, word):
        if "." not in word:
            return word in self.words
        return any(len(w) == len(word) and all(p == "." or p == c for p, c in zip(word, w))
                   for w in self.words)""")


# ---------- Word Search II ----------

@tle("word-search-ii")
def _word_search_ii(rng):
    # 12x12 board: rows 0-9 all 'a', rows 10-11 hold 24 distinct other letters (so every word's
    # letters are on the board and a letter-count prune skips nothing). 30,000 distinct words
    # "aaaaa" + 5 distinct non-'a' letters: the trie explores the ~10^4 self-avoiding 'a'-paths
    # once, but running Word Search I per word re-explores them for every word, ~30,000 * 3 * 10^4
    # DFS calls.
    others = list(LETTERS[1:])
    rng.shuffle(others)
    strip = others[:24]
    board = [["a"] * 12 for _ in range(10)] + [strip[:12], strip[12:]]
    words = set()
    while len(words) < 30000:
        words.add("aaaaa" + "".join(rng.sample(strip, 5)))
    words = sorted(words)
    rng.shuffle(words)
    return [board, words]


naive("word-search-ii", "Word Search I backtracking per word O(words * cells * 3^L)", """class Solution:
    def findWords(self, board, words):
        ROWS, COLS = len(board), len(board[0])

        def exist(word):
            def dfs(r, c, i):
                if i == len(word):
                    return True
                if r < 0 or c < 0 or r >= ROWS or c >= COLS or board[r][c] != word[i]:
                    return False
                tmp = board[r][c]
                board[r][c] = "#"
                found = (dfs(r + 1, c, i + 1) or dfs(r - 1, c, i + 1)
                         or dfs(r, c + 1, i + 1) or dfs(r, c - 1, i + 1))
                board[r][c] = tmp
                return found

            for r in range(ROWS):
                for c in range(COLS):
                    if dfs(r, c, 0):
                        return True
            return False

        return [w for w in words if exist(w)]""")

naive("word-search-ii", "per word, skip if letters missing, then backtracking with visited set", """from collections import Counter
class Solution:
    def findWords(self, board, words):
        ROWS, COLS = len(board), len(board[0])
        have = Counter(ch for row in board for ch in row)
        res = []
        for word in words:
            if any(have[ch] < n for ch, n in Counter(word).items()):
                continue
            path = set()

            def dfs(r, c, i):
                if i == len(word):
                    return True
                if (r < 0 or c < 0 or r >= ROWS or c >= COLS
                        or board[r][c] != word[i] or (r, c) in path):
                    return False
                path.add((r, c))
                found = (dfs(r + 1, c, i + 1) or dfs(r - 1, c, i + 1)
                         or dfs(r, c + 1, i + 1) or dfs(r, c - 1, i + 1))
                path.remove((r, c))
                return found

            if any(dfs(r, c, 0) for r in range(ROWS) for c in range(COLS)):
                res.append(word)
        return res""")
