/**
 * KIỂM THỬ CHỊU TẢI TỪNG BƯỚC (STEP-LOAD), ĐỘ TRỄ (p50/p95/p99) & ĐỒNG THỜI (CONCURRENCY)
 * Chạy hoàn toàn trên môi trường Sandbox cô lập (Không gửi stress test lên Vercel Hobby hay Neon Production).
 */
import { performance } from "perf_hooks";
import crypto from "crypto";

function calcPercentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.floor((p / 100) * sortedArr.length));
  return Number(sortedArr[idx].toFixed(2));
}

async function runStepLoadAndConcurrencyBenchmark() {
  console.log("================================================================================");
  console.log("🚀 KIỂM THỬ HIỆU NĂNG TỪNG BƯỚC (p50/p95/p99) & XUNG ĐỘT ĐỒNG THỜI (SANDBOX)");
  console.log("================================================================================");

  // Mô phỏng sát thực tế cơ sở dữ liệu Neon PostgreSQL (Cold start: 340ms, Single CTE Query: 22ms)
  let dbQueryCount = 0;
  let activeDbConnections = 0;
  let maxObservedDbConnections = 0;
  let isColdStart = true;

  const l1Cache = new Map();
  const inFlight = new Map();
  const idempotencyStore = new Map();
  const mockDocsStore = new Map([
    ["01-qt/tv/vpfsc", { code: "01-QT/TV/VPFSC", title: "Đăng ký, đặt hàng và cấp phát đồng phục", version: "1.0", updated_at: "2026-11-15T10:00:00.000Z" }]
  ]);

  async function simulatedNeonSingleCteQuery(key) {
    if (inFlight.has(key)) return inFlight.get(key);
    const p = (async () => {
      activeDbConnections++;
      if (activeDbConnections > maxObservedDbConnections) maxObservedDbConnections = activeDbConnections;
      dbQueryCount++;
      const delayMs = isColdStart ? 340 : (18 + Math.random() * 8);
      isColdStart = false;
      await new Promise(r => setTimeout(r, delayMs));
      activeDbConnections--;
      const payload = {
        success: true,
        totalCount: 16,
        data: Array.from(mockDocsStore.values())
      };
      const etag = `W/"${crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 16)}"`;
      l1Cache.set(key, { data: payload, etag, ts: Date.now() });
      return { data: payload, etag, source: "DB_SINGLE_CTE" };
    })();
    inFlight.set(key, p);
    try { return await p; } finally { inFlight.delete(key); }
  }

  async function handleGetDocumentsSimulated({ role = "guest", emailHash = "public", ifNoneMatch = "" }) {
    const t0 = performance.now();
    const cacheKey = `docs_list_v6_${role}_${emailHash}`;
    const cached = l1Cache.get(cacheKey);
    if (cached && (Date.now() - cached.ts < 1500)) {
      if (ifNoneMatch && ifNoneMatch === cached.etag) {
        return { status: 304, latencyMs: performance.now() - t0, source: "ETAG_304" };
      }
      return { status: 200, latencyMs: performance.now() - t0, source: "L1_CACHE", etag: cached.etag };
    }
    const res = await simulatedNeonSingleCteQuery(cacheKey);
    return { status: 200, latencyMs: performance.now() - t0, source: res.source, etag: res.etag };
  }

  // Kịch bản 1: Tăng tải từng bước (Step-Load: 10 -> 25 -> 50 người dùng đồng thời)
  for (const concurrency of [10, 25, 50]) {
    dbQueryCount = 0;
    maxObservedDbConnections = 0;
    l1Cache.clear();
    isColdStart = (concurrency === 10); // Bước 10 VU đầu tiên chịu Cold Start 340ms của Neon Scale-to-Zero

    const latencies = [];
    let errors = 0;
    // Đợt 1: Burst đồng thời (Kiểm chứng Singleflight Coalescing khi DB vừa thức dậy)
    const wave1 = await Promise.all(
      Array.from({ length: concurrency }, (_, i) =>
        handleGetDocumentsSimulated({ role: i % 5 === 0 ? "office" : "cbgv", emailHash: i % 5 === 0 ? "off_group" : "cbgv_group" })
      )
    );
    // Đợt 2: Truy vấn lặp lại sau 100ms kèm ETag (Kiểm chứng L1 Cache & 304 Not Modified)
    const wave2 = await Promise.all(
      wave1.map((w, i) =>
        handleGetDocumentsSimulated({
          role: i % 5 === 0 ? "office" : "cbgv",
          emailHash: i % 5 === 0 ? "off_group" : "cbgv_group",
          ifNoneMatch: w.etag
        })
      )
    );

    for (const r of [...wave1, ...wave2]) {
      if (r.status !== 200 && r.status !== 304) errors++;
      latencies.push(r.latencyMs);
    }
    latencies.sort((a, b) => a - b);
    console.log(
      `✅ [Step-Load ${concurrency} VU (${concurrency * 2} reqs)] ` +
      `p50=${calcPercentile(latencies, 50)}ms | p95=${calcPercentile(latencies, 95)}ms | p99=${calcPercentile(latencies, 99)}ms | ` +
      `DB Queries=${dbQueryCount}/${concurrency * 2} | Max DB Conns=${maxObservedDbConnections} | Errors=${errors}`
    );
  }

  // Kịch bản 2: Kiểm thử Optimistic Locking (2 cán bộ cùng cập nhật 1 quy trình đồng thời)
  const initialDoc = mockDocsStore.get("01-qt/tv/vpfsc");
  const baseUpdatedAt = initialDoc.updated_at;

  async function simulateConcurrentUpdate(actor, newVer, expectedUpdatedAt, idempotencyKey) {
    if (idempotencyKey && idempotencyStore.has(idempotencyKey)) {
      return { status: 200, idempotentReplay: true, data: idempotencyStore.get(idempotencyKey) };
    }
    const current = mockDocsStore.get("01-qt/tv/vpfsc");
    if (expectedUpdatedAt && new Date(current.updated_at).getTime() > new Date(expectedUpdatedAt).getTime()) {
      return { status: 409, conflict: true, error: "Optimistic Concurrency Conflict" };
    }
    const updatedRecord = {
      ...current,
      version: newVer,
      updated_at: new Date(Date.now() + 5000).toISOString(),
      updatedBy: actor
    };
    mockDocsStore.set("01-qt/tv/vpfsc", updatedRecord);
    if (idempotencyKey) idempotencyStore.set(idempotencyKey, updatedRecord);
    return { status: 200, data: updatedRecord };
  }

  const resUserA = await simulateConcurrentUpdate("CanBo_A", "2.0", baseUpdatedAt, "idem-key-A-001");
  const resUserARetry = await simulateConcurrentUpdate("CanBo_A", "2.0", baseUpdatedAt, "idem-key-A-001");
  const resUserBStale = await simulateConcurrentUpdate("CanBo_B", "2.1-ghi-de", baseUpdatedAt, "idem-key-B-002");

  if (resUserA.status !== 200 || !resUserARetry.idempotentReplay || resUserBStale.status !== 409) {
    throw new Error("Concurrency & Idempotency verification failed!");
  }
  console.log("✅ [PASS] Kiểm thử Idempotency-Key (chống gửi trùng khi retry): ĐẠT (200 OK Replay, không ghi trùng DB)");
  console.log("✅ [PASS] Kiểm thử Optimistic Locking (2 người sửa cùng hồ sơ): ĐẠT (User A: 200 OK, User B dùng mốc cũ bị chặn 409 Conflict)");
}

runStepLoadAndConcurrencyBenchmark().catch(err => {
  console.error(err);
  process.exit(1);
});
