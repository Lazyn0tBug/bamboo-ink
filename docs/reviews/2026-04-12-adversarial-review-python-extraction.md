# Adversarial Review: docs/brainstorms/2026-04-12-002-python-extraction-module.md

## Document Analysis

**Size estimate**: ~615 lines, approximately 4500 words. Contains 16 top-level requirements (R1-R16) with multiple sub-requirements (R3, R9, R10, R13, R14, R15, R16 each have A1/A2/... sub-sections). Roughly 30+ distinct implementation units when counting sub-requirements, module files, and test files.

**Risk signals**: Authentication/authorization (none), but **data migration** (9000+ files), **external API** (LLM integration in PC2), **parser migration** (cheerio to selectolax -- different DOM model), **irreversible data transformations** (territory claim model), **cross-language parity** (JS as "corrected baseline" which itself has known bugs).

**Depth**: Deep -- large document, moderate-to-high complexity, high-stakes domain (data pipeline handling 9000+ files with irreversible transformations).

---

## FINDINGS

### F1: The "JS as Corrected Baseline" Parity Target Is Fundamentally Flawed

**Severity**: P0
**File**: docs/brainstorms/2026-04-12-002-python-extraction-module.md
**Line**: 68 (R3 equivalence strategy, "合理解析差异"判定 paragraph)
**Confidence**: 0.85
**Autofix_class**: ASSUMPTION_INVALID
**Owner**: requirements-author
**Requires_verification**: true
**Pre_existing**: false

The document states: "当 Python 和 JS 对同一 HTML 文件产生差异时，以 JS 版行为为参考基准" (when Python and JS differ, use JS behavior as the reference baseline).

**The problem**: The JS baseline itself contains known, documented bugs that are being actively fixed in parallel Track A (Units A1-A6). The origin document (`2026-04-12-001`) explicitly identifies:

- R1: `claimSubtree` swallowing body content (already known, being fixed)
- R2: Duplicate title scanning producing redundant work
- R4: `flattenTables` regex that can replace text content containing "table"/"tr"/"td" strings
- R8: Double-classification of child nodes

The JS baseline is a **moving target**. If Python development starts before Track A (JS optimization) completes, Python will replicate the **buggy** JS behavior, not the corrected one. The document acknowledges this dependency ("JS 版 A6 完成" as a dependency for PC1), but the R3 parity strategy itself creates a perverse incentive: when Python and JS differ, the team will blame Python first because "JS is the baseline." This means JS bugs that produce wrong-but-consistent output will never be found by parity testing.

**Concrete failure scenario**: JS's `flattenTables` uses cheerio DOM operations (after A3 fix). Python uses regex-based pre-parsing (R16-A1). For an HTML file containing the text "这本书记载了许多table ceremonies" (containing the literal word "table" in Chinese context), the JS version correctly preserves it but the Python regex pre-processing may mangle it. The parity test catches this. But for a file where JS's old regex `flattenTables` *also* produces wrong output, both versions agree on wrong output -- and the parity test passes. The bug is invisible.

**Suggested fix**: Define parity against a **canonical IR schema** (JSON Schema, already mentioned at line 336) with explicit *correctness criteria* independent of either implementation. Parity tests should be three-way: Python output == JS output == schema-validated-correctness. When they differ, the tiebreaker should be "which output satisfies the schema and extraction rules," not "which matches JS."

---

### F2: selectolax and cheerio Produce Structurally Different DOMs for the Same HTML

**Severity**: P0
**File**: docs/brainstorms/2026-04-12-002-python-extraction-module.md
**Line**: 244-256 (R16-A1 parser capability table)
**Confidence**: 0.82
**Autofix_class**: ASSUMPTION_INVALID
**Owner**: requirements-author
**Requires_verification**: true
**Pre_existing**: false

The document assumes selectolax (Modest/lexbor) and cheerio (parse5/htmlparser) will produce equivalent DOM trees for the same malformed FrontPage 4.0 HTML. This is a critical unstated assumption.

**Evidence of structural divergence**:

1. **`tbody` injection**: cheerio automatically inserts `<tbody>` into `<table>` structures (noted in pattern-cache.mjs line 29: "handles cheerio-injected tbody wrapping"). selectolax/lexbor may or may not do the same. If selectolax does NOT inject `<tbody>`, the `while ($('td').length > 0)` loop in the JS version has a different termination condition than the Python equivalent, leading to different DOM depths and different text node positions.

2. **Entity handling**: cheerio uses `decodeEntities: true` (pattern-cache.mjs line 26). selectolax's entity decoding behavior is different -- it uses the lexbor engine which has its own entity resolution table. `&nbsp;` may be decoded differently, whitespace may be normalized differently.

3. **Implicit tag insertion**: For `<FONT>` without closing tags (common in FrontPage 4.0 HTML), cheerio and lexbor have different "fixup" heuristics. The JS test fixtures show nested `<FONT>` tags (`<FONT COLOR="#FF6666"><FONT SIZE=5>大学章句集注</FONT></FONT>`). If lexbor auto-closes the outer `<FONT>` before the inner one closes, the text node hierarchy changes -- which changes which nodes are matched by Pass 1-3 rules.

4. **Text node splitting**: cheerio splits text at `<br>` tags differently than lexbor. The `allTextNodes` array in the DOM index will have different lengths and boundaries, which directly affects `extractRemaining()` output.

**The flattenTables strategy compounds this**: R16-A1 proposes regex-based `<td>` replacement *before* selectolax parsing. But the JS version (after A3 fix) does DOM-based replacement *after* parsing. The input to the parser is fundamentally different:

- JS: `cheerio.load(original_html)` then DOM manipulation
- Python: `regex_replace(original_html)` then `selectolax.parse(modified_html)`

These produce different trees even for identical HTML input. The "equivalent" claim is unverified.

**Suggested fix**: Before any Pass implementation, build a **DOM structure comparison test**: parse the same 20 representative FrontPage HTML files with both cheerio and selectolax, dump the tree structure (tag names, depths, text content, sibling counts), and report structural differences. This should be a gating criterion before R8 (Pass implementation) begins.

---

### F3: Territory Model's Irreversibility Creates Unfixable Error Cascades

**Severity**: P1
**File**: docs/brainstorms/2026-04-12-002-python-extraction-module.md
**Line**: 306-310 (R16-A4 Territory claim semantics)
**Confidence**: 0.80
**Autofix_class**: ASSUMPTION_INVALID
**Owner**: requirements-author
**Requires_verification**: true
**Pre_existing**: false

The document explicitly states: "认领是不可逆的：一旦认领，后续 Pass 无法再访问" (Claims are irreversible: once claimed, subsequent passes cannot access). This is inherited from the JS design but its consequences are not analyzed.

**The cascade scenario**:

1. Pass 1 matches a node as `book-title` due to a color/size rule that also matches a chapter title in a specific template variant.
2. That node (and its subtree, if `claimSubtree`) is permanently removed from visibility.
3. Pass 3 (chapter-title) never sees it. Pass 9 (main-text) never sees it.
4. The assemble phase produces a chapter structure with one fewer chapter.
5. The output IR is structurally wrong but passes parity if JS has the same bug.

**The real risk**: In the current JS code, the Territory model uses cheerio node *objects* as claimed set members. The Python version proposes using numeric *node IDs* (index-based). This changes the semantics of `has_claimed_ancestor`:

- JS: `node.parent` follows cheerio's parent pointers (which may include auto-inserted `tbody` nodes)
- Python: Must build a `parent_map` during `build_dom_index`. If the parent map is built from a different tree structure (see F2), the ancestor check returns different results.

Furthermore, `claim_subtree(node_id, descendants)` requires a pre-computed descendants list. If the DOM tree structure differs between parsers (F2), the descendants list will include/exclude different nodes.

**No recovery mechanism exists**. The R13 error classification has no "claim conflict" or "reclaim" error type. Once a bad claim happens, the only output is a structurally wrong IR with no indication that content was lost.

**Suggested fix**: Add a **claim audit log** that records every claim (pass number, node ID, matched rule, text content preview). After all passes complete, cross-reference the audit log against the total text content to detect "large claims" -- claims that consumed more than X% of total text. Flag these as QualityWarning for manual review. This does not fix the irreversibility but makes it visible.

---

### F4: The Text Conservation Invariant (R15-A2) Is Unverifiable Due to normalize_html

**Severity**: P1
**File**: docs/brainstorms/2026-04-12-002-python-extraction-module.md
**Line**: 215-216 (R15-A2 invariants table, first row)
**Confidence**: 0.78
**Autofix_class**: ASSUMPTION_INVALID
**Owner**: requirements-author
**Requires_verification**: true
**Pre_existing**: false

The invariant states: "原始 HTML 的文本内容总量 >= 最终 IR 中所有 section.content 的文本总量" (original HTML text content >= final IR section content).

This is **impossible to verify correctly** because:

1. `normalize_html` strips empty tags (line 257 of extractors.mjs: `html.replace(/<(?!br|hr|img|input|meta|link)([a-z]+)[^>]*>\s*<\/\1>/gi, '')`). These tags may contain whitespace-only text that counts toward the "original" total but is intentionally removed.

2. `flattenTables` restructures the DOM. The cheerio version (JS after A3) produces different serialized HTML than the regex version (Python). The "original HTML text content" metric depends on *which* HTML you measure: before normalization, after `<center>` replacement, after table flattening, or after entity decoding?

3. The JS cheerio parser with `decodeEntities: true` converts `&nbsp;` to Unicode U+00A0. The Python selectolax may or may not do the same. This changes text content character counts.

4. `extractRemaining()` in JS concatenates text nodes with spaces (`currentText += ' ' + text`, extractors.mjs line 105). Python's equivalent may use different joining logic. The IR text content length depends on how many text nodes were adjacent and how many spaces were inserted.

The "30% gap" threshold for data loss is arbitrary and unverifiable. A file with heavy annotation content (where annotations are extracted into separate `annotations[]` fields, not `section.content`) will naturally have a large gap between "original HTML text" and "IR section content" because annotation text is in a different field.

**Suggested fix**: Redefine the invariant as: "total text across ALL IR fields (section.content + annotations[].text + chapter.title + navItems.label) should be within X% of text content in the *normalized* (post-normalize_html) HTML." Measure after normalization, not before. And exclude `&nbsp;` and other non-content whitespace from both sides of the comparison.

---

### F5: The 7-Stage Data Flow Has Hidden Sub-Stages and Cross-Cutting Concerns

**Severity**: P2
**File**: docs/brainstorms/2026-04-12-002-python-extraction-module.md
**Line**: 193-208 (R15-A1 data flow table)
**Confidence**: 0.72
**Autofix_class**: ASSUMPTION_INCOMPLETE
**Owner**: requirements-author
**Requires_verification**: true
**Pre_existing**: false

The seven-stage flow (normalize -> index -> catalog -> territory -> extract -> assemble -> serialize) presents a clean linear pipeline. But examining the actual JS code reveals hidden stages:

1. **Encoding detection and conversion**: The document dismisses this with "9000+ 中仅 2 个文件非 UTF-8，手动处理即可" (only 2 of 9000+ are non-UTF-8, handle manually). But this is a pipeline design document. If the pipeline receives one of those 2 files, it crashes. That's not "manual handling" -- that's an unhandled edge case in the design.

2. **Catalog metadata injection**: R2 API supplement mentions `catalog_dict` injection, but the data flow table does not show where this enters the pipeline. It affects Pass 2 (metadata) and the author/dynasty fields, but these are Stage 4 (Territory) operations consuming data from an external source not shown in the flow diagram.

3. **Pattern cache consumption**: The JS code has a `patternCache` that influences classification (R10/A4). The Python module structure does not include a pattern cache module. If the Python version is supposed to be "equivalent," where does pattern caching go? This is a missing stage.

4. **Error accumulation**: R13 defines per-file error handling, but the data flow shows no error path. If Stage 2 (index) fails partially (e.g., some nodes fail to index), does Stage 4 (territory) proceed with a partial index? The document says "Pass 级容错: 单个 Pass 内部异常 -> 记录日志，该 Pass 产出为空，后续 Pass 继续执行" but a partial (not total) failure is not addressed.

**Suggested fix**: Add an "external inputs" column to the data flow table showing `catalog_dict`, `pattern_cache`, and `encoding_detection` as inputs at their respective stages. Add an "error state" column showing what happens when each stage partially fails.

---

### F6: Technical Constraints (R16) Miss Critical Edge Cases in Color Normalization and Selector Matching

**Severity**: P1
**File**: docs/brainstorms/2026-04-12-002-python-extraction-module.md
**Line**: 283-295 (R16-A3 color normalization)
**Confidence**: 0.76
**Autofix_class**: ASSUMPTION_INCOMPLETE
**Owner**: requirements-author
**Requires_verification**: true
**Pre_existing**: false

The color normalization table covers `#F66` -> `#FF6666`, `#f66` -> `#FF6666`, `#ff6666` -> `#FF6666`, and `#FF6666` -> `#FF6666`. But it misses:

1. **Inline style colors**: FrontPage HTML often uses `style="color: #ff6666"` in addition to `<font color="#FF6666">`. The R16-A2 compatibility table shows `[style*="COLOR: #FF6666"]` as a selector. The style attribute value may be `color: #ff6666`, `COLOR:#FF6666`, `color:#f66`, `color: rgb(255, 102, 102)`, or `color: #F66`. The normalization table only covers the `<font color>` attribute form, not CSS `style` attribute values.

2. **Named colors**: The table says "不展开（按需转换）" (don't expand, convert as needed) for named colors like `red`. But the JS code's `by_color` index keys off the `color` attribute directly. If FrontPage HTML uses `color="red"` (not impossible in HTML 4), the Python version would index it as `"red"` while JS might normalize it differently.

3. **RGBA/hex with alpha**: Unlikely in FrontPage 4.0, but if any file has 8-digit hex (`#FF666600`), the normalization would not handle it.

4. **The JS code does NOT normalize colors**: Looking at `buildDomIndex` (extractors.mjs line 210-214), it does `const upper = color.toUpperCase()` -- only uppercasing, no shorthand expansion. The Python version proposes expanding `#F66` to `#FF6666`. This means the `by_color` index will have **different keys** between JS and Python for the same HTML. A file with `<font color="#f66">` will be indexed as `"#F66"` in JS and `"#FF6666"` in Python. Any Pass that queries `by_color.get("#FF6666")` will find nodes in Python that it would not find in JS (if the original HTML used shorthand).

**This is a direct parity break**: The Python normalization changes the `by_color` index structure in a way that cannot match JS behavior, unless the normalization happens identically in both.

**Suggested fix**: Match JS behavior exactly: only uppercase, no shorthand expansion. If shorthand expansion is desired for correctness, apply it in **both** JS and Python as a normalization step before `buildDomIndex`.

---

### F7: AI Fallback Design Is Reactive When It Should Be Proactive Quality Assessment

**Severity**: P2
**File**: docs/brainstorms/2026-04-12-002-python-extraction-module.md
**Line**: 113-135 (R9-A1 AI Fallback interface)
**Confidence**: 0.65
**Autofix_class**: DESIGN_MISFRAME
**Owner**: requirements-author
**Requires_verification**: true
**Pre_existing**: false

The AI Fallback is designed as a reactive mechanism: "当规则引擎产出质量低于阈值时，触发 AI Fallback" (trigger AI fallback when rule engine output quality falls below threshold). The trigger conditions are post-hoc: 0 chapters, 0 annotations, single chapter containing everything, deviates from book profile.

**The misframing**: By the time these conditions are detected, the extraction has already completed and produced a (possibly wrong) IR. The AI fallback would then re-extract the same HTML using an LLM -- which is:

1. **Expensive**: LLM calls cost money and time. For 9000+ files, even 1% fallback rate means 90+ LLM calls.
2. **Unreliable**: LLM extraction of classical Chinese text is not guaranteed to be better than rule-based extraction. The LLM may produce *different* wrong output.
3. **Untestable**: How do you verify that `fallback_extract` produces correct output? There is no "correct" answer to compare against -- that's why the fallback was triggered in the first place.

**A better framing**: AI should be used as a **quality assessment layer**, not a fallback extractor. The AI reviews the rule-based output and flags specific issues (e.g., "section 3 appears to be a continuation of section 2, not a new section"). This is cheaper (can use smaller models), more targeted, and the output is actionable even without automatic re-extraction.

However, this finding is lower confidence because the document explicitly defers AI implementation to PC2, and the PC1 dummy implementation is appropriate. The design concern is about the *interface shape* -- `should_fallback` and `fallback_extract` bake in the reactive pattern. Changing to a proactive quality assessment would require a different protocol interface.

**Suggested fix**: Redesign the protocol to include a `QualityAssessor` with `assess(ir: ContentIR, source_html: str) -> QualityReport` that returns structured findings (not just a boolean). The fallback decision can then be made per-finding rather than per-file.

---

### F8: PC1->PC2->PC3 Evolution Path Risks Dummy Implementations Becoming Production by Accident

**Severity**: P2
**File**: docs/brainstorms/2026-04-12-002-python-extraction-module.md
**Line**: 22-33 (Evolution Path diagram and descriptions)
**Confidence**: 0.70
**Autofix_class**: DESIGN_RISK
**Owner**: requirements-author
**Requires_verification**: true
**Pre_existing**: false

The evolution path (PC1 dummy -> PC2 real -> PC3 production) has a well-known software engineering risk: **dummy implementations that "work well enough" become permanent**.

Specific risks in this document:

1. `AIFallback.should_fallback` returning `False` always: If PC1 runs on 9000+ files and produces acceptable results (because most files are well-structured), the team may conclude "AI fallback is not needed" and never activate PC2.

2. `BookProfileStore` returning `None`: Same risk. If extraction works without book profiles, the team may skip PC2.

3. `Exporter` protocol defined but not implemented: If `json.dumps` via CLI is sufficient, there is no pressure to implement HTML5/Markdown exporters.

4. `NLPPlugin` NoOpNLP dummy: If nobody depends on NLP output, the dummy stays forever.

This is not inherently bad -- some dummies may never need activation. The risk is that the **interfaces designed for dummy may be inadequate for real implementation**. For example, `QualityScore` TypedDict has 4 fields. When PC2 arrives, the team may discover these 4 fields are insufficient to make a good fallback decision, requiring interface changes that break PC1 consumers.

**Suggested fix**: Add a "PC2 readiness checklist" to the document: for each dummy interface, specify what evidence would trigger PC2 activation, and what the minimum viable real implementation looks like. This prevents the "it works fine with dummies" complacency.

---

### F9: Module Structure Split (extractors.py vs passes.py) Creates Coupling Risk

**Severity**: P2
**File**: docs/brainstorms/2026-04-12-002-python-extraction-module.md
**Line**: 394-420 (Module Structure diagram)
**Confidence**: 0.68
**Autofix_class**: STRUCTURAL_RISK
**Owner**: requirements-author
**Requires_verification**: true
**Pre_existing**: false

The module structure splits:
- `extractors.py`: build_dom_index, Pass 1-3 orchestration
- `passes.py`: Pass 4-10 + assembleResults text assembler

The stated principle is: "extractors.py 仅负责 Pass 1-3 编排和 DOM 索引构建；passes.py 负责 Pass 4-10 和结果装配."

**The coupling problem**: Pass 4-10 depend on the Territory instance created in Pass 1-3. The `Territory.claimed` set is shared. This means:

1. `extractors.py` creates Territory and populates it via Pass 1-3.
2. `passes.py` receives the Territory and reads/writes `claimed` for Pass 4-10.
3. `assemble_results` in `passes.py` reads both the Territory state and the Pass 1-3 results (chapter title positions, etc.).

This is not a circular dependency in the import graph, but it is a **data coupling** that makes the module boundary meaningless. Any change to the Territory API requires changes in both modules. Any change to Pass 1-3 output format requires changes in passes.py.

The JS version keeps everything in one file (`extractors.mjs`, ~1103 lines) precisely because these components share a lot of state. Splitting them in Python without a clean interface definition creates a "logical" separation that the code structure does not enforce.

**Additionally**: `normalize.py` is listed separately from both. But `normalize_html` must run before `build_dom_index`, which is in `extractors.py`. And `rules.py` is used by Pass 1-3 (extractors.py) and potentially Pass 4-8 (passes.py). The dependency graph is:

```
normalize.py -> extractors.py -> passes.py
     |              |
     v              v
  rules.py (used by both)
```

This is not clean. `rules.py` being a shared dependency between extractors.py and passes.py means changes to rules affect both modules.

**Suggested fix**: Consider a single `pipeline.py` module for PC1 that contains all passes and assembly, with `normalize.py` and `rules.py` as supporting modules. Split into `extractors.py`/`passes.py` only when the modules are large enough to justify the coupling cost. Alternatively, define a clear `PipelineContext` dataclass that is the *only* thing passed between extractors.py and passes.py.

---

### F10: Error Classification (R13) Omits Infrastructure and Resource Errors

**Severity**: P2
**File**: docs/brainstorms/2026-04-12-002-python-extraction-module.md
**Line**: 470-480 (R13-A1 error classification table)
**Confidence**: 0.75
**Autofix_class**: ASSUMPTION_INCOMPLETE
**Owner**: requirements-author
**Requires_verification**: true
**Pre_existing**: false

The six error classes are: Fatal, FileError, ParseError, ExtractError, QualityWarning, ParityMismatch. But processing 9000+ files on a real filesystem will encounter:

1. **Disk I/O errors**: Disk full, read-only filesystem, corrupted file. These are not FileError (which is "file not found, encoding error, empty file") and not Fatal (which is "dependency missing, config error"). A disk read error mid-batch is a distinct failure mode.

2. **Memory errors**: selectolax parses the entire HTML into memory. A single malformed file with deeply nested tags (more than the expected 50-80 layers) could cause memory exhaustion. The recursion limit is set to 2000 (R16-A6), but memory is not bounded.

3. **selectolax/lexbor C extension errors**: selectolax is a Python C extension wrapping lexbor. If lexbor crashes on a specific HTML pattern (segfault, buffer overflow), it will not raise a Python exception -- it will crash the interpreter. This is fundamentally uncatchable from Python.

4. **Concurrent modification**: If the pipeline reads source files while they are being converted (encoding conversion script running in parallel), it may read partial files.

5. **Timeout errors**: No timeout is defined. If a single file takes 10+ seconds (due to pathological HTML), the entire batch slows down. For 9000 files, even one pathological file adds disproportionate time.

The R13-A2 tolerance strategy says "Pass 级容错: 单个 Pass 内部异常 -> 记录日志，该 Pass 产出为空" but does not distinguish between a Python `Exception` (catchable) and a segfault (not catchable).

**Suggested fix**: Add `ResourceError` (memory, disk, timeout) and `EngineError` (parser crash, C extension failure) to the error classification. Add a per-file timeout (e.g., 30 seconds) with a QualityWarning output. Document that selectolax crashes are uncatchable and require restarting from the last checkpoint.

---

## RESIDUAL RISKS

```json
[
  {
    "risk_id": "RR1",
    "description": "The 98% content match threshold in R7 is arbitrary. A file could have 98% content match but the 2% mismatch could be the most semantically important content (e.g., the last paragraph of a chapter).",
    "likelihood": "Medium",
    "impact": "Medium",
    "mitigation": "Add semantic-weighted matching: weight mismatches by their position in the document (beginning/end content is more likely to be important)."
  },
  {
    "risk_id": "RR2",
    "description": "The document assumes 9000+ files are homogeneous enough that a single pipeline handles all. But the origin document mentions multiple template variants (Template F, G, etc.). Different templates may require different extraction rules.",
    "likelihood": "Medium",
    "impact": "High",
    "mitigation": "Stratify the 9000 files by template type before batch processing. Report per-template match rates, not just aggregate."
  },
  {
    "risk_id": "RR3",
    "description": "Book Profile system assumes '同一本书的所有内容文件共享同一套 FrontPage 模板' (all files from the same book share the same FrontPage template). This invariant may not hold for scanned/OCR'd books that were processed at different times with different template versions.",
    "likelihood": "Low",
    "impact": "High",
    "mitigation": "Validate the template-sharing invariant on a sample before PC2. If violated, fall back to per-file profiling."
  },
  {
    "risk_id": "RR4",
    "description": "The `IREncoder` that converts non-JSON-serializable types to strings (R4, line 79-83) silently masks type errors. A datetime, set, or custom object in the IR would be stringified without warning, producing valid JSON with incorrect content.",
    "likelihood": "Medium",
    "impact": "Low",
    "mitigation": "Use IREncoder only in CLI output, not in the library API. The library should raise TypeError on non-serializable types."
  },
  {
    "risk_id": "RR5",
    "description": "The pipeline has no checkpointing mechanism. If processing fails at file 5000 of 9000, all 5000 results must be reprocessed or manually recovered.",
    "likelihood": "Low",
    "impact": "High",
    "mitigation": "Implement incremental processing: write results per-file as they complete, track progress in a manifest file, resume from last completed file."
  }
]
```

## TESTING GAPS

```json
[
  {
    "gap_id": "TG1",
    "description": "No DOM structure comparison test between cheerio and selectolax. Without this, parity testing compares outputs of different input trees, making it impossible to determine whether differences are due to parser divergence or extraction logic errors.",
    "affected_requirements": ["R3", "R8", "R16"],
    "suggested_test": "Parse 20 representative FrontPage HTML files with both cheerio and selectolax. Dump tree structures (tag, depth, text, children count). Report structural differences."
  },
  {
    "gap_id": "TG2",
    "description": "No test for Territory claim cascade failures. A single mis-claimed node should not silently remove entire sections of content. Testing requires intentionally misconfiguring a Pass rule and observing the downstream impact.",
    "affected_requirements": ["R8", "R13", "R16-A4"],
    "suggested_test": "Create a test fixture where Pass 1's rule matches a chapter title node. Verify that Pass 3 still finds other chapter titles and Pass 9 finds the mis-claimed node's text in the error audit log."
  },
  {
    "gap_id": "TG3",
    "description": "No test for `flattenTables` regex vs DOM equivalence. The Python regex-based approach and JS DOM-based approach must produce equivalent HTML structures for parity to hold.",
    "affected_requirements": ["R3", "R16-A1"],
    "suggested_test": "Run both the JS flattenTables (cheerio DOM) and Python flattenTables (regex) on the same 50 HTML files. Compare output HTML structures. Report any structural differences."
  },
  {
    "gap_id": "TG4",
    "description": "No test for the 2 non-UTF-8 files. The document dismisses them as 'manually handled,' but they will crash the pipeline if encountered during batch processing.",
    "affected_requirements": ["R13", "R4"],
    "suggested_test": "Create test fixtures for GBK and Big5 encoded HTML. Verify that FileError is raised with clear message, file is skipped, and batch processing continues."
  },
  {
    "gap_id": "TG5",
    "description": "No test for the `sys.setrecursionlimit(2000)` side effects. Changing the recursion limit is process-global in CPython and affects all threads. If the extraction runs in a multi-threaded batch mode, this could cause unexpected behavior.",
    "affected_requirements": ["R16-A6"],
    "suggested_test": "Test with a maximally deep HTML file (>80 levels). Verify recursion limit increase works and does not affect subsequent files."
  },
  {
    "gap_id": "TG6",
    "description": "No test for the IREncoder silent stringification behavior. If any TypedDict field accidentally contains a non-serializable type, it will be silently converted to its repr() string.",
    "affected_requirements": ["R4"],
    "suggested_test": "Inject a non-serializable type (e.g., set) into a ContentIR field. Verify JSON output contains the stringified version. Flag as potentially undesirable behavior."
  }
]
```

## FINDINGS SUMMARY TABLE

| ID   | Title                                                              | Severity | Confidence |
|------|--------------------------------------------------------------------|----------|------------|
| F1   | JS-as-baseline parity target is fundamentally flawed               | P0       | 0.85       |
| F2   | selectolax/cheerio structural DOM divergence unverified            | P0       | 0.82       |
| F3   | Territory irreversibility creates unfixable error cascades         | P1       | 0.80       |
| F4   | Text conservation invariant unverifiable due to normalize_html     | P1       | 0.78       |
| F6   | Color normalization breaks parity with JS by_color index           | P1       | 0.76       |
| F10  | Error classification omits infrastructure/resource errors          | P2       | 0.75       |
| F5   | 7-stage data flow has hidden sub-stages and cross-cutting concerns | P2       | 0.72       |
| F8   | Dummy implementations risk becoming permanent                      | P2       | 0.70       |
| F9   | Module structure split creates coupling risk                       | P2       | 0.68       |
| F7   | AI Fallback is reactive when it should be proactive assessment     | P2       | 0.65       |
